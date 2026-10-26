import { useEffect, useState } from 'react';
import { BOOKS, OT_COUNT, PSALMS, chCount } from './bibleRefs';
import { chKey, type ReadMark } from './bibleMarks';
import { SnOverlay } from './SnOverlay';
import { SnSheetBar } from './SnSheetBar';

/**
 * 좁은 화면의 책·장 고르기 — 아래에서 올라오는 시트.
 * 위 = 구약/신약 + 책, 아래 = 고른 책의 장. 장 칸에 손글씨(분홍 밑줄)·형광펜(칠)을 표시한다.
 */
interface BiblePickSheetProps {
  open: boolean;
  onClose: () => void;
  pos: { b: number; c: number };
  marks: Map<string, ReadMark[]>;
  counts: Map<number, number>;
  hlChaptersOf: (b: number) => Set<number>;
  onGo: (b: number, c: number) => void;
}

export function BiblePickSheet({
  open,
  onClose,
  pos,
  marks,
  counts,
  hlChaptersOf,
  onGo,
}: BiblePickSheetProps) {
  const [book, setBook] = useState(pos.b);
  const [nt, setNt] = useState(pos.b >= OT_COUNT);
  useEffect(() => {
    if (!open) return;
    setBook(pos.b);
    setNt(pos.b >= OT_COUNT);
  }, [open, pos.b]);

  // 열리면 지금 장이 가운데 오게
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const body = document.querySelector<HTMLElement>('.sn-bsheet-body');
      const cur = body?.querySelector<HTMLElement>('.sn-bsheet-ch [aria-current="true"]');
      if (body && cur) body.scrollTop = cur.offsetTop - body.offsetTop - body.clientHeight / 2;
    }, 30);
    return () => window.clearTimeout(t);
  }, [open, book]);

  const hl = hlChaptersOf(book);
  const unit = book === PSALMS ? '편' : '장';
  const from = nt ? OT_COUNT : 0;
  const to = nt ? BOOKS.length : OT_COUNT;

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sn-bsheet"
      overlayClassName="sn-bsheet-ov"
      aria-label="책과 장 고르기"
      initialFocus=".sn-bsheet-ch [aria-current='true']"
    >
      <span className="sn-bsheet-grab" aria-hidden />
      <div className="sn-bsheet-seg" role="group" aria-label="구약·신약">
        <button type="button" aria-pressed={!nt} onClick={() => setNt(false)}>
          구약
        </button>
        <button type="button" aria-pressed={nt} onClick={() => setNt(true)}>
          신약
        </button>
      </div>
      <div className="sn-bsheet-body">
        <div className="sn-bsheet-books">
          {BOOKS.slice(from, to).map((bk, i) => {
            const b = from + i;
            return (
              <button
                key={b}
                type="button"
                aria-pressed={b === book}
                data-has={(counts.get(b) || 0) > 0 || undefined}
                onClick={() => setBook(b)}
              >
                {bk[0].length > 4 ? bk[1] : bk[0]}
              </button>
            );
          })}
        </div>
        <div className="sn-bsheet-label">
          {BOOKS[book][0]} · {chCount(book)}
          {unit}
        </div>
        <div className="sn-bsheet-ch">
          {Array.from({ length: chCount(book) }, (_, i) => {
            const c = i + 1;
            const has = marks.has(chKey(book, c));
            return (
              <button
                key={c}
                type="button"
                aria-current={book === pos.b && c === pos.c}
                data-has={has || undefined}
                data-hl={hl.has(c) || undefined}
                aria-label={`${BOOKS[book][0]} ${c}${unit}${has ? ', 손글씨 있음' : ''}${hl.has(c) ? ', 형광펜 있음' : ''}`}
                onClick={() => onGo(book, c)}
              >
                {c}
              </button>
            );
          })}
        </div>
        <div className="sn-bsheet-legend" aria-hidden>
          <span>
            <i data-k="hand" />
            손글씨 있음
          </span>
          <span>
            <i data-k="hl" />
            형광펜
          </span>
        </div>
      </div>
      <SnSheetBar onClose={onClose} />
    </SnOverlay>
  );
}
