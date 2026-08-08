import { useMemo } from "react";

/**
 * 보드 화면 복잡도 — 게이팅의 단일 소스.
 *
 * 설계: `docs/Design/level-model.html`
 *
 * 축이 둘이고 성격이 다르다.
 *  · **레벨**  = 시간을 몇 겹으로 묶는가. 사다리(1→2→3)라 건너뛸 수 없고, 올릴 때 데이터 정리가 따라온다.
 *  · **옵션**  = 레벨과 무관한 켜기/끄기. 순서가 없고 켜도 정리할 게 없다.
 *
 * 레벨과 **무관하게 항상 있는 것**은 여기서 다루지 않는다 —
 * 묶음▸작업▸할 일 구조, 할 일 줄의 담당자, 그리고 흐름 컬럼(In Review·Done).
 * 일은 마감이 없어도 흐르므로 흐름 축은 1단계에도 있다.
 */

/** 시간 묶음 깊이. 화면에서 감추기만 할 뿐 데이터는 레벨과 무관하게 그대로 있다. */
export type BoardUiLevel = 1 | 2 | 3;

/** 레벨과 직교하는 옵션 키. 백엔드 `UiOption`과 1:1. */
export type BoardUiOption = "members" | "review" | "timeblock" | "jira";

const ALL_OPTIONS: BoardUiOption[] = ["members", "review", "timeblock", "jira"];

/**
 * 응답에 값이 없을 때의 폴백은 **최고 레벨 + 전 옵션**이다.
 * 마이그레이션 이전 응답이나 캐시된 옛 보드가 들어와도 화면이 갑자기 줄지 않게 한다 —
 * 잘못 열리는 쪽이 잘못 닫히는 쪽보다 안전하다.
 */
const FALLBACK_LEVEL: BoardUiLevel = 3;

export interface BoardUiSource {
  ui_level?: number | null;
  ui_options?: string | null;
}

export interface BoardFeatures {
  /** 1 | 2 | 3 */
  level: BoardUiLevel;
  /** 직교 옵션이 켜져 있는가. */
  has: (option: BoardUiOption) => boolean;
  /** 켜진 옵션 목록 (저장 문자열을 만들 때 쓴다). */
  options: BoardUiOption[];

  /** 주기(스프린트) 레이어를 화면에 세우는가 — 레벨 2 이상. */
  showSprint: boolean;
  /** 단계(마일스톤) 레이어를 화면에 세우는가 — 레벨 3. */
  showMilestone: boolean;
  /** 담기/백로그 구분이 있는가 (= 주기가 있는가). */
  showBacklog: boolean;
  /** 카드에 기간 배지를 붙이는가 (= 상속해줄 주기가 있는가). */
  showTaskPeriod: boolean;

  /** 다음 레벨 (3이면 null). 승급 제안·서랍이 쓴다. */
  nextLevel: BoardUiLevel | null;
  /** 이전 레벨 (1이면 null). */
  prevLevel: BoardUiLevel | null;
}

function normalizeLevel(raw: number | null | undefined): BoardUiLevel {
  if (raw === 1 || raw === 2 || raw === 3) return raw;
  return FALLBACK_LEVEL;
}

function parseOptions(raw: string | null | undefined): BoardUiOption[] {
  // null/undefined = 아직 모름 → 전부 켜진 것으로 본다(위 폴백과 같은 이유).
  // 빈 문자열은 "명시적으로 전부 껐다"이므로 구분해서 처리한다.
  if (raw === null || raw === undefined) return [...ALL_OPTIONS];
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return ALL_OPTIONS.filter((o) => set.has(o));
}

export function resolveBoardFeatures(
  source: BoardUiSource | null | undefined,
): BoardFeatures {
  const level = normalizeLevel(source?.ui_level);
  const options = parseOptions(source?.ui_options);
  const optionSet = new Set(options);

  return {
    level,
    options,
    has: (option) => optionSet.has(option),
    showSprint: level >= 2,
    showMilestone: level >= 3,
    showBacklog: level >= 2,
    showTaskPeriod: level >= 2,
    nextLevel: level < 3 ? ((level + 1) as BoardUiLevel) : null,
    prevLevel: level > 1 ? ((level - 1) as BoardUiLevel) : null,
  };
}

/** 옵션 목록 → 저장 문자열. 선언 순서로 정규화해 같은 조합이 항상 같은 문자열이 된다. */
export function serializeBoardOptions(options: BoardUiOption[]): string {
  const set = new Set(options);
  return ALL_OPTIONS.filter((o) => set.has(o)).join(",");
}

export function useBoardFeatures(
  source: BoardUiSource | null | undefined,
): BoardFeatures {
  return useMemo(
    () => resolveBoardFeatures(source),
    [source?.ui_level, source?.ui_options],
  );
}
