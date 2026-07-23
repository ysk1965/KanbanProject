package com.kanban.domain.report;

public enum ReportType {
    /** 사용자가 직접 생성하는 팀 리포트 */
    TEAM,
    /** 사용자가 직접 생성하는 개인 리포트 */
    PERSONAL,
    /** 매일 09:00 자동 발송 — 전날 GitHub 커밋 기반 */
    DAILY_DEV,
    /** 매주 토요일 09:00 자동 발송 — 칸반 + 그 주 커밋 + Confluence 주간보고 */
    WEEKLY_INTEGRATED
}
