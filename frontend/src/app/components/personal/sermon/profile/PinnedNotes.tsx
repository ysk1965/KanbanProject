import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { MascotId } from '../sermonLook';
import type { SermonNote } from '../sermonTypes';
import { Polaroid } from './Polaroid';
import { PinSheet } from './PinSheet';
import { MAX_PINS } from './profileModel';
import type { SermonProfileState } from './useSermonProfile';

/** 고정한 노트 — 내 인생 설교 세 장. 지워진 노트의 카드는 그리지 않는다(고정 목록에는 남겨 둠: 다른 기기 동기화 전일 수 있어서) */
export function PinnedNotes({
  profile,
  notes,
  mascot,
  onOpen,
}: {
  profile: SermonProfileState;
  notes: SermonNote[];
  mascot: MascotId;
  onOpen: (id: string) => void;
}) {
  const [sheet, setSheet] = useState<{ edit: string | null } | null>(null);
  const byId = new Map(notes.map((n) => [n.id, n]));
  const cards = profile.data.pins.flatMap((pin) => {
    const note = byId.get(pin.note_id);
    return note ? [{ pin, note }] : [];
  });
  const empty = Math.max(0, MAX_PINS - cards.length);

  return (
    <section className="snp-pins-sec" aria-labelledby="snp-pins-h">
      <div className="sn-sec-h">
        <h4 id="snp-pins-h">고정한 노트</h4>
        <span>오래 붙들고 싶은 설교 {MAX_PINS}장</span>
      </div>
      <div className="snp-pins">
        {cards.map(({ pin, note }, i) => (
          <Polaroid
            key={pin.note_id}
            pin={pin}
            note={note}
            mascot={mascot}
            index={i}
            onOpen={() => onOpen(note.id)}
            onEdit={() => setSheet({ edit: note.id })}
          />
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <button
            key={`empty-${i}`}
            type="button"
            className="snp-pola-empty"
            onClick={() => setSheet({ edit: null })}
          >
            <Plus className="sn-icon" aria-hidden />
            {cards.length === 0 && i === 0 ? '내 인생 설교 고정하기' : '한 장 더'}
          </button>
        ))}
      </div>
      {cards.length === 0 && (
        <p className="snp-hint">노트를 열고 ⋯ 메뉴의 「나의 갈피에 고정」으로도 꽂을 수 있어요.</p>
      )}
      <PinSheet
        open={!!sheet}
        profile={profile}
        notes={notes}
        mascot={mascot}
        editId={sheet?.edit ?? null}
        onClose={() => setSheet(null)}
      />
    </section>
  );
}
