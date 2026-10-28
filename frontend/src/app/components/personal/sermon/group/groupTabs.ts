/**
 * 모임 안 보기(이번 주·통독·지난 주들·멤버·설정) — URL ?gtab= 에 둔다.
 * 넓은 화면은 GroupHome 위쪽 탭이, 설치 앱 좁은 화면은 하단 보기 줄(SermonList)이 같은 값을 고친다.
 */
export type GroupTab = 'week' | 'reading' | 'last' | 'members' | 'settings';

export const GROUP_TABS: Array<[GroupTab, string]> = [
  ['week', '이번 주'],
  ['reading', '통독'],
  ['last', '지난 주들'],
  ['members', '멤버'],
  ['settings', '설정'],
];

const KEYS = new Set<string>(GROUP_TABS.map(([k]) => k));

export function readGroupTab(sp: URLSearchParams): GroupTab {
  const v = sp.get('gtab') || '';
  return KEYS.has(v) ? (v as GroupTab) : 'week';
}

/** 지금 주소에서 모임 보기만 바꾼 새 주소 (이번 주는 기본이라 뺀다) */
export function withGroupTab(sp: URLSearchParams, t: GroupTab): URLSearchParams {
  const next = new URLSearchParams(sp);
  if (t === 'week') next.delete('gtab');
  else next.set('gtab', t);
  return next;
}
