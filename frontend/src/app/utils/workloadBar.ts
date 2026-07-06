/**
 * 워크로드(리소스) 바 계산 유틸.
 *
 * `ScheduleResourceView`의 바 위치/레인 계산 로직을 순수 함수로 뽑아,
 * `MyWorkloadStrip` 등 다른 워크로드 시각화에서 재사용한다.
 * 날짜는 모두 "yyyy-MM-dd" 문자열, 계산은 UTC 기준(DST off-by-one 방지).
 */

/** "yyyy-MM-dd" → 로컬 Date */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date → "yyyy-MM-dd" */
export function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "yyyy-MM-dd"에 일수를 더한 "yyyy-MM-dd" */
export function addDaysToDate(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateStr(date);
}

/** b - a (일 단위, UTC 기준) */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const utcA = Date.UTC(ay, am - 1, ad);
  const utcB = Date.UTC(by, bm - 1, bd);
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

export interface BarRange {
  id: string;
  startDayIndex: number;
  endDayIndex: number;
}

/**
 * 겹치는 바를 lane(행)으로 쌓는 greedy interval packing.
 * @returns { itemId: laneNumber }
 */
export function computeBarLanes(bars: BarRange[]): Record<string, number> {
  const sorted = [...bars].sort((a, b) => {
    if (a.startDayIndex !== b.startDayIndex)
      return a.startDayIndex - b.startDayIndex;
    return b.endDayIndex - b.startDayIndex - (a.endDayIndex - a.startDayIndex);
  });

  const lanes: Record<string, number> = {};
  const laneEnds: number[] = [];

  for (const bar of sorted) {
    let assigned = false;
    for (let lane = 0; lane < laneEnds.length; lane++) {
      if (laneEnds[lane] < bar.startDayIndex) {
        lanes[bar.id] = lane;
        laneEnds[lane] = bar.endDayIndex;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      lanes[bar.id] = laneEnds.length;
      laneEnds.push(bar.endDayIndex);
    }
  }

  return lanes;
}
