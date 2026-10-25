/**
 * 설교 노트 「꾸미기」 — 잉크(색 조합)와 마스코트를 사용자가 고른다.
 * 기기 저장(localStorage)만. 서식 설정(sermonStyle)처럼 서버 보관은 후속.
 * 잉크는 <html data-sn-ink> 로 건다 — 포털(.sn-scope)로 띄운 오버레이에도 같은 색이 닿게 하려고.
 */

export const INKS = [
  { id: 'cotton', name: '코튼캔디', sw: ['#ffb3d1', '#c3b5f5'] },
  { id: 'strawberry', name: '딸기우유', sw: ['#f49ac1', '#8fb8ec'] },
  { id: 'mint', name: '민트 라벤더', sw: ['#86d9c0', '#aba2ef'] },
  { id: 'peach', name: '피치 버터', sw: ['#ffd76a', '#ffb38a'] },
  { id: 'lilac', name: '라일락 세이지', sw: ['#a8cc9f', '#bba6e6'] },
  { id: 'lemon', name: '레몬 소다', sw: ['#ffe27a', '#8fd8e8'] },
  { id: 'blueberry', name: '블루베리 요거트', sw: ['#f9d9a8', '#a7b7f2'] },
  { id: 'mono', name: '모노', sw: ['#8d919b', '#c9ccd3'] },
  { id: 'monopink', name: '모노 + 분홍', sw: ['#f28fb6', '#c9ccd3'] },
] as const;
export type InkId = (typeof INKS)[number]['id'];

export const MASCOTS = [
  { id: 'galpi', name: '갈피', desc: '성경 가름끈' },
  { id: 'dong', name: '동글', desc: '망점 한 알' },
  { id: 'bang', name: '방울', desc: '은혜의 단비' },
  { id: 'banjjak', name: '반짝', desc: '깨달음의 별' },
] as const;
export type MascotId = (typeof MASCOTS)[number]['id'];

export interface SermonLook {
  ink: InkId;
  mascot: MascotId;
}

export const LOOK_DEFAULT: SermonLook = { ink: 'cotton', mascot: 'galpi' };
const KEY = 'sermon-look-v1';

export function mascotName(id: MascotId): string {
  return MASCOTS.find((m) => m.id === id)?.name ?? '갈피';
}

export function loadLook(): SermonLook {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<SermonLook> | null;
    return {
      ink: INKS.some((i) => i.id === raw?.ink) ? (raw!.ink as InkId) : LOOK_DEFAULT.ink,
      mascot: MASCOTS.some((m) => m.id === raw?.mascot)
        ? (raw!.mascot as MascotId)
        : LOOK_DEFAULT.mascot,
    };
  } catch {
    return { ...LOOK_DEFAULT };
  }
}

export function persistLook(l: SermonLook) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* 저장 공간 없음 — 세션 동안만 유지 */
  }
}

/** 잉크를 html 에 건다. 설교 노트를 떠날 때 지울 함수를 돌려준다 */
export function applyInk(ink: InkId): () => void {
  const el = document.documentElement;
  el.dataset.snInk = ink;
  return () => {
    if (el.dataset.snInk === ink) delete el.dataset.snInk;
  };
}
