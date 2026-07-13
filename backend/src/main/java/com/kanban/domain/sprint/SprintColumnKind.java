package com.kanban.domain.sprint;

/**
 * 스프린트 보드 컬럼 종류.
 * <ul>
 *   <li>{@code START} — 입구("Sprint"). 담기 기본 위치. 고정(삭제/이동 불가), 마일스톤당 1개.</li>
 *   <li>{@code MIDDLE} — 중간 작업 단계. 자유롭게 추가/이름변경/순서변경/삭제. 기본 "In Review" 포함.</li>
 *   <li>{@code END} — 출구("Done"). 도달 시 부모 체크리스트 항목이 완료로 동기화. 고정, 마일스톤당 1개.</li>
 * </ul>
 */
public enum SprintColumnKind {
    START,
    MIDDLE,
    END
}
