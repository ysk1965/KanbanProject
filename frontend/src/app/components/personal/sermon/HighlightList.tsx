import { useState } from 'react';
import { Highlighter } from 'lucide-react';
import { BOOKS, refShort } from './bibleRefs';
import { HL_COLORS, openInReader, rangeText, useHighlights, type HlColor } from './bibleHighlights';
import { useBible } from './useBible';
import './bibleHighlight.css';

/**
 * 성경 읽기 › 「내 형광펜」 — 칠한 구절을 성경 순서로 모아 본다. 색으로 거르고, 누르면 읽기 화면의 그 절로 간다.
 */
interface HighlightListProps {
  onRead: () => void;
}

export function HighlightList({ onRead }: HighlightListProps) {
  const store = useHighlights();
  const { bible } = useBible();
  const [color, setColor] = useState<HlColor | null>(null);
  const all = store.all();
  const shown = color ? all.filter((h) => h.color === color) : all;
  const byColor = new Map<HlColor, number>();
  all.forEach((h) => h.color && byColor.set(h.color, (byColor.get(h.color) || 0) + 1));

  if (!all.length) {
    return (
      <div className="sn-empty">
        <Highlighter className="w-6 h-6" style={{ color: 'var(--sn-accent)' }} aria-hidden />
        <h2>아직 칠한 구절이 없어요</h2>
        <div>
          성경 읽기에서 절을 누르거나 글자를 끌어 고르면
          <br />
          형광펜으로 칠하고 한 줄 메모를 남길 수 있어요.
        </div>
        <button type="button" className="sn-btn sn-primary" onClick={onRead}>
          성경 읽으러 가기
        </button>
      </div>
    );
  }

  let lastBook = -1;
  return (
    <div>
      <div className="sn-hlfilter" role="group" aria-label="색으로 거르기">
        <button
          type="button"
          className="sn-chip"
          aria-pressed={!color}
          onClick={() => setColor(null)}
        >
          모두 {all.length}
        </button>
        {HL_COLORS.filter(([c]) => byColor.has(c)).map(([c, name]) => (
          <button
            key={c}
            type="button"
            className="sn-chip"
            data-c={c}
            aria-pressed={color === c}
            onClick={() => setColor(color === c ? null : c)}
          >
            {name} {byColor.get(c)}
          </button>
        ))}
      </div>
      <div className="sn-rows">
        {shown.map((h) => {
          const head =
            h.b !== lastBook ? <h3 className="sn-hllist-book">{BOOKS[h.b][0]}</h3> : null;
          lastBook = h.b;
          const ch = bible?.[h.b]?.[h.c - 1] || [];
          const txt = ch.length ? rangeText(h, (v) => ch[v - 1] || '') : '';
          return (
            <div key={h.id}>
              {head}
              <button
                type="button"
                className="sn-row sn-hlrow"
                onClick={() => {
                  openInReader(h.b, h.c, h.v1);
                  onRead();
                }}
              >
                <span className="sn-hlrow-ref">
                  {refShort({ b: h.b, c: h.c, v1: h.v1, v2: h.v2, whole: false })}
                  {h.s || h.e != null ? ' 일부' : ''}
                </span>
                <span className="sn-hlrow-text">
                  <span className="sn-hl" data-c={h.color || undefined} data-ul={h.ul || undefined}>
                    {txt || '…'}
                  </span>
                </span>
                {h.memo && <span className="sn-hlrow-memo">{h.memo}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
