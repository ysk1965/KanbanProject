import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { SnOverlay } from '../SnOverlay';
import { refShort } from '../bibleRefs';
import { INKS, type MascotId } from '../sermonLook';
import { fmtDate, mainRef, noteRefs, plainText, UNTITLED, type SermonNote } from '../sermonTypes';
import { PolaroidCover } from './Polaroid';
import {
  MAX_PINS,
  movePin,
  PATTERNS,
  PIN_LINE_MAX,
  pinLineSuggestions,
  type ProfilePin,
} from './profileModel';
import type { SermonProfileState } from './useSermonProfile';

/**
 * 고정 노트 창. 빈 자리에서 열면 「노트 고르기」 → 고르면 바로 「카드 꾸미기」.
 * 꾸미기는 고치는 즉시 이름표에 반영된다(따로 저장 버튼 없음).
 */
export function PinSheet({
  open,
  profile,
  notes,
  mascot,
  editId,
  onClose,
}: {
  open: boolean;
  profile: SermonProfileState;
  notes: SermonNote[];
  mascot: MascotId;
  /** 꾸밀 카드의 노트 id. 없으면 고르기부터 */
  editId: string | null;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const id = editId ?? picked;
  const pins = profile.data.pins;
  const pin = id ? pins.find((p) => p.note_id === id) : undefined;
  const note = id ? notes.find((n) => n.id === id) : undefined;
  const index = pin ? pins.indexOf(pin) : -1;

  const candidates = useMemo(() => {
    const pinned = new Set(pins.map((p) => p.note_id));
    const lq = q.trim().toLowerCase();
    return notes
      .filter((n) => !pinned.has(n.id))
      .filter((n) => {
        if (!lq) return true;
        const hay = [
          n.title,
          n.preacher,
          n.service,
          ...noteRefs(n).map(refShort),
          plainText(n.body).slice(0, 400),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(lq);
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updated_at - a.updated_at)
      .slice(0, 60);
  }, [notes, pins, q]);
  const lines = useMemo(() => (note ? pinLineSuggestions(note) : []), [note]);

  const close = () => {
    setPicked(null);
    setQ('');
    onClose();
  };
  const patch = (p: Partial<ProfilePin>) => {
    if (!pin) return;
    profile.update({ pins: pins.map((x) => (x.note_id === pin.note_id ? { ...x, ...p } : x)) });
  };

  const choose = (noteId: string) => {
    const r = profile.togglePin(noteId, (x) => notes.some((n) => n.id === x));
    if (r === 'full') {
      toast(`고정은 ${MAX_PINS}장까지예요. 카드 하나를 먼저 내려놓아 주세요`);
      return;
    }
    setPicked(noteId);
  };

  const editing = !!(pin && note);

  return (
    <SnOverlay open={open} onClose={close} className="snp-sheet" aria-labelledby="snp-pin-title">
      <div className="snp-shead">
        <h2 id="snp-pin-title">{editing ? '카드 꾸미기' : '고정할 노트 고르기'}</h2>
        <button type="button" className="snp-x" aria-label="닫기" onClick={close}>
          <X className="sn-icon" />
        </button>
      </div>

      {editing ? (
        <div className="snp-sbody snp-pin-edit">
          <div className="snp-pin-prev">
            <div className="snp-pola snp-pola-static">
              <span className="snp-tape" aria-hidden />
              <PolaroidCover pin={pin} note={note} mascot={mascot} index={index} />
              <span className="snp-pola-t">{note.title || UNTITLED}</span>
              {pin.line && <span className="snp-pola-l">“{pin.line}”</span>}
              <span className="snp-pola-m">{fmtDate(note.date)}</span>
            </div>
          </div>
          <div className="snp-ctl">
            <div className="snp-label">표지 색</div>
            <div className="snp-opts" role="radiogroup" aria-label="표지 색">
              {INKS.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  role="radio"
                  aria-checked={pin.ink === i.id}
                  aria-label={i.name}
                  title={i.name}
                  className="snp-sw"
                  style={{ background: `linear-gradient(135deg, ${i.sw[0]} 50%, ${i.sw[1]} 50%)` }}
                  onClick={() => patch({ ink: i.id })}
                />
              ))}
            </div>
            <div className="snp-label">무늬</div>
            <div className="snp-opts" role="radiogroup" aria-label="무늬">
              {PATTERNS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={pin.pattern === p.id}
                  className="snp-chip"
                  onClick={() => patch({ pattern: p.id })}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <div className="snp-label">스티커</div>
            <div className="snp-opts" role="radiogroup" aria-label="스티커">
              {(
                [
                  ['mascot', '내 캐릭터'],
                  ['none', '없음'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={pin.sticker === k}
                  className="snp-chip"
                  onClick={() => patch({ sticker: k })}
                >
                  {l}
                </button>
              ))}
            </div>
            <label className="snp-label" htmlFor="snp-pin-line">
              내 한 줄{' '}
              <span>
                {[...(pin.line || '')].length}/{PIN_LINE_MAX}
              </span>
            </label>
            <input
              id="snp-pin-line"
              className="snp-input snp-hand"
              value={pin.line || ''}
              maxLength={PIN_LINE_MAX}
              placeholder="이 설교를 한 줄로 붙든다면"
              onChange={(e) => patch({ line: e.target.value.slice(0, PIN_LINE_MAX) || undefined })}
            />
            {lines.length > 0 && (
              <div className="snp-opts">
                {lines.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className="snp-chip snp-chip-soft"
                    onClick={() => patch({ line: l })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            <div className="snp-row">
              <button
                type="button"
                className="snp-btn"
                disabled={index <= 0}
                onClick={() => profile.update({ pins: movePin(pins, pin.note_id, -1) })}
              >
                <ArrowLeft className="sn-icon" aria-hidden />
                앞으로
              </button>
              <button
                type="button"
                className="snp-btn"
                disabled={index >= pins.length - 1}
                onClick={() => profile.update({ pins: movePin(pins, pin.note_id, 1) })}
              >
                뒤로
                <ArrowRight className="sn-icon" aria-hidden />
              </button>
            </div>
            <div className="snp-row snp-row-end">
              <button
                type="button"
                className="snp-btn snp-danger"
                onClick={() => {
                  profile.togglePin(pin.note_id);
                  toast('고정을 풀었어요');
                  close();
                }}
              >
                고정 풀기
              </button>
              <button type="button" className="snp-btn snp-primary" onClick={close}>
                완료
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="snp-sbody snp-pick">
          <label className="snp-search">
            <Search className="sn-icon" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목, 설교자, 구절로 찾기"
              aria-label="노트 찾기"
            />
          </label>
          {candidates.length ? (
            <ul className="snp-pick-list">
              {candidates.map((n) => {
                const r = mainRef(n);
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => choose(n.id)}>
                      <b>{n.title || UNTITLED}</b>
                      <span>
                        {[fmtDate(n.date), n.service, n.preacher, r ? refShort(r) : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="snp-empty">
              {notes.length ? '찾는 노트가 없어요' : '먼저 설교 노트를 한 편 써 보세요'}
            </p>
          )}
        </div>
      )}
    </SnOverlay>
  );
}
