import { getTodayDateString } from "./dateUtils";

/**
 * 새 문서 템플릿 — BlockNote PartialBlock[] JSON 문자열을 만든다.
 *
 * id는 비우고(에디터가 채움) props는 필요한 것만 적는다. 표 헤더는 headerRows
 * 대신 굵은 텍스트로 표현한다 — 버전 미리보기용 변환기는 tables.headers를
 * 켜지 않아 headerRows가 있으면 replaceBlocks가 실패하기 때문.
 *
 * 블록 타입·props는 components/notes/blocks/schema.ts(기본 블록 + callout 등)와
 * 일치해야 한다.
 */

type Translate = (key: string, defaultValue: string) => string;

export interface NoteTemplate {
  id: "meeting" | "retro" | "spec" | "weekly";
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  /** 문서 제목과 BlockNote JSON 본문 */
  build: (t: Translate) => { title: string; content: string };
}

type Inline = string | { type: "text"; text: string; styles: Record<string, boolean> };

interface PartialBlock {
  type: string;
  props?: Record<string, unknown>;
  content?: Inline[] | string | TableContent;
  children?: PartialBlock[];
}

interface TableContent {
  type: "tableContent";
  rows: { cells: Inline[][] }[];
}

const heading = (text: string, level: 1 | 2 | 3 = 2): PartialBlock => ({
  type: "heading",
  props: { level },
  content: text,
});

const paragraph = (text = ""): PartialBlock => ({
  type: "paragraph",
  content: text,
});

const bullet = (text = ""): PartialBlock => ({
  type: "bulletListItem",
  content: text,
});

const check = (text = ""): PartialBlock => ({
  type: "checkListItem",
  props: { checked: false },
  content: text,
});

const callout = (
  text: string,
  type: "info" | "warning" | "success" | "error" = "info",
): PartialBlock => ({
  type: "callout",
  props: { type },
  content: text,
});

const bold = (text: string): Inline => ({
  type: "text",
  text,
  styles: { bold: true },
});

const table = (headers: string[], bodyRows = 2): PartialBlock => ({
  type: "table",
  content: {
    type: "tableContent",
    rows: [
      { cells: headers.map((h) => [bold(h)]) },
      ...Array.from({ length: bodyRows }, () => ({
        cells: headers.map(() => [""] as Inline[]),
      })),
    ],
  },
});

const serialize = (blocks: PartialBlock[]) => JSON.stringify(blocks);

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "meeting",
    labelKey: "notes.templates.meeting",
    defaultLabel: "회의록",
    descriptionKey: "notes.templates.meetingDesc",
    defaultDescription: "안건 · 결정 사항 · 액션 아이템",
    build: (t) => {
      const today = getTodayDateString();
      return {
        title: `${t("notes.templates.meeting", "회의록")} ${today}`,
        content: serialize([
          heading(t("notes.templates.meeting", "회의록"), 1),
          paragraph(`${t("notes.templates.date", "날짜")}: ${today}`),
          paragraph(`${t("notes.templates.attendees", "참석자")}: `),
          heading(t("notes.templates.agenda", "안건")),
          bullet(),
          bullet(),
          heading(t("notes.templates.decisions", "결정 사항")),
          bullet(),
          heading(t("notes.templates.actionItems", "액션 아이템")),
          check(),
          check(),
          paragraph(),
        ]),
      };
    },
  },
  {
    id: "retro",
    labelKey: "notes.templates.retro",
    defaultLabel: "스프린트 회고",
    descriptionKey: "notes.templates.retroDesc",
    defaultDescription: "잘한 점 · 아쉬운 점 · 시도할 것",
    build: (t) => {
      const good = t("notes.templates.wentWell", "잘한 점");
      const bad = t("notes.templates.toImprove", "아쉬운 점");
      const next = t("notes.templates.toTry", "시도할 것");
      return {
        title: t("notes.templates.retro", "스프린트 회고"),
        content: serialize([
          heading(t("notes.templates.retro", "스프린트 회고"), 1),
          paragraph(
            `${t("notes.templates.sprint", "스프린트")}: · ${t("notes.templates.date", "날짜")}: ${getTodayDateString()}`,
          ),
          heading(good),
          bullet(),
          heading(bad),
          bullet(),
          heading(next),
          bullet(),
          heading(t("notes.templates.summaryTable", "한눈에 보기")),
          table([good, bad, next]),
          paragraph(),
        ]),
      };
    },
  },
  {
    id: "spec",
    labelKey: "notes.templates.spec",
    defaultLabel: "기획서",
    descriptionKey: "notes.templates.specDesc",
    defaultDescription: "배경 · 목표 · 범위 · 일정 · 리스크",
    build: (t) => ({
      title: t("notes.templates.spec", "기획서"),
      content: serialize([
        heading(t("notes.templates.spec", "기획서"), 1),
        heading(t("notes.templates.background", "배경")),
        paragraph(),
        heading(t("notes.templates.goal", "목표")),
        callout(
          t("notes.templates.goalHint", "이 기획으로 달성하려는 핵심 목표를 한 문장으로 적어주세요."),
          "info",
        ),
        paragraph(),
        heading(t("notes.templates.scope", "범위")),
        bullet(`${t("notes.templates.inScope", "포함")}: `),
        bullet(`${t("notes.templates.outOfScope", "제외")}: `),
        heading(t("notes.templates.schedule", "일정")),
        paragraph(),
        heading(t("notes.templates.risks", "리스크")),
        bullet(),
        paragraph(),
      ]),
    }),
  },
  {
    id: "weekly",
    labelKey: "notes.templates.weekly",
    defaultLabel: "주간 보고",
    descriptionKey: "notes.templates.weeklyDesc",
    defaultDescription: "이번 주 진행 · 다음 주 계획 · 이슈",
    build: (t) => {
      const today = getTodayDateString();
      return {
        title: `${t("notes.templates.weekly", "주간 보고")} ${today}`,
        content: serialize([
          heading(t("notes.templates.weekly", "주간 보고"), 1),
          paragraph(`${t("notes.templates.date", "날짜")}: ${today}`),
          heading(t("notes.templates.thisWeek", "이번 주 진행")),
          bullet(),
          bullet(),
          heading(t("notes.templates.nextWeek", "다음 주 계획")),
          bullet(),
          heading(t("notes.templates.issues", "이슈")),
          bullet(),
          paragraph(),
        ]),
      };
    },
  },
];
