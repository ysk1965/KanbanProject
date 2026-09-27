import { Table2, ListMusic, ClipboardCheck } from "lucide-react";
import type { PersonalFeature } from "./types";
import { TIMETABLE_SCHEMA_VER } from "./types";
import { TimetableEditor } from "./timetable/TimetableEditor";
import { TimetablePrintSheet } from "./timetable/TimetablePrintSheet";
import { createDefaultTimetable } from "./timetable/timetableModel";

/**
 * 마이 스페이스 「기능」 탭 레지스트리.
 * 기획서: docs/Design/myspace-features-timetable.html §07
 *
 * 왼쪽 패널(PersonalFeatures)과 오른쪽 셸(FeatureDocShell)은 이 배열만 읽는다.
 * 새 기능은 여기에 한 줄 추가하면 나타난다. 페이지 코드는 건드리지 않는다.
 */

/** status:'soon' 자리 표시용 — 열리는 일이 없으므로 아무것도 그리지 않는다. */
const SoonEditor = () => null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PERSONAL_FEATURES: PersonalFeature<any>[] = [
  {
    key: "timetable",
    labelKey: "personal.features.timetable",
    newDocLabelKey: "personal.features.timetable_new",
    defaultTitleKey: "personal.features.timetable_default_title",
    icon: Table2,
    status: "ready",
    createDefault: createDefaultTimetable,
    Editor: TimetableEditor,
    PrintSheet: TimetablePrintSheet,
  },
  {
    key: "songlist",
    labelKey: "personal.features.songlist",
    newDocLabelKey: "personal.features.songlist",
    defaultTitleKey: "personal.features.songlist",
    icon: ListMusic,
    status: "soon",
    createDefault: () => ({}),
    Editor: SoonEditor,
  },
  {
    key: "attendance",
    labelKey: "personal.features.attendance",
    newDocLabelKey: "personal.features.attendance",
    defaultTitleKey: "personal.features.attendance",
    icon: ClipboardCheck,
    status: "soon",
    createDefault: () => ({}),
    Editor: SoonEditor,
  },
];

/** 새 문서 생성 시 보내는 schema_ver. 계약 타입(types.ts)에 없어 여기서 관리한다. */
export const FEATURE_SCHEMA_VER: Record<string, number> = {
  timetable: TIMETABLE_SCHEMA_VER,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFeature(key: string): PersonalFeature<any> | undefined {
  return PERSONAL_FEATURES.find((f) => f.key === key);
}
