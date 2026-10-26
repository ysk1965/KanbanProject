import { noteRefs, weekOf, type SermonNote } from '../sermonTypes';

/** 오늘이 든 주부터 거꾸로, 노트가 하나라도 있는 주가 몇 주째 이어지는지 (이번 주가 비었으면 지난주부터 센다) */
export function weekStreak(notes: SermonNote[], today = new Date()): number {
  const weeks = new Set(notes.map((n) => weekOf(n.date)).filter(Boolean));
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!weeks.has(weekOf(ymd(d)))) d.setDate(d.getDate() - 7);
  let n = 0;
  while (weeks.has(weekOf(ymd(d)))) {
    n += 1;
    d.setDate(d.getDate() - 7);
  }
  return n;
}

/** 설교 본문으로 들은 책 수 (66권 중) */
export function booksHeard(notes: SermonNote[]): number {
  const books = new Set<number>();
  for (const n of notes) for (const r of noteRefs(n)) books.add(r.b);
  return books.size;
}
