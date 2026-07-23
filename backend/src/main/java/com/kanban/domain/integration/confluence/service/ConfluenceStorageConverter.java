package com.kanban.domain.integration.confluence.service;

import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Confluence storage 포맷(XHTML)을 AI에 넣을 평문으로 바꾼다.
 *
 * <p>표를 마크다운으로 살리는 게 핵심이다. 주간보고는 표로 쓰는 팀이 많은데,
 * 태그만 벗기면 셀 값이 줄줄이 이어붙어 무엇이 항목이고 무엇이 값인지 알 수 없게 된다.
 */
@Component
public class ConfluenceStorageConverter {

    private static final Pattern SCRIPT_OR_STYLE =
            Pattern.compile("(?is)<(script|style)[^>]*>.*?</\\1>");
    private static final Pattern TABLE = Pattern.compile("(?is)<table[^>]*>(.*?)</table>");
    private static final Pattern ROW = Pattern.compile("(?is)<tr[^>]*>(.*?)</tr>");
    private static final Pattern CELL = Pattern.compile("(?is)<(td|th)[^>]*>(.*?)</\\1>");
    private static final Pattern LIST_ITEM = Pattern.compile("(?is)<li[^>]*>(.*?)</li>");
    private static final Pattern HEADING = Pattern.compile("(?is)<h([1-6])[^>]*>(.*?)</h\\1>");
    private static final Pattern BLOCK_END =
            Pattern.compile("(?i)</(p|div|br|tr|h[1-6]|li|ac:layout-cell)\\s*/?>");
    private static final Pattern TAG = Pattern.compile("(?s)<[^>]+>");
    private static final Pattern BLANK_LINES = Pattern.compile("\\n{3,}");

    /** 지나치게 긴 페이지는 잘라낸다 — 토큰만 먹고 요약 품질은 오르지 않는다. */
    private static final int MAX_LENGTH = 8000;

    public String toPlainText(String storageHtml) {
        if (storageHtml == null || storageHtml.isBlank()) {
            return "";
        }
        String working = SCRIPT_OR_STYLE.matcher(storageHtml).replaceAll("");
        working = convertTables(working);
        working = convertHeadings(working);
        working = LIST_ITEM.matcher(working).replaceAll(m -> "- " + stripTags(m.group(1)) + "\n");
        working = BLOCK_END.matcher(working).replaceAll("\n");
        working = stripTags(working);
        working = unescape(working);
        working = BLANK_LINES.matcher(working).replaceAll("\n\n").trim();

        if (working.length() > MAX_LENGTH) {
            return working.substring(0, MAX_LENGTH) + "\n…(이하 생략)";
        }
        return working;
    }

    private String convertHeadings(String html) {
        Matcher matcher = HEADING.matcher(html);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String hashes = "#".repeat(Integer.parseInt(matcher.group(1)));
            matcher.appendReplacement(out,
                    Matcher.quoteReplacement("\n" + hashes + " " + stripTags(matcher.group(2)) + "\n"));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    private String convertTables(String html) {
        Matcher tableMatcher = TABLE.matcher(html);
        StringBuilder out = new StringBuilder();
        while (tableMatcher.find()) {
            tableMatcher.appendReplacement(out,
                    Matcher.quoteReplacement("\n" + convertOneTable(tableMatcher.group(1)) + "\n"));
        }
        tableMatcher.appendTail(out);
        return out.toString();
    }

    private String convertOneTable(String tableInner) {
        StringBuilder table = new StringBuilder();
        Matcher rowMatcher = ROW.matcher(tableInner);
        boolean headerWritten = false;

        while (rowMatcher.find()) {
            Matcher cellMatcher = CELL.matcher(rowMatcher.group(1));
            StringBuilder row = new StringBuilder("|");
            int cellCount = 0;
            while (cellMatcher.find()) {
                row.append(' ')
                   .append(stripTags(cellMatcher.group(2)).replace("|", "\\|").trim())
                   .append(" |");
                cellCount++;
            }
            if (cellCount == 0) {
                continue;
            }
            table.append(row).append('\n');
            if (!headerWritten) {
                table.append("|").append(" --- |".repeat(cellCount)).append('\n');
                headerWritten = true;
            }
        }
        return table.toString();
    }

    private String stripTags(String html) {
        return unescape(TAG.matcher(html).replaceAll(" ")).replaceAll("[ \\t]+", " ").trim();
    }

    private String unescape(String text) {
        return text.replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'");
    }
}
