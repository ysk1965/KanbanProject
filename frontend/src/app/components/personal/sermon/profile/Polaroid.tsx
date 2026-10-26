import type { CSSProperties } from 'react';
import { mainRef, fmtDate, UNTITLED, type SermonNote } from '../sermonTypes';
import { Mascot } from '../Mascot';
import type { MascotId } from '../sermonLook';
import { bookLabel, inkPair, type ProfilePin } from './profileModel';

/** 고정 노트 한 장 — 표지(잉크 두 색 + 무늬 + 책 이름·장), 아래에 제목·내 한 줄(손글씨)·날짜 */

export function PolaroidCover({
  pin,
  note,
  mascot,
  index,
  small = false,
}: {
  pin: ProfilePin;
  note: SermonNote;
  mascot: MascotId;
  index?: number;
  small?: boolean;
}) {
  const [a, b] = inkPair(pin.ink);
  const r = mainRef(note);
  return (
    <div
      className="snp-cover"
      data-pattern={pin.pattern}
      style={{ '--a': a, '--b': b } as CSSProperties}
      aria-hidden
    >
      {index != null && <span className="snp-cover-no">{index + 1}</span>}
      {pin.sticker === 'mascot' && (
        <span className="snp-cover-st">
          <Mascot kind={mascot} size={small ? 26 : 40} />
        </span>
      )}
      <span className="snp-cover-bk">{r ? bookLabel(r, small) : note.title || '설교'}</span>
    </div>
  );
}

export function Polaroid({
  pin,
  note,
  mascot,
  index,
  onOpen,
  onEdit,
}: {
  pin: ProfilePin;
  note: SermonNote;
  mascot: MascotId;
  index: number;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const meta = [fmtDate(note.date), note.service, note.preacher].filter(Boolean).join(' · ');
  return (
    <article className="snp-pola" data-i={index}>
      <span className="snp-tape" aria-hidden />
      <button type="button" className="snp-pola-open" onClick={onOpen}>
        <PolaroidCover pin={pin} note={note} mascot={mascot} index={index} />
        <span className="snp-pola-t">{note.title || UNTITLED}</span>
        {pin.line && <span className="snp-pola-l">“{pin.line}”</span>}
        <span className="snp-pola-m">{meta}</span>
        <span className="sn-sr">노트 열기</span>
      </button>
      <button
        type="button"
        className="snp-pola-edit"
        onClick={onEdit}
        aria-label={`${note.title || UNTITLED} 카드 꾸미기`}
      >
        꾸미기
      </button>
    </article>
  );
}
