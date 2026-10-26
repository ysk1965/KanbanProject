import { BOOKS, PSALMS, decRef, encRef, type Ref } from '../bibleRefs';
import type { MascotState } from '../Mascot';
import { INKS, MASCOTS, type InkId, type MascotId, type SermonLook } from '../sermonLook';
import { noteRefs, plainText, type SermonNote } from '../sermonTypes';

/**
 * 「나의 갈피」 이름표 + 고정한 노트(폴라로이드 3장) 모델. 소속 교회는 챌린지(challenge/ChurchPicker)가 원본이라 여기 없다.
 * 서버와 같은 모양(snake_case)으로 들고 있는다.
 * 기기 캐시: localStorage `sermon-profile-v1:<userId>` — 로그인 전(anon)은 여기에만 산다.
 */

export type PinPattern = 'dots' | 'lines' | 'stars' | 'plain';
export type PinSticker = 'mascot' | 'none';
export type Visibility = 'private' | 'groups' | 'link';
export type VerseStyle = 'serif' | 'hand';

export interface ProfilePin {
  note_id: string;
  /** 표지 색 (잉크 id) */
  ink?: InkId;
  pattern: PinPattern;
  sticker: PinSticker;
  /** 내 한 줄 (40자) */
  line?: string;
}

export interface SermonProfileData {
  mascot: MascotId;
  mascot_state: MascotState;
  ink: InkId;
  /** encRef, 1~3절 */
  verse_ref?: string | null;
  verse_style: VerseStyle;
  visibility: Visibility;
  pins: ProfilePin[];
}

export const MAX_PINS = 3;
export const MAX_VERSES = 3;
export const PIN_LINE_MAX = 40;

export const PATTERNS: Array<{ id: PinPattern; name: string }> = [
  { id: 'dots', name: '망점' },
  { id: 'lines', name: '빗금' },
  { id: 'stars', name: '반짝' },
  { id: 'plain', name: '민무늬' },
];
export const MASCOT_STATES: Array<{ id: MascotState; name: string }> = [
  { id: 'idle', name: '둥실' },
  { id: 'listen', name: '듣는 중' },
  { id: 'done', name: '기뻐요' },
  { id: 'think', name: '생각 중' },
  { id: 'sleep', name: '쉬는 중' },
];
export const VISIBILITIES: Array<{ id: Visibility; name: string; desc: string }> = [
  { id: 'groups', name: '내 모임', desc: '같은 모임 사람만' },
  { id: 'private', name: '나만', desc: '아무에게도 안 보여요' },
  { id: 'link', name: '로그인한 누구나', desc: '링크를 받은 사람도' },
];

const INK_IDS = new Set<string>(INKS.map((i) => i.id));
const MASCOT_IDS = new Set<string>(MASCOTS.map((m) => m.id));
const STATE_IDS = new Set<string>(MASCOT_STATES.map((s) => s.id));
const PATTERN_IDS = new Set<string>(PATTERNS.map((p) => p.id));
const VIS_IDS = new Set<string>(VISIBILITIES.map((v) => v.id));
/** 고정할 때 표지 색 기본값 — 모노는 빼고 파스텔에서 고른다 */
const COVER_INKS = INKS.filter((i) => !i.id.startsWith('mono')).map((i) => i.id);

export function defaultProfile(look?: SermonLook): SermonProfileData {
  return {
    mascot: look?.mascot ?? 'galpi',
    mascot_state: 'idle',
    ink: look?.ink ?? 'cotton',
    verse_ref: null,
    verse_style: 'serif',
    visibility: 'groups',
    pins: [],
  };
}

function clip(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return [...t].slice(0, max).join('');
}

/** 서버 응답·기기 캐시를 믿지 않고 고르게 다듬는다 (모르는 값은 기본값) */
export function normalizeProfile(raw: unknown, look?: SermonLook): SermonProfileData {
  const d = defaultProfile(look);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ok: Set<string>, fb: T): T =>
    typeof v === 'string' && ok.has(v) ? (v as T) : fb;
  const verse = typeof r.verse_ref === 'string' ? decRef(r.verse_ref) : null;
  const seen = new Set<string>();
  const pins: ProfilePin[] = [];
  if (Array.isArray(r.pins)) {
    for (const p of r.pins as Array<Record<string, unknown>>) {
      const id = typeof p?.note_id === 'string' ? p.note_id : '';
      if (!id || seen.has(id) || pins.length >= MAX_PINS) continue;
      seen.add(id);
      const pin: ProfilePin = {
        note_id: id,
        pattern: pick(p.pattern, PATTERN_IDS, 'dots'),
        sticker: p.sticker === 'none' ? 'none' : 'mascot',
      };
      if (typeof p.ink === 'string' && INK_IDS.has(p.ink)) pin.ink = p.ink as InkId;
      const line = clip(p.line, PIN_LINE_MAX);
      if (line) pin.line = line;
      pins.push(pin);
    }
  }
  return {
    mascot: pick(r.mascot, MASCOT_IDS, d.mascot),
    mascot_state: pick(r.mascot_state, STATE_IDS, d.mascot_state),
    ink: pick(r.ink, INK_IDS, d.ink),
    verse_ref: verse && !verse.whole && verse.v2 - verse.v1 < MAX_VERSES ? encRef(verse) : null,
    verse_style: r.verse_style === 'hand' ? 'hand' : 'serif',
    visibility: pick(r.visibility, VIS_IDS, d.visibility),
    pins,
  };
}

export function sameProfile(a: SermonProfileData, b: SermonProfileData): boolean {
  return JSON.stringify(normalizeProfile(a)) === JSON.stringify(normalizeProfile(b));
}

/** 대표 말씀은 1~3절 — 장 전체나 긴 범위는 앞 세 절로 줄인다 */
export function clampVerse(r: Ref): { ref: Ref; clamped: boolean } {
  if (!r.whole && r.v2 - r.v1 < MAX_VERSES) return { ref: r, clamped: false };
  const v1 = r.whole ? 1 : r.v1;
  return {
    ref: { b: r.b, c: r.c, v1, v2: Math.min(v1 + MAX_VERSES - 1, r.v2), whole: false },
    clamped: true,
  };
}

/** 「로마서 5」 / 짧게 「롬 5」 — 장 번호만 쓰지 않고 항상 책 이름과 함께 */
export function bookLabel(r: Ref, short = false): string {
  const b = BOOKS[r.b];
  return `${short ? b[1] : b[0]} ${r.c}${!short && r.b === PSALMS ? '편' : ''}`;
}

/** 내 노트에서 대표 말씀 추천 — 1~3절 구절을 많이 쓴 순서 (같으면 최근) */
export function verseSuggestions(notes: SermonNote[], limit = 4): Ref[] {
  const tally = new Map<string, { r: Ref; n: number; at: number }>();
  for (const note of notes) {
    for (const r of noteRefs(note)) {
      if (r.whole || r.v2 - r.v1 >= MAX_VERSES) continue;
      const k = encRef(r);
      const cur = tally.get(k);
      if (cur) {
        cur.n += 1;
        cur.at = Math.max(cur.at, note.updated_at || 0);
      } else tally.set(k, { r, n: 1, at: note.updated_at || 0 });
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.n - a.n || b.at - a.at)
    .slice(0, limit)
    .map((x) => x.r);
}

/** 잉크 id → 표지 두 색 */
export function inkPair(ink: string | undefined): [string, string] {
  const sw = INKS.find((i) => i.id === ink)?.sw ?? INKS[0].sw;
  return [sw[0], sw[1]];
}

/** 노트 id 로 표지 색을 정한다 — 이미 쓰인 색은 피한다 */
export function coverInkFor(noteId: string, used: Array<InkId | undefined> = []): InkId {
  let h = 0;
  for (const ch of noteId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const start = h % COVER_INKS.length;
  for (let i = 0; i < COVER_INKS.length; i++) {
    const ink = COVER_INKS[(start + i) % COVER_INKS.length];
    if (!used.includes(ink)) return ink;
  }
  return COVER_INKS[start];
}

export type PinToggle = 'added' | 'removed' | 'full';

export function togglePinList(
  pins: ProfilePin[],
  noteId: string,
): { pins: ProfilePin[]; result: PinToggle } {
  if (pins.some((p) => p.note_id === noteId)) {
    return { pins: pins.filter((p) => p.note_id !== noteId), result: 'removed' };
  }
  if (pins.length >= MAX_PINS) return { pins, result: 'full' };
  const pin: ProfilePin = {
    note_id: noteId,
    ink: coverInkFor(
      noteId,
      pins.map((p) => p.ink),
    ),
    pattern: 'dots',
    sticker: 'mascot',
  };
  return { pins: [...pins, pin], result: 'added' };
}

export function movePin(pins: ProfilePin[], noteId: string, dir: -1 | 1): ProfilePin[] {
  const i = pins.findIndex((p) => p.note_id === noteId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= pins.length) return pins;
  const next = [...pins];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 로컬 id → 서버 id 로 바뀌면 고정 목록도 따라간다 */
export function remapPins(pins: ProfilePin[], from: string, to: string): ProfilePin[] | null {
  if (!pins.some((p) => p.note_id === from)) return null;
  return pins.map((p) => (p.note_id === from ? { ...p, note_id: to } : p));
}

/** 「내 한 줄」 추천 — 내 생각들, 본문 첫 문장 (40자 안) */
export function pinLineSuggestions(note: SermonNote, limit = 4): string[] {
  const out: string[] = [];
  const add = (s: string | undefined | null) => {
    const t = clip(s, 200);
    if (!t) return;
    const short =
      [...t].length > PIN_LINE_MAX ? `${[...t].slice(0, PIN_LINE_MAX - 1).join('')}…` : t;
    if (!out.includes(short)) out.push(short);
  };
  for (const t of note.thoughts || []) add(t.text);
  const first = plainText(note.body).split(/(?<=[.!?。])\s|\n/)[0];
  add(first);
  return out.slice(0, limit);
}

/* ───── 기기 캐시 ───── */
export interface ProfileCache {
  data: SermonProfileData;
  /** 서버에 아직 못 올린 변경이 있음 */
  dirty: boolean;
}
const CACHE = (userId: string) => `sermon-profile-v1:${userId}`;

export function readCache(userId: string, look?: SermonLook): ProfileCache | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE(userId)) || 'null') as {
      data?: unknown;
      dirty?: boolean;
    } | null;
    if (!raw || !raw.data) return null;
    return { data: normalizeProfile(raw.data, look), dirty: !!raw.dirty };
  } catch {
    return null;
  }
}

export function writeCache(userId: string, c: ProfileCache) {
  try {
    localStorage.setItem(CACHE(userId), JSON.stringify(c));
  } catch {
    /* 저장 공간 없음 — 세션 동안만 */
  }
}
