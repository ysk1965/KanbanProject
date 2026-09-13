import type { NoteStatus } from "./api";

/**
 * 노트 페이지 상태 — 초안 / 검토 중 / 완료. null이면 상태 없음.
 * 칩 색상은 뱃지 규칙(bg-{color}/15 + 텍스트만 dark: 분기)을 따른다.
 */
export const NOTE_STATUSES: NoteStatus[] = ["DRAFT", "IN_REVIEW", "DONE"];

interface NoteStatusMeta {
  /** i18n 키 (notes.status.*) */
  labelKey: string;
  /** 한국어 기본 라벨 */
  defaultLabel: string;
  /** 칩 클래스 (배경 + 텍스트) */
  chipClass: string;
  /** 트리 행의 작은 점 색상 */
  dotClass: string;
}

const META: Record<NoteStatus, NoteStatusMeta> = {
  DRAFT: {
    labelKey: "notes.status.draft",
    defaultLabel: "초안",
    chipClass: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    dotClass: "bg-slate-400",
  },
  IN_REVIEW: {
    labelKey: "notes.status.inReview",
    defaultLabel: "검토 중",
    chipClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    dotClass: "bg-amber-500",
  },
  DONE: {
    labelKey: "notes.status.done",
    defaultLabel: "완료",
    chipClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    dotClass: "bg-emerald-500",
  },
};

export function getNoteStatusMeta(status: NoteStatus): NoteStatusMeta {
  return META[status];
}

/** 서버가 모르는 값을 내려도 렌더가 깨지지 않게 좁혀 준다 */
export function asNoteStatus(
  value: string | null | undefined,
): NoteStatus | null {
  return value && value in META ? (value as NoteStatus) : null;
}
