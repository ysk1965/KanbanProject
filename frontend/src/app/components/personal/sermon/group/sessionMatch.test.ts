import { describe, expect, it } from 'vitest';
import type { SermonGroup, SessionSummary } from './groupApi';
import { SERVICE_PRESETS } from './servicePresets';
import {
  autoMatches,
  serviceAt,
  slotKey,
  slotPhase,
  suggestMatches,
  titleSimilarity,
  weekSlots,
  weekStartOf,
} from './sessionMatch';

const group = (over: Partial<SermonGroup> = {}): SermonGroup => ({
  id: 'g1',
  name: '청년부 2모임',
  kind: 'church',
  services: SERVICE_PRESETS,
  join_approval: true,
  me: {
    user_id: 'u1',
    role: 'member',
    status: 'active',
    display_name: '나',
    muted_service_ids: [],
  },
  members: [],
  member_count: 3,
  ...over,
});

// 2026-10-25 은 일요일
const at = (ds: string, hhmm: string) => {
  const [y, m, d] = ds.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};

describe('sessionMatch', () => {
  it('주일 2부 시간에 열면 주일 설교로 자동 연결', () => {
    const hits = autoMatches({ date: '2026-10-25' }, [group()], at('2026-10-25', '11:05'));
    expect(hits).toEqual([{ group_id: 'g1', service_id: 'sun', date: '2026-10-25', part: '2부' }]);
  });

  it('1부 30분 전부터, 끝나고 3시간까지', () => {
    expect(serviceAt(SERVICE_PRESETS, at('2026-10-25', '08:31'))?.part).toBe('1부');
    expect(serviceAt(SERVICE_PRESETS, at('2026-10-25', '17:40'))?.part).toBe('3부');
    expect(serviceAt(SERVICE_PRESETS, at('2026-10-25', '18:00'))).toBeNull();
  });

  it('끈 예배·이미 연결·거절한 자리·다른 날 노트는 자동 연결 안 함', () => {
    const muted = group({
      me: {
        user_id: 'u1',
        role: 'member',
        status: 'active',
        display_name: '나',
        muted_service_ids: ['wed'],
      },
    });
    expect(autoMatches({ date: '2026-10-28' }, [muted], at('2026-10-28', '19:40'))).toEqual([]);
    expect(
      autoMatches(
        { date: '2026-10-25', groups: [{ group_id: 'g1', date: '2026-10-25', how: 'auto' }] },
        [group()],
        at('2026-10-25', '11:05'),
      ),
    ).toEqual([]);
    expect(
      autoMatches(
        { date: '2026-10-25', group_dismissed: [slotKey('g1', 'sun', '2026-10-25')] },
        [group()],
        at('2026-10-25', '11:05'),
      ),
    ).toEqual([]);
    expect(autoMatches({ date: '2026-10-24' }, [group()], at('2026-10-25', '11:05'))).toEqual([]);
    expect(
      autoMatches(
        { date: '2026-10-25' },
        [group({ me: { user_id: 'u1', role: 'member', status: 'pending', display_name: '나' } })],
        at('2026-10-25', '11:05'),
      ),
    ).toEqual([]);
  });

  it('화요일에 같은 본문으로 쓴 노트는 주일 자리를 제안', () => {
    const s: SessionSummary = {
      id: 's1',
      service_id: 'sun',
      date: '2026-10-25',
      title: '한 사람으로 인해 모두에게 죄와 사망이 이르다',
      refs: ['44:5:12-14'],
      members: [{ user_id: 'a', state: 'written' }],
    };
    const sug = suggestMatches(
      { date: '2026-10-27', title: '죄와 은혜', refs: ['44:5:12-12'] },
      [group()],
      { g1: [s] },
    );
    expect(sug).toHaveLength(1);
    expect(sug[0].reasons).toEqual(['같은 본문', '같은 주', '1명 기록']);
    // 본문도 제목도 다르면 후보 아님
    expect(
      suggestMatches({ date: '2026-10-27', title: '산상수훈', refs: ['39:5:1-1'] }, [group()], {
        g1: [s],
      }),
    ).toEqual([]);
    // 일주일 넘으면 아님
    expect(
      suggestMatches({ date: '2026-11-02', title: '', refs: ['44:5:12-12'] }, [group()], {
        g1: [s],
      }),
    ).toEqual([]);
  });

  it('제목 유사도', () => {
    expect(titleSimilarity('한 사람으로 인해', '한사람으로 인해!')).toBe(1);
    expect(titleSimilarity('아담과 예수', '산상수훈')).toBeLessThan(0.3);
  });

  it('이번 주 자리 계산: 주일 1~3부는 하루 한 자리', () => {
    const w = weekSlots(group(), '2026-10-25');
    expect(w.map((x) => `${x.service.id}@${x.date}`)).toEqual(['sun@2026-10-25', 'wed@2026-10-28']);
    expect(w[0].part).toBe('1부~3부');
    expect(w[0].start).toBe('09:00');
    expect(w[0].end).toBe('14:50');
    expect(weekStartOf('2026-10-29')).toBe('2026-10-25');
  });

  it('자리 상태', () => {
    expect(slotPhase('2026-10-28', '19:30', '21:00', at('2026-10-28', '18:00'))).toBe('before');
    expect(slotPhase('2026-10-28', '19:30', '21:00', at('2026-10-28', '19:10'))).toBe('live');
    expect(slotPhase('2026-10-28', '19:30', '21:00', at('2026-10-29', '08:00'))).toBe('after');
  });
});
