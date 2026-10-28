import { describe, expect, it } from 'vitest';
import { normalizeNote, type SermonNote } from './sermonTypes';
import type { WorshipService } from './worship';
import {
  autoName,
  displayTitle,
  firstLine,
  isEmptyNote,
  mergeService,
  serviceKeys,
  serviceMerges,
  stickerLabel,
  tidyList,
} from './noteTidy';

const note = (id: string, c: Partial<SermonNote> = {}): SermonNote => ({
  ...normalizeNote(id, { date: '2026-10-25', service: '주일 2부', ...c }),
  ...c,
  id,
});
const W = (id: string, name: string, dow: number): WorshipService => ({
  id,
  name,
  active: true,
  slots: [{ dow, start: '11:00', end: '12:30', part: null }],
  my_part: null,
  galpi: false,
  groups: [],
});

describe('자동 이름', () => {
  it('본문 첫 줄을 쓰고 구절 블록은 건너뛴다', () => {
    expect(
      firstLine('<div class="vblock" data-ref="x">롬</div><p>은혜 받은 날</p><p>둘째</p>'),
    ).toBe('은혜 받은 날');
  });
  it('본문이 없으면 예배 + 날짜', () => {
    expect(autoName({ body: '', service: '수요예배', date: '2026-10-28' })).toBe('수요예배 10.28');
  });
  it('긴 첫 줄은 30자로 자른다', () => {
    expect([...autoName({ body: `<p>${'가'.repeat(40)}</p>`, service: '', date: '' })].length).toBe(
      31,
    );
  });
  it('제목이 있으면 그대로, 없으면 auto', () => {
    expect(displayTitle(note('a', { title: '  은혜 ' }))).toEqual({ text: '은혜', auto: false });
    expect(displayTitle(note('b', { date: '2026-10-28', service: '수요예배' }))).toEqual({
      text: '수요예배 10.28',
      auto: true,
    });
  });
});

describe('스티커 · 빈 노트', () => {
  it('구절이 있으면 「롬 5」, 없으면 반짝별', () => {
    expect(stickerLabel(note('a', { refs: ['45:5:12-14'] }))).toMatch(/ 5$/);
    expect(stickerLabel(note('b'))).toBe('✦');
  });
  it('본문·생각·녹음·구절·제목이 모두 없으면 빈 노트', () => {
    expect(isEmptyNote(note('a'))).toBe(true);
    expect(isEmptyNote(note('b', { body: '<p>x</p>' }))).toBe(false);
    expect(isEmptyNote(note('c', { title: '제목' }))).toBe(false);
  });
});

describe('예배 색 · 합치기', () => {
  const notes = [
    note('1', { service: '주일 2부', body: '<p>a</p>' }),
    note('2', { service: '주일 2부', body: '<p>a</p>' }),
    note('3', { service: '주일 설교', body: '<p>a</p>', date: '2026-10-18' }),
    note('4', { service: '수요예배', body: '<p>a</p>', date: '2026-10-28' }),
  ];
  it('예배표 순서가 먼저, 나머지는 노트 수 순서', () => {
    const keys = serviceKeys(notes, [W('w1', '수요예배', 3)]);
    expect(keys.map((k) => k.label)).toEqual(['수요예배', '주일 2부', '주일 설교']);
    expect(new Set(keys.map((k) => k.color)).size).toBe(3);
  });
  it('예배표가 없으면 같은 요일 이름끼리 적은 쪽 → 많은 쪽', () => {
    const m = serviceMerges(notes, []);
    expect(m).toHaveLength(1);
    expect(m[0].from).toBe('주일 설교');
    expect(m[0].to).toEqual({ label: '주일 2부', id: null });
  });
  it('예배표가 있으면 표 밖 이름을 같은 요일 예배로', () => {
    const m = serviceMerges(notes, [W('w1', '주일 2부', 0), W('w2', '수요예배', 3)]);
    expect(m.map((x) => [x.from, x.to.id])).toEqual([['주일 설교', 'w1']]);
  });
  it('「다른 예배예요」로 넘긴 이름은 다시 묻지 않는다', () => {
    expect(serviceMerges(notes, [], new Set(['주일 설교']))).toHaveLength(0);
  });
  it('합치면 service · service_id 를 바꾸고 자동 표시는 지운다', () => {
    const [n] = mergeService([{ ...notes[2], service_auto: true }], {
      label: '주일 2부',
      id: 'w1',
    });
    expect(n.service).toBe('주일 2부');
    expect(n.service_id).toBe('w1');
    expect(n.service_auto).toBeUndefined();
  });
});

describe('다듬기 목록', () => {
  it('빈 노트는 제목 없음 · 구절 없음과 겹쳐 세지 않는다', () => {
    const t = tidyList(
      [note('a'), note('b', { body: '<p>x</p>' }), note('c', { title: 't', body: '<p>x</p>' })],
      [],
    );
    expect(t.empty.map((n) => n.id)).toEqual(['a']);
    expect(t.untitled.map((n) => n.id)).toEqual(['b']);
    expect(t.noRef.map((n) => n.id)).toEqual(['b', 'c']);
    expect(t.count).toBe(2);
  });
});
