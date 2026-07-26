package com.kanban.domain.report.service;

import com.kanban.domain.report.ReportType;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 자료실의 보고서 폴더 이름 규칙. 발송(신규 생성)과 백필(과거 파일 정리)이 <b>같은 이름</b>을 써야
 * 같은 보고서의 파일이 한 폴더로 모이므로 한곳에 둔다.
 *
 * <pre>
 * 보고서 자료/2026-07/일일 보고서 07-26
 * 보고서 자료/2026-07/주간 보고서 07-20~07-26
 * </pre>
 */
public final class ReportFolderNaming {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("MM-dd");
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    private ReportFolderNaming() {
    }

    /** 월 폴더 키 겸 이름 ({@code 2026-07}). 보고서 기간의 끝 날짜를 기준으로 삼는다. */
    public static String monthKey(LocalDate periodEnd) {
        return periodEnd.format(MONTH);
    }

    /** 자료실에서 한눈에 읽히도록 종류를 앞세운다. */
    public static String folderName(ReportType reportType, LocalDate periodStart, LocalDate periodEnd) {
        String end = periodEnd.format(DATE);
        if (reportType == ReportType.WEEKLY_INTEGRATED) {
            return "주간 보고서 " + periodStart.format(DATE) + "~" + end;
        }
        return "일일 보고서 " + end;
    }
}
