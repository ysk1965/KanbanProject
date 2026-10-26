import type { ShareFields, ShareHighlight } from './groupApi';

/**
 * 같은 설교를 들은 두 사람의 밑줄 비교 — 구절(절) 단위. 같은 절에 밑줄이 있으면 구간이 달라도 "같은 곳".
 * 노트 문단은 사람마다 달라서 비교하지 않는다(구절 밑줄·적용만).
 */
export interface VerseCompare {
  ref: string;
  /** both = 같은 구절에서 구간이 겹침, mine = 나만, theirs = 상대만 */
  kind: 'both' | 'mine' | 'theirs';
  mine?: ShareHighlight;
  theirs?: ShareHighlight;
}

export function compareHighlights(
  mine: ShareFields | null | undefined,
  theirs: ShareFields | null | undefined,
): VerseCompare[] {
  const a = new Map((mine?.highlights || []).map((h) => [h.ref, h]));
  const b = new Map((theirs?.highlights || []).map((h) => [h.ref, h]));
  const refs = [...new Set([...a.keys(), ...b.keys()])];
  const out: VerseCompare[] = refs.map((ref) => {
    const m = a.get(ref);
    const t = b.get(ref);
    if (m && t) return { ref, kind: 'both', mine: m, theirs: t };
    return m ? { ref, kind: 'mine', mine: m } : { ref, kind: 'theirs', theirs: t };
  });
  // 성경 순서: "권:장:절-절"
  const key = (r: string) =>
    r
      .split(/[:-]/)
      .slice(0, 3)
      .map((x) => x.padStart(4, '0'))
      .join('');
  return out.sort((x, y) => key(x.ref).localeCompare(key(y.ref)));
}

export function compareCounts(list: VerseCompare[]) {
  return {
    both: list.filter((x) => x.kind === 'both').length,
    mine: list.filter((x) => x.kind === 'mine').length,
    theirs: list.filter((x) => x.kind === 'theirs').length,
  };
}

/** 모임 전체에서 구절마다 밑줄 그은 사람 수 */
export function groupHeat(all: Array<ShareFields | null | undefined>): Map<string, number> {
  const m = new Map<string, number>();
  all.forEach((f) => {
    new Set((f?.highlights || []).map((h) => h.ref)).forEach((r) => m.set(r, (m.get(r) || 0) + 1));
  });
  return m;
}
