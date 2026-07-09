/**
 * 마일스톤 색상 시스템
 *
 * assigneeColor.ts 와 동일한 철학이나, 배정 방식이 다르다.
 * - 담당자: 이름 해시 → 색 (개수 무관, 충돌 허용)
 * - 마일스톤: 정렬 순서(index) → 색 (인접 마일스톤이 항상 최대 대비)
 *
 * 팔레트는 색상환을 지그재그로 순회하도록 나열되어 있어,
 * 순서대로 배정하면 이웃한 마일스톤끼리 색이 확실히 구분된다.
 * 12색을 넘으면 순환하며, 그 경우 수동 색(hex) 지정으로 덮어쓸 수 있다.
 */

export interface MilestoneColor {
  /** 팔레트 색 이름 (custom hex인 경우 'custom') */
  name: string;
  /** 솔리드 hex — 점/바/텍스트에 사용 */
  hex: string;
}

/** 인접 최대 대비를 위해 색상환 지그재그 순으로 나열한 12색 (다크·라이트 모두 400계열 톤) */
export const MILESTONE_PALETTE: MilestoneColor[] = [
  { name: "rose", hex: "#FB7185" },
  { name: "sky", hex: "#38BDF8" },
  { name: "amber", hex: "#FBBF24" },
  { name: "violet", hex: "#A78BFA" },
  { name: "emerald", hex: "#34D399" },
  { name: "orange", hex: "#FB923C" },
  { name: "blue", hex: "#60A5FA" },
  { name: "lime", hex: "#A3E635" },
  { name: "fuchsia", hex: "#E879F9" },
  { name: "teal", hex: "#2DD4BF" },
  { name: "indigo", hex: "#818CF8" },
  { name: "pink", hex: "#F472B6" },
];

const PALETTE_SIZE = MILESTONE_PALETTE.length;

function isCustomHex(color?: string | null): color is string {
  return !!color && color.startsWith("#");
}

/** djb2 해시 — map을 못 받은 렌더 사이트의 fallback 전용 (순서 정보가 없을 때) */
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

/**
 * hex 색을 rgba 틴트로 변환. 칩 배경 등 은은한 틴트에 사용.
 * #RGB / #RRGGBB 지원. 그 외 형식은 그대로 반환.
 */
export function withAlpha(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 순서(index)로 마일스톤 색을 얻는다.
 * customColor(hex)가 있으면 그것으로 덮어쓴다. (향후 수동 지정용)
 */
export function getMilestoneColorByIndex(
  index: number,
  customColor?: string | null,
): MilestoneColor {
  if (isCustomHex(customColor)) return { name: "custom", hex: customColor };
  const i = ((index % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
  return MILESTONE_PALETTE[i];
}

/** map을 못 받은 사이트용 안정 fallback — id 해시로 색 배정 (색이 아예 안 나오는 상황 방지) */
export function getMilestoneColorFallback(id: string): MilestoneColor {
  return MILESTONE_PALETTE[hashId(id) % PALETTE_SIZE];
}

/** id→색 맵 타입 (memberColorMap과 동일하게 plain object 관례) */
export type MilestoneColorMap = Record<string, MilestoneColor>;

/**
 * 마일스톤 배열(배열 순서 = 색 배정 기준)로 id→색 맵을 만든다.
 * milestones는 useBoardDataLoader의 단일 소스라 어느 컴포넌트에서 만들어도 순서가 같다.
 * (memberColorMap 패턴 — 만들어서 하위로 내려주거나, 각자 로컬 useMemo로 만들어 쓴다.)
 */
export function buildMilestoneColorMap(
  milestones: Array<{ id: string; color?: string | null }>,
): MilestoneColorMap {
  const map: MilestoneColorMap = {};
  milestones.forEach((m, i) => {
    map[m.id] = getMilestoneColorByIndex(i, m.color);
  });
  return map;
}

/**
 * 렌더 사이트 공용 조회 헬퍼.
 * map이 있으면 순서 기반 색을, 없으면 id 해시 fallback을 반환한다.
 */
export function resolveMilestoneColor(
  id: string | null | undefined,
  map?: MilestoneColorMap | null,
): MilestoneColor {
  if (id && map && map[id]) return map[id];
  if (id) return getMilestoneColorFallback(id);
  return MILESTONE_PALETTE[0];
}
