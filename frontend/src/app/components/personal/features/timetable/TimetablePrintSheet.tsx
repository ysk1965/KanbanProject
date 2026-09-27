import type { CSSProperties } from 'react';
import type { FeaturePrintProps, TimetableContent } from '../types';
import { cellOf, covers, formatDayLabel, spanOf } from './timetableModel';
import { getTodayDateString } from '../../../../utils/dateUtils';
import './timetable.css';

/**
 * 시간표 종이(PDF) 레이아웃. 기획서 05절.
 * 셸이 <div id="timetable-print" className="hidden print:block"> 안에 항상 마운트해 두고,
 * 「PDF 내보내기」는 window.print() — timetable.css 의 @media print 가 이 DOM만 남긴다.
 */
export function TimetablePrintSheet({ doc }: FeaturePrintProps<TimetableContent>) {
  const content = doc.content;
  const columns = content?.columns || [];
  const days = content?.days || [];

  return (
    <div className="tt-paper">
      <div className="print-top">
        <div className="print-title">{doc.title}</div>
        <div className="print-meta">
          {content?.version_label ? <div className="print-ver">{content.version_label}</div> : null}
          {content?.place_note ? <div>장소 : {content.place_note}</div> : null}
        </div>
      </div>

      {days.map((day, di) => {
        const covs: Record<string, number[]> = {};
        for (const c of columns) covs[c.key] = covers(day, c.key);
        return (
          <div className="print-day" key={di}>
            <p className="print-date">{formatDayLabel(day.date, '')}</p>
            <table>
              <colgroup>
                {columns.map((c) => (
                  <col key={c.key} style={c.width ? ({ width: `${c.width}%` } as CSSProperties) : undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} style={c.width ? { width: `${c.width}%` } : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {day.rows.map((row, ri) => (
                  <tr key={ri}>
                    {columns.map((c) => {
                      if (covs[c.key][ri] >= 0) return null; // 병합에 덮인 셀
                      const cell = cellOf(row, c.key);
                      const n = spanOf(day, c.key, ri);
                      return (
                        <td key={c.key} rowSpan={n > 1 ? n : undefined} className={cell.c ? `c-${cell.c}` : undefined}>
                          {cell.t}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="print-foot">
        BRIDGE 마이 스페이스 · {doc.title} · {getTodayDateString()} 내보냄
      </div>
    </div>
  );
}

export default TimetablePrintSheet;
