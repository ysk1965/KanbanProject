import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Search, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { SnOverlay } from '../SnOverlay';
import { SnSheetBar } from '../SnSheetBar';
import { refLong, refShort } from '../bibleRefs';
import { Mascot } from '../Mascot';
import { INKS, type MascotId } from '../sermonLook';
import {
  fmtDate,
  mainRef,
  noteRefs,
  plainText,
  UNTITLED,
  weekOf,
  type SermonNote,
} from '../sermonTypes';
import { CARD_BRAND } from '../share/ShareCard';
import { cardShareText, cardUrl, coverData } from '../share/shareModel';
import {
  CARD_RENDER_WIDTH,
  cardFileName,
  cardToBlob,
  copyText,
  downloadBlob,
  shareImage,
} from '../share/shareImage';
import { PolaroidCover } from './Polaroid';
import {
  coverInkFor,
  MAX_PINS,
  movePin,
  PATTERNS,
  PIN_LINE_MAX,
  pinLineSuggestions,
  type ProfilePin,
} from './profileModel';
import type { SermonProfileState } from './useSermonProfile';

/**
 * 고정 노트 창. 빈 자리에서 열면 「스티커 판」 — 위에 고정 자리 3칸, 아래 노트 표지를 주 단위로 깔아 둔다.
 * 한 장을 누르면 가름끈이 내려오고 다음 빈 자리에 미리 붙는다 → 「이 노트로 꾸미기」로 확정하면 「카드 꾸미기」.
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
  /** 스티커 판에서 고른(아직 안 꽂은) 노트 */
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sharing, setSharing] = useState(false);
  const shotRef = useRef<HTMLDivElement>(null);
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
  const weeks = useMemo(() => groupByWeek(candidates), [candidates]);
  const dupKeys = useMemo(() => untitledDupes(notes), [notes]);
  const used = pins.map((p) => p.ink);
  /** 고르기 미리보기용 — 꽂으면 togglePinList 가 만드는 것과 같은 표지 */
  const previewPin = (noteId: string): ProfilePin => ({
    note_id: noteId,
    ink: coverInkFor(noteId, used),
    pattern: 'dots',
    sticker: 'mascot',
  });
  const selNote = sel ? notes.find((n) => n.id === sel) : undefined;
  const full = pins.length >= MAX_PINS;
  const lines = useMemo(() => (note ? pinLineSuggestions(note) : []), [note]);

  const close = () => {
    setPicked(null);
    setSel(null);
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
    setSel(null);
    setPicked(noteId);
  };
  const tap = (noteId: string) => {
    if (full) {
      toast(`고정은 ${MAX_PINS}장까지예요. 카드 하나를 먼저 내려놓아 주세요`);
      return;
    }
    setSel((cur) => (cur === noteId ? null : noteId));
  };

  /** 꾸민 카드를 그대로 이미지로 — 파일 공유를 못 하는 브라우저는 저장 + 링크 복사 */
  const share = async () => {
    if (!note || !shotRef.current || sharing) return;
    setSharing(true);
    try {
      const blob = await cardToBlob(shotRef.current);
      const name = cardFileName(note.title || UNTITLED);
      const data = coverData(note);
      const link = cardUrl(data);
      const res = await shareImage(blob, name, cardShareText(data), link);
      if (res === 'unsupported') {
        downloadBlob(blob, name);
        const ok = await copyText(link);
        toast(ok ? '이미지를 저장하고 카드 링크를 복사했어요' : '이미지를 저장했어요');
      }
    } catch (e) {
      console.error('pin card share failed', e);
      toast('카드를 만들지 못했어요. 다시 시도해 주세요');
    } finally {
      setSharing(false);
    }
  };

  const editing = !!(pin && note);
  const shotMeta = note
    ? [fmtDate(note.date), note.service, note.preacher].filter(Boolean).join(' · ')
    : '';
  // 이미지 캡처는 line-clamp 말줄임이 안 찍혀서 글자 수로 자른다
  const shotTitle = note ? clip(note.title || UNTITLED, 44) : '';

  return (
    <SnOverlay open={open} onClose={close} className="snp-sheet" aria-labelledby="snp-pin-title">
      <div className="snp-shead">
        <h2 id="snp-pin-title">{editing ? '카드 꾸미기' : '고정할 노트 고르기'}</h2>
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
            </div>
          </div>

          {/* 공유 이미지용 — 화면 밖에 고정 폭으로 그린다 */}
          <div className="snp-shot" aria-hidden>
            <div ref={shotRef} className="snp-shot-card" style={{ width: CARD_RENDER_WIDTH }}>
              <div className="snp-pola snp-pola-static">
                <span className="snp-tape" />
                <PolaroidCover pin={pin} note={note} mascot={mascot} />
                <span className="snp-pola-t">{shotTitle}</span>
                {pin.line && <span className="snp-pola-l">“{pin.line}”</span>}
                {shotMeta && <span className="snp-pola-m">{shotMeta}</span>}
              </div>
              <div className="snp-shot-brand">
                <b>설교 노트</b>
                <span>{CARD_BRAND}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="snp-sbody snp-pick">
          <div className="snp-board-say">
            <Mascot kind={mascot} state={sel ? 'done' : 'idle'} size={34} />
            <span>
              {full
                ? '세 자리가 다 찼어요'
                : sel
                  ? `${pins.length + 1}번 자리에 붙여 봤어요`
                  : `${pins.length + 1}번 자리가 비어 있어요`}
            </span>
          </div>
          <ol className="snp-slots" aria-label="고정 자리">
            {Array.from({ length: MAX_PINS }, (_, i) => {
              const p = pins[i];
              const pn = p && notes.find((n) => n.id === p.note_id);
              const next = i === pins.length;
              if (pn) {
                return (
                  <li key={i} className="snp-slot snp-slot-on" data-i={i}>
                    <SlotCard pin={p} note={pn} mascot={mascot} dupKeys={dupKeys} />
                  </li>
                );
              }
              if (next && selNote) {
                return (
                  <li key={i} className="snp-slot snp-slot-on snp-slot-new" data-i={i}>
                    <SlotCard
                      key={selNote.id}
                      pin={previewPin(selNote.id)}
                      note={selNote}
                      mascot={mascot}
                      dupKeys={dupKeys}
                    />
                  </li>
                );
              }
              return (
                <li key={i} className={`snp-slot${next ? ' snp-slot-next' : ''}`}>
                  <span className="snp-slot-no">{i + 1}</span>
                  {next ? '여기에 꽂혀요' : '빈 자리'}
                </li>
              );
            })}
          </ol>
          <label className="snp-search">
            <Search className="sn-icon" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목, 설교자, 구절로 찾기"
              aria-label="노트 찾기"
            />
          </label>
          {weeks.length ? (
            weeks.map((w) => (
              <section key={w.key} className="snp-week" aria-label={w.title}>
                <h3 className="snp-week-h">
                  <b>{w.title}</b>
                  <span>{w.notes.length}편</span>
                </h3>
                <div className="snp-board">
                  {w.notes.map((n) => {
                    const t = displayTitle(n, dupKeys);
                    const meta = [fmtDate(n.date), n.service, n.preacher]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <button
                        key={n.id}
                        type="button"
                        className="snp-stk"
                        aria-pressed={sel === n.id}
                        onClick={() => tap(n.id)}
                      >
                        <span className="snp-stk-rib" aria-hidden />
                        <PolaroidCover pin={previewPin(n.id)} note={n} mascot={mascot} small />
                        <span className={`snp-stk-t${t.fallback ? ' snp-fallback' : ''}`}>
                          {t.text}
                        </span>
                        <span className="snp-stk-m">{meta}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <p className="snp-empty">
              {notes.length ? '찾는 노트가 없어요' : '먼저 설교 노트를 한 편 써 보세요'}
            </p>
          )}
        </div>
      )}
      <SnSheetBar onClose={close}>
        {!editing && (
          <button
            type="button"
            className="sn-btn sn-primary"
            disabled={!sel}
            onClick={() => sel && choose(sel)}
          >
            이 노트로 꾸미기
            <ArrowRight className="sn-icon" aria-hidden />
          </button>
        )}
        {editing && (
          <button
            type="button"
            className="sn-btn sn-primary"
            disabled={sharing}
            onClick={() => void share()}
          >
            {sharing ? (
              <Loader2 className="sn-icon animate-spin" aria-hidden />
            ) : (
              <Share2 className="sn-icon" aria-hidden />
            )}
            카드 공유
          </button>
        )}
      </SnSheetBar>
    </SnOverlay>
  );
}

/** 자리에 붙은 작은 폴라로이드 */
function SlotCard({
  pin,
  note,
  mascot,
  dupKeys,
}: {
  pin: ProfilePin;
  note: SermonNote;
  mascot: MascotId;
  dupKeys: Set<string>;
}) {
  const t = displayTitle(note, dupKeys);
  return (
    <span className="snp-slot-card">
      <span className="snp-tape" aria-hidden />
      <PolaroidCover pin={pin} note={note} mascot={mascot} small />
      <span className={`snp-slot-t${t.fallback ? ' snp-fallback' : ''}`}>{t.text}</span>
    </span>
  );
}

const NTH = ['첫째', '둘째', '셋째', '넷째', '다섯째'];

/** 일요일 시작 주로 묶는다 — 이름은 "10월 넷째 주"(그 주 수요일이 속한 달 기준), 날짜 없는 노트는 맨 뒤 */
function groupByWeek(
  list: SermonNote[],
): Array<{ key: string; title: string; notes: SermonNote[] }> {
  const out: Array<{ key: string; title: string; notes: SermonNote[] }> = [];
  for (const n of list) {
    const key = weekOf(n.date) || 'none';
    let g = out.find((x) => x.key === key);
    if (!g) {
      g = { key, title: weekTitle(key), notes: [] };
      out.push(g);
    }
    g.notes.push(n);
  }
  const i = out.findIndex((x) => x.key === 'none');
  if (i >= 0) out.push(...out.splice(i, 1));
  return out;
}

function weekTitle(key: string): string {
  if (key === 'none') return '날짜 없는 노트';
  const [y, m, d] = key.split('-').map(Number);
  const wed = new Date(y, m - 1, d + 3);
  return `${wed.getMonth() + 1}월 ${NTH[Math.min(4, Math.floor((wed.getDate() - 1) / 7))]} 주`;
}

const sameSlotKey = (n: SermonNote) => `${n.date || ''}|${n.service || ''}`;

/** 제목 없는 노트 중 날짜·예배가 겹치는 것 — 이름 뒤에 첫 줄을 덧붙여 구분한다 */
function untitledDupes(notes: SermonNote[]): Set<string> {
  const seen = new Map<string, number>();
  for (const n of notes) {
    if (n.title?.trim() || mainRef(n)) continue;
    const k = sameSlotKey(n);
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  return new Set([...seen].filter(([, c]) => c > 1).map(([k]) => k));
}

/**
 * 제목이 비면 「제목 없음」 대신 알아볼 이름 — 설교 본문 구절 → "10월 26일 주일 2부"
 * (같은 날·같은 예배가 여럿이면 첫 줄 20자를 덧붙임). fallback 은 흐린 명조로 그린다.
 */
function displayTitle(n: SermonNote, dupKeys: Set<string>): { text: string; fallback: boolean } {
  const title = n.title?.trim();
  if (title) return { text: title, fallback: false };
  const r = mainRef(n);
  if (r) return { text: refLong(r), fallback: true };
  const [, m, d] = (n.date || '').split('-').map(Number);
  const base = [m && d ? `${m}월 ${d}일` : '', n.service].filter(Boolean).join(' ') || UNTITLED;
  if (!dupKeys.has(sameSlotKey(n))) return { text: base, fallback: true };
  const first = clip(plainText(n.body), 20);
  return { text: first ? `${base} · ${first}` : base, fallback: true };
}

function clip(t: string, max: number): string {
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
}
