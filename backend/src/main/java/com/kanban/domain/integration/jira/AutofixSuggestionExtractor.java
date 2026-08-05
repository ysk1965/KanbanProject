package com.kanban.domain.integration.jira;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 에이전트 로그에서 <b>사람이 할 일을 적은 보고 블록</b>만 뽑아낸다.
 *
 * <p><b>왜 필요한가.</b> 러너는 결과와 무관하게 에이전트 로그 꼬리를 {@code log_excerpt}로 보내고
 * 서버는 그것을 통째로 저장한다. 그런데 그 6000바이트를 전부 보여주는 곳은 도크의 "에이전트 로그"
 * 하나뿐이라, 정작 사람이 읽어야 할 두세 줄이 로그 더미에 묻힌다. 특히 {@code NO_CHANGE}는
 * 카드·JIRA 어디에도 "자동으로 고칠 수 없다고 판단했습니다" 한 문장만 남는데, 이것은 사실상
 * 아무 정보도 아니다 — 무엇을 어떻게 고쳐야 하는지는 에이전트가 이미 알아냈고 로그에 적어 뒀다.
 *
 * <p><b>변경 없음이 정답인 경로가 있다.</b> 로컬라이즈 정본이 저장소 밖(구글 시트)이면 저장소의
 * {@code .asset}을 고쳐봐야 다음 익스포트에 덮어쓰인다. 그 경우 올바른 산출물은 PR이 아니라
 * "원본의 이 항목을 이렇게 바꿔라"는 보고다. 그 보고가 화면에 닿지 않으면 파이프라인이 일을
 * 하고도 아무것도 안 한 것처럼 보인다.
 *
 * <p><b>왜 로그를 파싱하는가.</b> 러너가 구조화된 필드로 보내는 것이 옳지만 그것은 작업 명세
 * 계약({@link AutofixRunnerContract})을 올리는 변경이라 맥의 러너 재배포가 따라온다. 서버만
 * 고쳐서 오늘 값을 전달할 수 있으면 그쪽이 먼저다. 계약을 올릴 때 이 클래스는 폴백으로 남는다 —
 * 구버전 러너가 보낸 로그에서도 보고는 계속 읽혀야 한다.
 *
 * <p><b>한계.</b> {@code log_excerpt}는 로그의 <b>꼬리</b>다. 에이전트가 보고 뒤에 말을 많이
 * 하면 블록이 잘려 나간다. 프롬프트가 보고를 마지막에 출력하게 하고 있어 대체로 살아남지만
 * 보장은 아니다 — 잘린 블록을 반쯤 보여주느니 버리는 쪽을 택한다({@link #MIN_LINES}).
 */
public final class AutofixSuggestionExtractor {

    /**
     * 블록 머리글. 프롬프트가 지시하는 형식과 1:1로 맞춘다.
     *
     * <p>대괄호 안에 "필요"로 끝나는 말머리를 쓰는 것이 규약이다(수정 필요 / 추가 필요).
     * 여기에 하나를 더할 때는 프롬프트의 출력 형식도 같은 커밋에서 바꾼다 — 형식이 갈라지면
     * 에이전트는 옛 형식으로 쓰고 서버는 새 형식을 찾아 아무것도 못 뽑는다.
     */
    private static final Pattern HEADER =
            Pattern.compile("^\\s*\\[[^\\]]*(?:필요|해야 할 일)[^\\]]*\\]\\s*$");

    /** 블록의 몸통. {@code - 항목: …} 꼴의 줄. */
    private static final Pattern BODY = Pattern.compile("^\\s*-\\s.*$");

    /**
     * 러너 자신이 찍는 줄. 에이전트 로그 파일에는 러너 로그가 뒤이어 붙는다.
     *
     * <p>이걸 거르지 않으면 마지막 항목의 「- 근거: …」에 {@code [12:08:59] 변경 없음 …}이
     * 이어 붙어, 사람이 원본에 옮겨 적을 값 끝에 로그가 섞인다. 실제로 그렇게 나왔다.
     */
    private static final Pattern RUNNER_LOG = Pattern.compile("^\\s*\\[\\d{2}:\\d{2}:\\d{2}].*$");

    /**
     * 머리글 + 최소 한 줄. 머리글만 남은 블록은 버린다.
     *
     * <p>{@code log_excerpt}는 로그의 <b>꼬리</b>라 잘리는 쪽은 앞이다. 그래서 잘린 블록은
     * 머리글이 먼저 사라져 수집 자체가 시작되지 않는다 — 여기서 거르는 것은 "머리글만 찍히고
     * 몸통을 못 쓴 채 끝난" 경우다.
     */
    private static final int MIN_LINES = 2;

    /** 카드 댓글·JIRA 댓글에 얹을 상한. 이보다 길면 도크의 에이전트 로그를 봐야 한다. */
    private static final int MAX_LENGTH = 3000;

    private AutofixSuggestionExtractor() {}

    /**
     * 보고 블록을 원문 그대로 이어 붙여 돌려준다.
     *
     * <p>내용을 다시 쓰지 않는다. 에이전트가 "키 못 찾음"이라고 적었으면 그대로 나가야 한다 —
     * 요약하거나 다듬는 순간 사람이 원본에 옮겨 적을 값의 신뢰도가 여기서 한 단계 떨어진다.
     *
     * @param logExcerpt 러너가 보낸 에이전트 로그 꼬리. null이면 null을 돌려준다.
     * @return 보고 블록들, 없으면 null
     */
    public static String extract(String logExcerpt) {
        if (logExcerpt == null || logExcerpt.isBlank()) return null;

        List<String> blocks = new ArrayList<>();
        List<String> current = null;
        int headerIndent = 0;

        for (String line : logExcerpt.split("\\R", -1)) {
            if (HEADER.matcher(line).matches()) {
                flush(blocks, current);
                current = new ArrayList<>();
                current.add(line.strip());
                headerIndent = indentOf(line);
                continue;
            }
            if (current == null) continue;

            if (BODY.matcher(line).matches()) {
                current.add(line.strip());
            } else if (line.isBlank()) {
                // 블록 사이의 빈 줄. 블록을 끝내되 그 자체를 담지는 않는다.
                flush(blocks, current);
                current = null;
            } else if (current.size() > 1 && isContinuation(line, headerIndent)) {
                // 「- 변경: …」이 줄바꿈된 뒷부분. 앞줄에 이어 붙인다.
                current.set(current.size() - 1,
                        current.get(current.size() - 1) + " " + line.strip());
            } else {
                flush(blocks, current);
                current = null;
            }
        }
        flush(blocks, current);

        if (blocks.isEmpty()) return null;
        String joined = String.join("\n\n", blocks);
        return joined.length() > MAX_LENGTH
                ? joined.substring(0, MAX_LENGTH) + "\n…(생략 — 전체는 도크의 에이전트 로그)"
                : joined;
    }

    /**
     * 앞줄에 이어 붙일 수 있는 줄인가.
     *
     * <p>블록의 들여쓰기 밖으로 나온 줄은 보고가 끝나고 다른 것이 시작된 것으로 본다. 에이전트가
     * 보고를 들여 쓰고 러너 로그는 왼쪽 끝에서 시작하므로, 이 한 줄이 둘을 가른다. 들여쓰기가
     * 없는 보고를 대비해 러너 로그 형태도 함께 막는다.
     */
    private static boolean isContinuation(String line, int headerIndent) {
        return !RUNNER_LOG.matcher(line).matches() && indentOf(line) >= headerIndent;
    }

    private static int indentOf(String line) {
        int i = 0;
        while (i < line.length() && Character.isWhitespace(line.charAt(i))) i++;
        return i;
    }

    private static void flush(List<String> blocks, List<String> current) {
        if (current != null && current.size() >= MIN_LINES) {
            blocks.add(String.join("\n", current));
        }
    }
}
