import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * 설교 노트 마이크로 인터랙션 도우미. 움직임 자체는 sermon.css 「마이크로 인터랙션」에 있고,
 * 여기서는 "언제 한 번 움직일지"만 정한다.
 *  - 첫 렌더·동기화로 상태가 바뀔 때는 움직이지 않고, 사용자가 누른 그 순간에만 움직인다
 *  - 예배 중 화면이 시끄럽지 않게 반복 애니메이션은 만들지 않는다
 */

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 방금 누른 것 표시. fire(key) 하면 잠깐 fx === key 가 되고, 컴포넌트는 data-fx 로 CSS 애니메이션을 건다.
 * 같은 key 를 연달아 눌러도 다시 움직이도록 n 을 함께 돌려준다 (key={n} 등으로 재시작).
 */
export function useFx(ms = 900): [string | null, (key: string) => void, number] {
  const [state, setState] = useState<{ key: string | null; n: number }>({ key: null, n: 0 });
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fire = useCallback(
    (key: string) => {
      clearTimeout(timer.current);
      setState((s) => ({ key, n: s.n + 1 }));
      timer.current = setTimeout(() => setState((s) => ({ ...s, key: null })), ms);
    },
    [ms],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return [state.key, fire, state.n];
}

/**
 * 순서가 바뀐 자식들을 원래 자리에서 새 자리로 미끄러뜨린다 (FLIP).
 * 자식에 data-flip="고유키" 를 달고, 순서가 바뀌는 계기를 dep 으로 넘긴다.
 */
export function useFlip(ref: RefObject<HTMLElement>, dep: unknown) {
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(':scope > [data-flip]'));
    const next = new Map<string, number>();
    for (const el of els) next.set(el.dataset.flip!, el.getBoundingClientRect().top);
    if (!prefersReducedMotion() && typeof root.animate === 'function') {
      for (const el of els) {
        const was = last.current.get(el.dataset.flip!);
        const dy = was === undefined ? 0 : was - next.get(el.dataset.flip!)!;
        if (Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
          duration: 320,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        });
      }
    }
    last.current = next;
  }, [ref, dep]);
}

const SEEN_MAX = 400;

/**
 * 이 기기에서 처음 보는 항목만 골라 준다 (새 스티커가 한 번만 떨어져 붙게).
 * 이 기기에서 처음 연 화면이면(본 기록이 없으면) 이번에는 아무것도 고르지 않는다 —
 * 새 기기에서 동기화로 들어오는 노트가 줄줄이 떨어지지 않게.
 */
export function useFirstSeen(storageKey: string, ids: string[]): Set<string> {
  const [seen] = useState<Set<string> | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set<string>(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  const fresh = useRef(new Set<string>());
  if (seen) for (const id of ids) if (!seen.has(id)) fresh.current.add(id);

  const sig = ids.join('|');
  useEffect(() => {
    try {
      const prev: string[] = JSON.parse(localStorage.getItem(storageKey) || '[]');
      const all = Array.from(new Set([...ids, ...prev])).slice(0, SEEN_MAX);
      localStorage.setItem(storageKey, JSON.stringify(all));
    } catch {
      /* 저장 못 하면 다음에 다시 움직일 뿐 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, sig]);

  return fresh.current;
}

/** 앞쪽 끝이 먼저 가고 뒤쪽 끝이 따라오는 시간 — sermonNav.css .sn-tab-ind */
const JELLY_LEAD = '220ms cubic-bezier(0.3, 1.3, 0.5, 1)';
const JELLY_TAIL = '380ms cubic-bezier(0.3, 1.2, 0.5, 1) 90ms';

interface JellyOpts {
  /** 'y' = 세로 목록(top/bottom), 'x' = 가로 줄(left/right) */
  axis?: 'x' | 'y';
  /** 표시가 따라갈 항목 — 기본은 탭 */
  item?: string;
  /** 목록이 나중에 그려지는 곳(모달 등) — 이 값이 바뀌면 다시 자리를 잡는다 */
  dep?: unknown;
}

/**
 * 탭 목록의 「말랑 늘어나기」 표시. 표시 요소의 양 끝을 따로 움직여
 * 가는 방향 끝이 먼저 늘어나고 반대 끝이 따라온다. 목록은 position: relative 여야 한다.
 * 첫 렌더·크기 변화(뱃지, 좁은 화면에서 돌아옴)에는 움직이지 않고 제자리로만 옮긴다.
 */
export function useJellyTab(
  active: number,
  { axis = 'y', item = '[role="tab"]', dep }: JellyOpts = {},
) {
  const listRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  const placed = useRef('');

  useLayoutEffect(() => {
    const list = listRef.current;
    const ind = indRef.current;
    if (!list || !ind) return;
    const [a, b] = axis === 'y' ? (['top', 'bottom'] as const) : (['left', 'right'] as const);
    const place = (from: number | null) => {
      const btn = list.querySelectorAll<HTMLElement>(item)[active];
      if (!btn || !list.offsetHeight) return; // 좁은 화면에서는 숨는 목록도 있다
      const start = axis === 'y' ? btn.offsetTop : btn.offsetLeft;
      const end =
        axis === 'y'
          ? list.offsetHeight - start - btn.offsetHeight
          : list.clientWidth - start - btn.offsetWidth;
      const key = `${start}/${end}`;
      if (key === placed.current) return;
      placed.current = key;
      ind.style.transition =
        from === null || from === active || prefersReducedMotion()
          ? 'none'
          : active > from
            ? `${b} ${JELLY_LEAD}, ${a} ${JELLY_TAIL}`
            : `${a} ${JELLY_LEAD}, ${b} ${JELLY_TAIL}`;
      ind.style[a] = `${start}px`;
      ind.style[b] = `${end}px`;
      if (axis === 'x') {
        ind.style.top = `${btn.offsetTop}px`;
        ind.style.height = `${btn.offsetHeight}px`;
      }
      ind.dataset.ready = 'true';
    };
    place(prev.current);
    prev.current = active;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place(null));
    ro.observe(list);
    return () => ro.disconnect();
  }, [active, axis, item, dep]);

  return { listRef, indRef };
}

/**
 * 고르는 버튼(라디오·탭·켜고 끄는 버튼)을 누르면 한 번 톡 — sermon.css 「누르면 톡」.
 * 화면마다 data-fx 를 다는 대신 문서에 한 번만 걸어 두고, 누른 버튼에 data-tap 을 잠깐 단다.
 * 이미 자기 움직임이 있는 곳(하단·옆 탭, 적용 체크, 모임 탭)과 data-notap 아래는 건너뛴다.
 */
const TAP_SEL = '[role="radio"], [role="tab"], [role="switch"], [aria-pressed], [data-tapfx]';
const TAP_SKIP = '[data-notap], .sn-bnav, .sn-tabs, .sn-ck, .sg-itabs';
let tapInstalled = false;
export function installTapFx() {
  if (tapInstalled || typeof document === 'undefined') return;
  tapInstalled = true;
  const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  document.addEventListener('click', (e) => {
    if (prefersReducedMotion()) return;
    const el = (e.target as Element | null)?.closest?.<HTMLElement>(TAP_SEL);
    if (!el || el.closest(TAP_SKIP) || !el.closest('.sermon-app, .sn-scope')) return;
    if ((el as HTMLButtonElement).disabled) return;
    // 줄 전체 버튼(설정 행·문장 고르기 등)은 커졌다 줄면 어색해서 뺀다
    if (el.offsetWidth > 260 && !el.dataset.tapfx) return;
    // a/b 를 번갈아 달아 연달아 눌러도 다시 움직인다
    el.dataset.tap = el.dataset.tap === 'a' ? 'b' : 'a';
    clearTimeout(timers.get(el));
    timers.set(
      el,
      setTimeout(() => delete el.dataset.tap, 700),
    );
  });
}
