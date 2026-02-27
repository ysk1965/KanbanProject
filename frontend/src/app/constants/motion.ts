// Motion Constants — Unified animation presets (Attio/Linear pattern)
// All components should reference these instead of hardcoding spring/duration values.

export const SPRING = {
  /** UI 반응 (버튼, 토글, 체크) — 빠르고 단단 */
  snappy: { type: 'spring' as const, stiffness: 500, damping: 35 },
  /** 카드 호버, 리스트 아이템 — 자연스러운 감속 */
  smooth: { type: 'spring' as const, stiffness: 350, damping: 30 },
  /** 모달, 패널 진입 — 무게감 있는 등장 */
  modal: { type: 'spring' as const, stiffness: 400, damping: 30 },
  /** 탭 인디케이터, 레이아웃 전환 — 느긋함 */
  gentle: { type: 'spring' as const, stiffness: 250, damping: 28 },
} as const;

export const DURATION = {
  /** 호버 색상, 토글 */
  fast: 0.15,
  /** 카드 호버 (Linear 기준) */
  normal: 0.2,
  /** 탭 전환, reveal */
  slow: 0.3,
} as const;

export const STAGGER = {
  /** 카드 리스트 */
  fast: 0.03,
  /** 위젯, 섹션 */
  normal: 0.05,
  /** 온보딩 스텝 */
  slow: 0.08,
} as const;

// Reusable animation presets
export const FADE_UP = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export const FADE_SCALE = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};
