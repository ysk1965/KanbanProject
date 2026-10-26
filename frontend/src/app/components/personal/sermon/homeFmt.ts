import { BOOKS, PSALMS, type Ref } from './bibleRefs';
import type { SermonNote } from './sermonTypes';

/** 홈(표지 카드 · 이번 주 들은 예배)이 같이 쓰는 표기 */
const DOW = '일월화수목금토';

/** 책 이름: 다섯 글자가 넘으면 약어 (예레미야애가 → 애) */
export function bookName(r: Ref): string {
  const [long, short] = BOOKS[r.b];
  return long.length > 4 ? short : long;
}

export function chapterUnit(r: Ref): string {
  return r.b === PSALMS ? '편' : '장';
}

/** 'yyyy-MM-dd' → '10.25 주일' / '10.28 수요일' */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${m}.${String(d).padStart(2, '0')} ${dow === 0 ? '주일' : `${DOW[dow]}요일`}`;
}

export function applyCount(n: SermonNote): number {
  return (n.thoughts || []).filter((t) => t.tag === '적용').length;
}
