import { describe, expect, it } from 'vitest';
import type { SermonGroup } from './group/groupApi';
import { linkMatches } from './group/sessionMatch';
import { galpiByWeek, normalizeNote, type SermonNote } from './sermonTypes';
import {
  fillWorship,
  guessMatch,
  normalizeWorship,
  setGroupMatch,
  suggestWorship,
  weekWorshipSlots,
  worshipAt,
  worshipForGroupService,
  worshipFromLegacy,
  worshipLabel,
  type WorshipService,
} from './worship';

const SUN = (start: string, end: string) => ({ dow: 0, start, end, part: null });

const sunday: WorshipService = {
  id: 'w1',
  name: '주일 설교',
  active: true,
  slots: [SUN('09:00', '10:30'), SUN('11:00', '12:30'), SUN('13:30', '15:00')],
  my_part: '11:00',
  galpi: true,
  groups: [],
};
const wed: WorshipService = {
  id: 'w2',
  name: '수요예배',
  active: true,
  slots: [{ dow: 3, start: '19:30', end: '21:00', part: null }],
  galpi: false,
  groups: [],
};

// 2026-10-25 = 일요일
const at = (ymd: string, hm: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};

describe('내 예배표', () => {
  it('다듬기: 모르는 값은 버리고 갈피는 하나만, 서버의 auto 는 active 로', () => {
    const list = normalizeWorship([
      {
        id: 'a',
        name: ' 주일  2부 ',
        slots: [{ dow: 0, start: '11:00' }],
        galpi: true,
        auto: false,
      },
      {
        id: 'b',
        name: '수요',
        slots: [
          { dow: 9, start: '19:30' },
          { dow: 3, start: '7:30' },
        ],
        galpi: true,
      },
      { id: 'a', name: '중복' },
      { name: '이름만' },
    ]);
    expect(list.map((s) => s.id)).toEqual(['a', 'b']);
    expect(list[0]).toMatchObject({ name: '주일 2부', active: false, galpi: true });
    expect(list[0].slots[0].end).toBe('12:30');
    expect(list[1]).toMatchObject({ galpi: false, slots: [] });
  });

  it('내 부: 시각 순서로 「n부」를 붙이고 그 시각만 판정한다', () => {
    expect(worshipLabel(sunday)).toBe('주일 설교 2부');
    expect(worshipLabel({ ...sunday, name: '주일 2부' })).toBe('주일 2부');
    expect(worshipLabel({ ...sunday, my_part: null })).toBe('주일 설교');
    // 9:10 은 1부 시간이지만 내 부(11:00)의 −30분 밖
    expect(worshipAt([sunday], at('2026-10-25', '09:10'))).toBeNull();
    expect(worshipAt([sunday], at('2026-10-25', '10:35'))?.id).toBe('w1');
    expect(worshipAt([sunday], at('2026-10-25', '15:20'))?.id).toBe('w1');
    expect(worshipAt([sunday], at('2026-10-25', '15:40'))).toBeNull();
    expect(worshipAt([{ ...sunday, active: false }], at('2026-10-25', '11:05'))).toBeNull();
  });

  it('새 노트 채우기: 오늘 노트만, 예배 이름·id·자동 표시', () => {
    const n = normalizeNote('n', { date: '2026-10-25', service: '주일 2부' });
    const f = fillWorship(n, [sunday, wed], at('2026-10-25', '11:05'), { force: true });
    expect(f).toMatchObject({ service: '주일 설교 2부', service_id: 'w1', service_auto: true });
    expect(
      fillWorship({ ...n, date: '2026-10-24' }, [sunday], at('2026-10-25', '11:05')),
    ).toBeNull();
    expect(fillWorship({ ...n, service_id: 'x' }, [sunday], at('2026-10-25', '11:05'))).toBeNull();
    expect(fillWorship(n, [sunday], at('2026-10-25', '20:00'))).toBeNull();
  });

  it('옛 「내 주일 예배」 이름은 시간 없는 갈피 예배 하나로', () => {
    expect(worshipFromLegacy('주일 3부')).toMatchObject([
      { name: '주일 3부', galpi: true, slots: [] },
    ]);
    expect(worshipFromLegacy(null)).toEqual([]);
  });

  it('처음 설정 제안: 같은 이름·요일 2번 이상, 시각은 30분 단위로 내림, 일요일 최다가 갈피', () => {
    const mk = (id: string, date: string, hm: string, service: string): SermonNote => ({
      ...normalizeNote(id, { date, service }),
      created_at: at(date, hm).getTime(),
    });
    const notes = [
      mk('a', '2026-10-25', '11:12', '주일 2부'),
      mk('b', '2026-10-18', '11:40', '주일 2부'),
      mk('c', '2026-10-11', '11:05', '주일 2부'),
      mk('d', '2026-10-21', '19:45', '수요예배'),
      mk('e', '2026-10-14', '19:50', '수요예배'),
      mk('f', '2026-10-24', '06:00', '새벽기도'),
    ];
    const rows = suggestWorship(notes, at('2026-10-26', '12:00'));
    expect(rows.map((r) => [r.name, r.slots[0].dow, r.slots[0].start, r.galpi, r.count])).toEqual([
      ['주일 2부', 0, '11:00', true, 3],
      ['수요예배', 3, '19:30', false, 2],
    ]);
  });

  it('이번 주 자리: 요일마다 한 칸 (내 부 시각)', () => {
    const rows = weekWorshipSlots([sunday, wed], '2026-10-25');
    expect(rows.map((r) => [r.date, r.service.id, r.start])).toEqual([
      ['2026-10-25', 'w1', '11:00'],
      ['2026-10-28', 'w2', '19:30'],
    ]);
  });
});

describe('갈피 예배', () => {
  it('갈피 예배 id 가 있으면 요일과 상관없이 그 예배 노트, 없으면 일요일 노트', () => {
    const sat = normalizeNote('sat', { date: '2026-10-31', service: '청년부', service_id: 'y' });
    const sun = normalizeNote('sun', { date: '2026-10-25', service: '주일 2부' });
    const rule = { auto: true, service: '청년부', serviceId: 'y' };
    expect(galpiByWeek([sat, sun], rule).get('2026-10-25')?.id).toBe('sat');
    // 갈피 예배 노트가 없는 주는 지금처럼 일요일 노트
    expect(galpiByWeek([sun], rule).get('2026-10-25')?.id).toBe('sun');
    // id 없는 옛 노트는 이름으로
    const old = normalizeNote('old', { date: '2026-10-31', service: '청년부' });
    expect(galpiByWeek([old, sun], rule).get('2026-10-25')?.id).toBe('old');
  });
});

describe('모임 예배 ↔ 내 예배 짝', () => {
  const group = (id: string, services: SermonGroup['services'], muted: string[] = []) =>
    ({
      id,
      name: id,
      kind: 'church',
      services,
      join_approval: false,
      me: {
        user_id: 'me',
        role: 'member',
        status: 'active',
        display_name: '나',
        muted_service_ids: muted,
      },
      members: [],
      member_count: 1,
    }) as SermonGroup;
  const cell = group('cell', [
    {
      id: 'sun',
      name: '주일 설교',
      active: true,
      slots: [SUN('09:00', '10:30'), SUN('11:00', '12:30')],
    },
  ]);
  // 교회가 다른 친구 모임 — 주일 13:30
  const friend = group('friend', [
    { id: 's1', name: '주일 예배', active: true, slots: [SUN('13:30', '15:00')] },
  ]);

  it('짝짓기: 모임 예배 하나 ↔ 내 예배 하나, 다른 내 예배로 옮기면 이전 짝은 풀린다', () => {
    let list = setGroupMatch([sunday, wed], 'cell', 'sun', 'w1');
    expect(worshipForGroupService(list, 'cell', 'sun')?.id).toBe('w1');
    list = setGroupMatch(list, 'cell', 'sun', 'w2');
    expect(worshipForGroupService(list, 'cell', 'sun')?.id).toBe('w2');
    expect(list[0].groups).toEqual([]);
    list = setGroupMatch(list, 'cell', 'sun', null);
    expect(worshipForGroupService(list, 'cell', 'sun')).toBeNull();
  });

  it('추천: 시간이 겹치는 내 예배 → 이름이 같은 내 예배', () => {
    expect(guessMatch([wed, sunday], cell.services[0])?.id).toBe('w1');
    const named = { ...wed, id: 'w3', name: '주일 예배', slots: [] };
    expect(guessMatch([wed, named], friend.services[0])?.id).toBe('w3');
    expect(guessMatch([wed], friend.services[0])).toBeNull();
  });

  it('노트의 내 예배와 짝지은 모임은 모임 시간과 상관없이 붙고, 짝지은 모임 예배는 시간으로 붙지 않는다', () => {
    const list = setGroupMatch(
      setGroupMatch([sunday, wed], 'cell', 'sun', 'w1'),
      'friend',
      's1',
      'w1',
    );
    const note = {
      ...normalizeNote('n', { date: '2026-10-25', service: '주일 설교 2부', service_id: 'w1' }),
    };
    const r = linkMatches(note, [cell, friend], list, at('2026-10-25', '11:05'));
    expect(r.mapped.map((l) => [l.group_id, l.service_id, l.date])).toEqual([
      ['cell', 'sun', '2026-10-25'],
      ['friend', 's1', '2026-10-25'],
    ]);
    expect(r.hits).toEqual([]);

    // 다른 노트(예배 칸 없음)를 친구 모임 시간에 열어도, 짝지은 예배라 시간으로는 안 붙는다
    const other = normalizeNote('o', { date: '2026-10-25', service: '' });
    expect(linkMatches(other, [friend], list, at('2026-10-25', '13:40')).hits).toEqual([]);
    // 짝이 없으면 지금처럼 시간으로
    expect(linkMatches(other, [friend], [sunday], at('2026-10-25', '13:40')).hits).toHaveLength(1);
  });

  it('지난 노트·거절한 자리·안 드리는 예배는 붙이지 않는다', () => {
    const list = setGroupMatch([sunday], 'cell', 'sun', 'w1');
    const base = normalizeNote('n', {
      date: '2026-10-25',
      service: '주일 설교 2부',
      service_id: 'w1',
    });
    expect(
      linkMatches({ ...base, date: '2026-10-18' }, [cell], list, at('2026-10-25', '11:05')).mapped,
    ).toEqual([]);
    expect(
      linkMatches(
        { ...base, group_dismissed: ['cell|sun|2026-10-25'] },
        [cell],
        list,
        at('2026-10-25', '11:05'),
      ).mapped,
    ).toEqual([]);
    const muted = group('cell', cell.services, ['sun']);
    expect(linkMatches(base, [muted], list, at('2026-10-25', '11:05')).mapped).toEqual([]);
  });
});
