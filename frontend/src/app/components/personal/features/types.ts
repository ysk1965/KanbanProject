import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * 마이 스페이스 「기능」 탭 공통 계약.
 * 기획서: docs/Design/myspace-features-timetable.html
 *
 * - 기능(feature) = 왼쪽 패널의 1단 탭. 레지스트리(registry.ts)에 한 줄 추가하면 나타난다.
 * - 문서(doc) = 기능 아래 2단 항목. 서버의 personal_feature_docs 한 행.
 * - 기능은 자기 content 스키마만 안다. 자동 저장·제목·복제·삭제·PDF 버튼은 FeatureDocShell이 담당.
 */

/** API JSON (snake_case) — 목록용, content 없음 */
export interface PersonalFeatureDocSummary {
  id: string;
  feature_key: string;
  title: string;
  schema_ver: number;
  created_at: string;
  updated_at: string;
}

/** API JSON (snake_case) — 상세, content 포함 */
export interface PersonalFeatureDoc<C = unknown> extends PersonalFeatureDocSummary {
  content: C;
}

/** API JSON — 추천 용어 한 건 */
export interface PersonalFeatureTerm {
  field: string;
  value: string;
  color: string | null;
  use_count: number;
  last_used_at: string;
}

export interface FeatureEditorProps<C = unknown> {
  doc: PersonalFeatureDoc<C>;
  /** 내용이 바뀔 때마다 새 content 객체를 넘긴다 (셸이 디바운스 저장). */
  onChange: (content: C) => void;
  /** 추천 용어(열 이름별). 셸이 문서를 열 때 한 번 받아 둔다. */
  terms: PersonalFeatureTerm[];
  /** 추천 항목의 ✕ — 서버 기억 삭제 후 terms를 갱신한다. */
  onForgetTerm: (field: string, value: string) => void;
  /** 폭 640px 미만 등 편집 불가 상황이면 true (읽기 + PDF만). */
  readOnly?: boolean;
}

export interface FeaturePrintProps<C = unknown> {
  doc: PersonalFeatureDoc<C>;
}

export interface PersonalFeature<C = unknown> {
  /** 서버 feature_key 와 동일. 예: 'timetable' */
  key: string;
  /** i18n 키. 예: personal.features.timetable */
  labelKey: string;
  /** i18n 키. 예: personal.features.timetable_new ("새 시간표") */
  newDocLabelKey: string;
  icon: LucideIcon;
  status: "ready" | "soon";
  /** 새 문서의 기본 제목 (i18n 키) */
  defaultTitleKey: string;
  /** 새 문서 content 템플릿 */
  createDefault: () => C;
  Editor: ComponentType<FeatureEditorProps<C>>;
  /** 있으면 셸이 「PDF 내보내기」 버튼을 보여 주고 window.print()를 연결한다. */
  PrintSheet?: ComponentType<FeaturePrintProps<C>>;
}

/* ───────────── 시간표 (feature_key: 'timetable') content 스키마 v1 ───────────── */

export type TimetableCellColor = "" | "red" | "orange" | "purple" | "yellow" | "green" | "blue";

export interface TimetableColumn {
  key: string; // 'c1', 'c2' … 문서 안에서 고유
  label: string; // 열 이름. 추천 기억의 키이기도 하다 ('장소', '비고' …)
  width: number | null; // % 또는 null(균등)
  type: "time" | "text";
  suggest: boolean;
}

export interface TimetableCell {
  t: string; // 텍스트 (줄바꿈 \n 허용). 시간 열은 "13:00 – 14:30" 정규화
  c?: TimetableCellColor; // 글자색 이름
  span?: number; // 세로 병합: 대표 셀에만, 아래로 n행 (>=2). 덮인 셀은 값을 유지한 채 그리지 않는다
}

export type TimetableRow = Record<string, TimetableCell>; // column.key → cell

export interface TimetableDay {
  date: string; // yyyy-MM-dd ('' 허용)
  rows: TimetableRow[];
}

export interface TimetableContent {
  /** @deprecated 예전 문서 호환용. UI·인쇄에서 더 이상 쓰지 않는다 */
  version_label?: string;
  /** @deprecated 예전 문서 호환용. 우상단 장소는 표의 「장소」 열에서 자동으로 모은다 */
  place_note?: string;
  columns: TimetableColumn[];
  days: TimetableDay[];
}

export const TIMETABLE_FEATURE_KEY = "timetable";
export const TIMETABLE_SCHEMA_VER = 1;
