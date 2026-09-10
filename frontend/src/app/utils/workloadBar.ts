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

/** [start, end] (yyyy-MM-dd, 양끝 포함)의 모든 날짜 문자열 */
export function expandDateRange(start: string, end: string): string[] {
  const n = diffDays(start, end);
  if (n < 0) return [];
  const out: string[] = [];
  for (let i = 0; i <= n; i++) out.push(addDaysToDate(start, i));
  return out;
}

/** 한 사람·한 날짜의 근무 여부를 결정하는 입력. 모두 "그 날짜에 해당하는가"의 불리언. */
export interface WorkingDayInput {
  /** 토/일 */
  weekend: boolean;
  /** 공휴일(라이브러리) 또는 보드 휴무일(HOLIDAY) */
  holiday: boolean;
  /** 보드 전체 근무일 지정(WORKDAY) */
  forcedWorkday: boolean;
  /** 이 멤버의 부재(ABSENCE 계열) */
  memberAbsent?: boolean;
  /** 이 멤버의 휴일근무(HOLIDAY_WORK) */
  memberHolidayWork?: boolean;
}

/**
 * 근무일 판정 — 워크로드 빗금과 이후 캐파 계산이 공유하는 단일 규칙.
 * 우선순위: 부재 → 개인 휴일근무 → 보드 근무일 → 휴무일/공휴일/주말 → 근무.
 */
export function isWorkingDay(input: WorkingDayInput): boolean {
  if (input.memberAbsent) return false;
  if (input.memberHolidayWork) return true;
  if (input.forcedWorkday) return true;
  if (input.holiday || input.weekend) return false;
  return true;
}

/** 멤버 단위 설정 없이 보드 달력만으로 본 비근무일(주말·휴무일) 여부 */
export function isBoardOffDay(
  input: Pick<WorkingDayInput, "weekend" | "holiday" | "forcedWorkday">,
): boolean {
  return !isWorkingDay(input);
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
