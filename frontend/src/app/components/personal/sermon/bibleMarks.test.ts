import { describe, expect, it } from 'vitest';
import { bookCounts, chKey, collectMarks, marksOn, nextMarked } from './bibleMarks';
import { normalizeNote } from './sermonTypes';

const thought = (id: string, aid: string | null, text: string, label: string | null = null) => ({
  id,
  tag: '생각' as const,
  text,
  media: [],
  t: null,
  aid,
  label,
  at: 0,
});

// 롬 = 44, 창 = 0
const a = {
  ...normalizeNote('a', { date: '2026-10-25', title: '한 사람으로 인해' }),
  refs: ['44:5:12-14'],
  body:
    '<p data-aid="p1">서론</p>' +
    '<div class="sn-vblock" data-ref="0:2:17-17" data-aid="b1"></div>' +
    '<p data-aid="p2">짝 구절 <span class="sn-vchip" data-ref="44:5:19-19">롬 5:19</span></p>' +
    '<div class="sn-vblock" data-ref="44:5:12-14" data-aid="b2"></div>',
  thoughts: [
    thought('t1', 'b2', '한 사람이 두 번'),
    thought('t2', 'p2', '12절의 거울'),
    thought('t3', 'p1', '서론 메모'),
    thought('t4', 'b1', '   '),
  ],
};
const b = {
  ...normalizeNote('b', { date: '2026-10-11', title: '아직 죄인 되었을 때' }),
  refs: ['44:5:8-8', '44:6:1-23w'],
  body: '',
  thoughts: [thought('u1', null, '아직!', '롬 5:8')],
};

describe('성경 읽기 — 노트가 남긴 손글씨', () => {
  const map = collectMarks([a, b]);
  const rom5 = map.get(chKey(44, 5))!;

  it('설교 본문은 main, 본문 속 블록·칩은 quote, 같은 구절은 하나로', () => {
    expect(rom5.map((m) => [m.note.id, m.kind, m.ref.v1, m.aid])).toEqual([
      ['b', 'main', 8, null],
      ['a', 'main', 12, 'b2'],
      ['a', 'quote', 19, 'p2'],
    ]);
    expect(map.get(chKey(0, 2))![0]).toMatchObject({ kind: 'quote', aid: 'b1' });
  });

  it('그 자리(aid)나 구절 이름(label)에 연결된 생각만, 빈 생각은 뺀다', () => {
    expect(rom5[0].thoughts.map((t) => t.id)).toEqual(['u1']);
    expect(rom5[1].thoughts.map((t) => t.id)).toEqual(['t1']);
    expect(rom5[2].thoughts.map((t) => t.id)).toEqual(['t2']);
    expect(map.get(chKey(0, 2))![0].thoughts).toEqual([]);
  });

  it('절에 걸친 자국, 장 전체 인용은 절에 칠하지 않는다', () => {
    expect(marksOn(rom5, 13).map((m) => m.note.id)).toEqual(['a']);
    expect(marksOn(rom5, 15)).toEqual([]);
    expect(map.get(chKey(44, 6))![0].ref.whole).toBe(true);
    expect(marksOn(map.get(chKey(44, 6)), 3)).toEqual([]);
  });

  it('권별 수와 다음 손글씨 장', () => {
    expect(bookCounts(map).get(44)).toBe(4);
    expect(nextMarked(map, 44, 5)).toEqual({ b: 44, c: 6 });
    expect(nextMarked(map, 44, 6)).toEqual({ b: 0, c: 2 });
    expect(nextMarked(new Map(), 0, 1)).toBeNull();
  });
});
