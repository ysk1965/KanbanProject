import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { FeaturePrintProps, TimetableColumn, TimetableContent, TimetableDay } from '../types';
import { cellOf, covers, effectivePlaceNote, fmtT, formatDayLabel, parseRange, placeColumn, spanOf, timeColumn } from './timetableModel';
import './timetable.css';

/**
 * 시간표 종이(PDF) 레이아웃. 기획서 05절 + 「카드 블록」 시안.
 * 날짜마다 둥근 카드 하나: 진한 카드 머리(날짜 · 요일 · 요약) + 연한 라벨 띠 + 헤어라인 표.
 * 셸이 <div id="timetable-print" className="hidden print:block"> 안에 항상 마운트해 두고,
 * 「PDF 내보내기」는 window.print() — timetable.css 의 @media print 가 이 DOM만 남긴다.
 *
 * 종이에서만 계산하는 것 (데이터에는 없다):
 * - 날짜 옆 요약 「13:00 – 16:00 · 5개 일정」 (시간 열이 있을 때)
 * - 행 사이 시간이 비면 「쉬는 시간 N분」 줄 (시간 열이 있을 때)
 * - 시간 칸 아래 소요 시간 「40분」
 * - 열 역할: 시간 열은 고정폭 숫자, 장소 열은 가운데 정렬로 조금 크게, 내용 열(추천 없는 첫 글 열)은 굵게, 마지막 열은 회색 작게, 병합 셀은 가운데
 */

interface Gap {
  /** 이 행 번호 앞에 끼워 넣는다 */
  before: number;
  s: number;
  e: number;
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

/** 시간 열의 대표 행을 위에서 아래로 훑어 비는 구간을 찾는다 */
function findGaps(day: TimetableDay, timeKey: string): Gap[] {
  const cov = covers(day, timeKey);
  const gaps: Gap[] = [];
  let prevEnd: number | null = null;
  for (let ri = 0; ri < day.rows.length; ri++) {
    if (cov[ri] >= 0) continue;
    const r = parseRange(cellOf(day.rows[ri], timeKey).t);
    if (!r) continue;
    if (prevEnd !== null && r.s > prevEnd) gaps.push({ before: ri, s: prevEnd, e: r.s });
    prevEnd = r.e;
  }
  return gaps;
}

/** 날짜 옆 요약. 시간을 하나도 못 읽으면 null */
function daySummary(day: TimetableDay, timeKey: string): string | null {
  const cov = covers(day, timeKey);
  let first: number | null = null;
  let last: number | null = null;
  let count = 0;
  for (let ri = 0; ri < day.rows.length; ri++) {
    if (cov[ri] >= 0) continue;
    const r = parseRange(cellOf(day.rows[ri], timeKey).t);
    if (!r) continue;
    if (first === null) first = r.s;
    last = r.e;
    count++;
  }
  if (first === null || last === null) return null;
  return `${fmtT(first)} – ${fmtT(last)} · ${count}개 일정`;
}

/** 「9.28 (월)」 → 날짜와 요일을 따로 (날짜가 없으면 week 없이 fallback 문구) */
function splitDayLabel(iso: string): { date: string; week: string | null } {
  const label = formatDayLabel(iso, '');
  const m = /^(.+?) \((.+)\)$/.exec(label);
  if (!m) return { date: label || '날짜 없음', week: null };
  return { date: m[1], week: m[2] };
}

/** 내용 열: 시간이 아니면서 추천이 꺼진 첫 글 열. 없으면 시간 다음 첫 글 열 */
function mainColumnKey(columns: TimetableColumn[]): string | null {
  const plain = columns.find((c) => c.type === 'text' && !c.suggest);
  if (plain) return plain.key;
  const any = columns.find((c) => c.type === 'text');
  return any ? any.key : null;
}

function TimeText({ text, duration = false }: { text: string; duration?: boolean }) {
  const r = parseRange(text);
  if (!r) return <>{text}</>;
  let dur = r.e - r.s;
  if (dur < 0) dur += 1440;
  return (
    <>
      {fmtT(r.s)}
      <span className="tt-p-arrow">–</span>
      {fmtT(r.e)}
      {duration && dur > 0 ? <span className="tt-p-dur">{fmtDuration(dur)}</span> : null}
    </>
  );
}

export function TimetablePrintSheet({ doc }: FeaturePrintProps<TimetableContent>) {
  const content = doc.content;
  const columns = content?.columns || [];
  const days = content?.days || [];
  const timeKey = content ? timeColumn(content)?.key ?? null : null;
  const mainKey = mainColumnKey(columns);
  const placeKey = content ? placeColumn(content)?.key ?? null : null;
  const lastKey = columns.length ? columns[columns.length - 1].key : null;
  const placeNote = content ? effectivePlaceNote(content) : '';

  return (
    <div className="tt-paper">
      <div className="print-top">
        <div>
          <div className="print-kicker">시간표</div>
          <div className="print-title">{doc.title}</div>
        </div>
        <div className="print-meta">
          {placeNote ? <span className="print-pill">장소 : {placeNote}</span> : null}
        </div>
      </div>

      {days.map((day, di) => {
        const covs: Record<string, number[]> = {};
        for (const c of columns) covs[c.key] = covers(day, c.key);

        const gaps = timeKey ? findGaps(day, timeKey) : [];
        const gapBefore = new Map<number, Gap>();
        for (const g of gaps) gapBefore.set(g.before, g);
        // 쉬는 시간 줄이 병합 범위 안에 끼면 그 대표 셀의 rowSpan 을 늘린다
        const extraSpan: Record<string, Record<number, number>> = {};
        for (const g of gaps) {
          for (const c of columns) {
            if (c.key === timeKey) continue;
            const a = covs[c.key][g.before];
            if (a < 0) continue;
            extraSpan[c.key] = extraSpan[c.key] || {};
            extraSpan[c.key][a] = (extraSpan[c.key][a] || 0) + 1;
          }
        }

        const { date, week } = splitDayLabel(day.date);
        const summary = timeKey ? daySummary(day, timeKey) : null;

        const renderGapRow = (g: Gap, ri: number) => {
          // 시간 칸 + (병합에 덮이지 않은 이웃 열을 묶은) 칸들
          const cells: ReactNode[] = [];
          let run: string[] = [];
          let labeled = false;
          const flush = () => {
            if (!run.length) return;
            cells.push(
              <td key={run[0]} colSpan={run.length > 1 ? run.length : undefined} className="tt-p-gap-cell">
                {!labeled ? `쉬는 시간 ${fmtDuration(g.e - g.s)}` : null}
              </td>,
            );
            labeled = true;
            run = [];
          };
          for (const c of columns) {
            if (c.key === timeKey) {
              flush();
              cells.push(
                <td key={c.key} className="tt-p-time tt-p-gap-cell">
                  <TimeText text={`${fmtT(g.s)} – ${fmtT(g.e)}`} />
                </td>,
              );
              continue;
            }
            if (covs[c.key][ri] >= 0) {
              flush();
              continue; // 병합 셀이 가로질러 덮고 있는 열
            }
            run.push(c.key);
          }
          flush();
          return <tr className="tt-p-gap">{cells}</tr>;
        };

        return (
          <div className="print-day" key={di}>
            <div className="print-card-head">
              <span className="print-date-d">{date}</span>
              {week ? <span className="print-date-w">{week}</span> : null}
              {summary ? <span className="print-date-sum">{summary}</span> : null}
            </div>
            <table>
              <colgroup>
                {columns.map((c) => (
                  <col key={c.key} style={c.width ? ({ width: `${c.width}%` } as CSSProperties) : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={c.key === placeKey ? 'tt-p-place' : undefined} style={c.width ? { width: `${c.width}%` } : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {day.rows.map((row, ri) => {
                  const gap = gapBefore.get(ri);
                  return (
                    <Fragment key={ri}>
                      {gap ? renderGapRow(gap, ri) : null}
                      <tr>
                        {columns.map((c) => {
                          if (covs[c.key][ri] >= 0) return null; // 병합에 덮인 셀
                          const cell = cellOf(row, c.key);
                          const n = spanOf(day, c.key, ri) + (extraSpan[c.key]?.[ri] || 0);
                          const isTime = c.key === timeKey;
                          const cls = [
                            isTime ? 'tt-p-time' : '',
                            c.key === mainKey ? 'tt-p-main' : '',
                            !isTime && c.key === placeKey ? 'tt-p-place' : '',
                            !isTime && c.key !== mainKey && c.key === lastKey ? 'tt-p-note' : '',
                            n > 1 ? 'tt-p-merged' : '',
                            cell.c ? `c-${cell.c}` : '',
                          ]
                            .filter(Boolean)
                            .join(' ');
                          return (
                            <td key={c.key} rowSpan={n > 1 ? n : undefined} className={cls || undefined}>
                              {isTime ? <TimeText text={cell.t} duration /> : cell.t}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export default TimetablePrintSheet;
