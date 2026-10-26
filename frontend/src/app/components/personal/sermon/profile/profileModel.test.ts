import { describe, expect, it } from 'vitest';
import { decRef, encRef } from '../bibleRefs';
import { normalizeNote } from '../sermonTypes';
import {
  bookLabel,
  clampVerse,
  coverInkFor,
  movePin,
  normalizeProfile,
  pinLineSuggestions,
  remapPins,
  togglePinList,
  verseSuggestions,
  type ProfilePin,
} from './profileModel';
import { booksHeard, weekStreak } from './streak';

const pin = (id: string): ProfilePin => ({ note_id: id, pattern: 'dots', sticker: 'mascot' });

describe('이름표 모델', () => {
  it('모르는 값은 기본값으로, 대표 말씀은 1~3절만, 고정은 3장·중복 없음', () => {
    const p = normalizeProfile({
      mascot: 'dragon',
      ink: 'mint',
      verse_ref: '44:5:1-8',
      verse_style: 'hand',
      visibility: 'everyone',
      pins: [pin('a'), pin('a'), pin('b'), { note_id: 'c', pattern: 'zig', ink: 'nope' }, pin('d')],
    });
    expect(p.mascot).toBe('galpi');
    expect(p.ink).toBe('mint');
    expect(p.verse_ref).toBeNull();
    expect(p.verse_style).toBe('hand');
    expect(p.visibility).toBe('groups');
    expect(p.pins.map((x) => x.note_id)).toEqual(['a', 'b', 'c']);
    expect(p.pins[2]).toEqual({ note_id: 'c', pattern: 'dots', sticker: 'mascot' });
    expect(normalizeProfile({ verse_ref: '44:5:3-4' }).verse_ref).toBe('44:5:3-4');
  });

  it('장 전체·긴 범위는 앞 세 절로 줄인다', () => {
    const whole = clampVerse({ b: 44, c: 5, v1: 1, v2: 21, whole: true });
    expect(encRef(whole.ref)).toBe('44:5:1-3');
    expect(whole.clamped).toBe(true);
    const long = clampVerse(decRef('44:5:3-8')!);
    expect(encRef(long.ref)).toBe('44:5:3-5');
    const ok = clampVerse(decRef('44:5:3-4')!);
    expect(ok.clamped).toBe(false);
  });

  it('책 이름은 장과 함께 — 로마서 5 / 롬 5, 시편은 편', () => {
    expect(bookLabel(decRef('44:5:3-4')!)).toBe('로마서 5');
    expect(bookLabel(decRef('44:5:3-4')!, true)).toBe('롬 5');
    expect(bookLabel(decRef('18:23:1-1')!)).toBe('시편 23편');
  });

  it('고정 토글: 넣기·빼기·3장이면 full, 표지 색은 겹치지 않게', () => {
    let pins: ProfilePin[] = [];
    for (const id of ['n1', 'n2', 'n3']) {
      const r = togglePinList(pins, id);
      expect(r.result).toBe('added');
      pins = r.pins;
    }
    expect(new Set(pins.map((p) => p.ink)).size).toBe(3);
    expect(togglePinList(pins, 'n4').result).toBe('full');
    const off = togglePinList(pins, 'n2');
    expect(off.result).toBe('removed');
    expect(off.pins.map((p) => p.note_id)).toEqual(['n1', 'n3']);
    expect(coverInkFor('x')).toBe(coverInkFor('x'));
    expect(coverInkFor('x').startsWith('mono')).toBe(false);
  });

  it('순서 바꾸기·id 바뀜 따라가기', () => {
    const pins = [pin('a'), pin('b'), pin('c')];
    expect(movePin(pins, 'b', -1).map((p) => p.note_id)).toEqual(['b', 'a', 'c']);
    expect(movePin(pins, 'a', -1)).toBe(pins);
    expect(remapPins(pins, 'b', 'srv-b')!.map((p) => p.note_id)).toEqual(['a', 'srv-b', 'c']);
    expect(remapPins(pins, 'zz', 'y')).toBeNull();
  });

  it('대표 말씀 추천은 1~3절 구절을 많이 쓴 순서', () => {
    const n1 = normalizeNote('1', { refs: ['44:5:3-4', '44:5:1-21w'], updated_at: 1 });
    const n2 = normalizeNote('2', { refs: ['44:5:3-4', '18:23:1-1'], updated_at: 2 });
    const s = verseSuggestions([n1, n2]).map(encRef);
    expect(s).toEqual(['44:5:3-4', '18:23:1-1']);
  });

  it('내 한 줄 추천: 생각들 + 본문 첫 문장, 40자로 자름', () => {
    const n = normalizeNote('1', {
      body: '<p>환난은 인내를 이룬다. 둘째 문장</p>',
      thoughts: [
        { id: 't', tag: '생각', text: '버티는 게 아니라 이루어지는 중', at: 0 },
        { id: 'u', tag: '적용', text: '가'.repeat(60), at: 0 },
      ],
    } as never);
    const s = pinLineSuggestions(n);
    expect(s[0]).toBe('버티는 게 아니라 이루어지는 중');
    expect([...s[1]].length).toBe(40);
    expect(s[2]).toBe('환난은 인내를 이룬다.');
  });

  it('이어 쓰기는 주 단위, 들은 말씀은 책 수', () => {
    const today = new Date(2026, 9, 28); // 수요일
    const notes = ['2026-10-25', '2026-10-19', '2026-10-12', '2026-09-20'].map((d, i) =>
      normalizeNote(String(i), { date: d, refs: i < 2 ? ['44:5:3-4'] : ['18:23:1-1'] }),
    );
    expect(weekStreak(notes, today)).toBe(3);
    expect(booksHeard(notes)).toBe(2);
  });
});
