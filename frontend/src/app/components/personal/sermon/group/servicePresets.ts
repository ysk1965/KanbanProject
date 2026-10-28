import type { GroupKind, GroupService } from './groupApi';

/** 모임 만들기 2단계 「같이 드리는 예배」 기본값 — 체크만 하면 되게 흔한 예배표를 채워 둔다 */
export const SERVICE_PRESETS: GroupService[] = [
  {
    id: 'sun',
    name: '주일 설교',
    active: true,
    slots: [
      { dow: 0, start: '09:00', end: '10:30' },
      { dow: 0, start: '11:00', end: '12:30' },
      { dow: 0, start: '13:30', end: '15:00' },
    ],
  },
  { id: 'wed', name: '수요예배', active: true, slots: [{ dow: 3, start: '19:30', end: '21:00' }] },
  {
    id: 'youth',
    name: '청년부 예배',
    active: false,
    slots: [{ dow: 0, start: '15:00', end: '16:30' }],
  },
  {
    id: 'fri',
    name: '금요 철야',
    active: false,
    slots: [{ dow: 5, start: '21:00', end: '23:00' }],
  },
  {
    id: 'dawn',
    name: '새벽기도',
    active: false,
    slots: [1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start: '05:30', end: '06:30' })),
  },
];

/** 모임 만들기 2단계 첫 화면 — 주일 설교 11:00 하나만. 다른 예배는 「예배 추가」로 */
export const GROUP_DEFAULT_SERVICES: GroupService[] = [
  { id: 'sun', name: '주일 설교', active: true, slots: [{ dow: 0, start: '11:00', end: '12:30' }] },
];

export const GROUP_KINDS: Array<{ id: GroupKind; name: string; hint: string; approval: boolean }> =
  [
    { id: 'church', name: '교회 모임', hint: '셀·구역·목장·순', approval: true },
    { id: 'study', name: '성경공부', hint: '본문 중심', approval: true },
    { id: 'family', name: '가족', hint: '부부·가족', approval: false },
    { id: 'friend', name: '친구', hint: '교회가 달라도', approval: false },
    { id: 'team', name: '사역팀', hint: '찬양팀·교사', approval: true },
  ];

export const DOW_KO = '일월화수목금토';

export function kindName(k: GroupKind): string {
  return GROUP_KINDS.find((x) => x.id === k)?.name ?? '모임';
}

/** "주일 설교 · 수요예배" */
export function servicesLabel(services: GroupService[]): string {
  return services
    .filter((s) => s.active)
    .map((s) => s.name)
    .join(' · ');
}

/** "일 9:00 · 11:00 · 13:30" */
export function slotsLabel(s: GroupService): string {
  const byDow = new Map<number, string[]>();
  s.slots.forEach((x) => {
    const arr = byDow.get(x.dow) || [];
    arr.push(x.start.replace(/^0/, ''));
    byDow.set(x.dow, arr);
  });
  const dows = [...byDow.keys()];
  if (dows.length >= 5) {
    const times = [...new Set(s.slots.map((x) => x.start.replace(/^0/, '')))].join(' · ');
    return `${DOW_KO[Math.min(...dows)]}~${DOW_KO[Math.max(...dows)]} ${times}`;
  }
  return dows.map((d) => `${DOW_KO[d]} ${byDow.get(d)!.join(' · ')}`).join(', ');
}

/** 스티커 아래 한 줄 — "일 9:00 외 2", "월~토 5:30", "수 19:30" */
export function timesSummary(s: GroupService): string {
  if (!s.slots.length) return '';
  const dows = [...new Set(s.slots.map((x) => x.dow))].sort((a, b) => a - b);
  const times = [...new Set(s.slots.map((x) => x.start))].sort();
  const days =
    dows.length >= 5 && dows[dows.length - 1] - dows[0] === dows.length - 1
      ? `${DOW_KO[dows[0]]}~${DOW_KO[dows[dows.length - 1]]}`
      : dows.map((d) => DOW_KO[d]).join('·');
  const first = times[0].replace(/^0/, '');
  return `${days} ${first}${times.length > 1 ? ` 외 ${times.length - 1}` : ''}`;
}

export function newServiceId(existing: GroupService[]): string {
  let i = existing.length + 1;
  while (existing.some((s) => s.id === `s${i}`)) i++;
  return `s${i}`;
}
