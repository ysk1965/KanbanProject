import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import {
  takeWidgetPending,
  widgetSupported,
  writeWidgetSnapshot,
} from '../../../../utils/widgetBridge';
import type { SermonStore } from '../sermonStore';
import { todayString, weekOf, galpiByWeek, type SermonNote } from '../sermonTypes';
import type { WeekPlanStore } from '../weekPlan';
import { highlightStoreFor } from '../bibleHighlights';
import { useMinePlans } from '../reading/readingStore';
import { useBible } from '../useBible';
import { resolveGalpiRule, useGalpiPrefs } from '../galpiPrefs';
import type { Wallet } from '../challenge/challengeApi';
import { buildSnapshot, type WidgetInk } from './widgetSnapshot';
import { applyPending } from './widgetPending';

/**
 * 설교 노트가 떠 있는 동안 iOS 위젯 요약을 맞춰 둔다.
 *  - 노트·할 일·형광펜·읽기 길·잉크가 바뀌면 잠시 뒤 요약을 다시 써서 위젯을 새로 그리게 한다
 *  - 열릴 때와 앱으로 돌아올 때 위젯에서 누른 체크를 먼저 저장소에 옮긴다
 * iOS 앱이 아니면 아무것도 하지 않는다 (훅 순서만 지킨다).
 */

const WRITE_DELAY = 1200;
const INK_KEYS = [
  'g1',
  'g2',
  'g3',
  't1',
  't2',
  'g1d',
  'g2d',
  'g3d',
  'paper',
  'desk',
  'card',
  'card2',
] as const;
/** sermon.css 기본(코튼캔디) — CSS 변수를 못 읽을 때 */
const INK_FALLBACK: WidgetInk = {
  g1: '#c3b5f5',
  g2: '#ffb3d1',
  g3: '#a9dfc6',
  t1: '#5a45b8',
  t2: '#b8336f',
  g1d: '#cbbff7',
  g2d: '#ffbfd8',
  g3d: '#b5e6cf',
  paper: '#fcf8fb',
  desk: '#f3ecf3',
  card: '#fffdfe',
  card2: '#f6eff6',
};

function readInk(el: HTMLElement | null): WidgetInk {
  if (!el) return INK_FALLBACK;
  const cs = getComputedStyle(el);
  const out = { ...INK_FALLBACK };
  INK_KEYS.forEach((k) => {
    const v = cs.getPropertyValue(`--ink-${k}`).trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) out[k] = v;
  });
  return out;
}

function readWallet(userId: string): Wallet | null {
  try {
    const raw = JSON.parse(localStorage.getItem(`sermon-challenge-v1:${userId}`) || 'null') as {
      wallet?: Wallet | null;
    } | null;
    return raw?.wallet ?? null;
  } catch {
    return null;
  }
}

const noopSub = () => () => {};
const zero = () => 0;

export function useWidgetSync({
  store,
  plans,
  userId,
  anonymous,
  notes,
  ink,
  rootRef,
}: {
  store: SermonStore;
  plans: WeekPlanStore;
  userId: string;
  anonymous: boolean;
  notes: SermonNote[];
  /** 잉크 이름 — 바뀌면 다시 읽는다 */
  ink: string;
  rootRef: RefObject<HTMLElement>;
}) {
  const on = useMemo(() => widgetSupported(), []);
  const hl = useMemo(() => highlightStoreFor(userId), [userId]);
  const hlVer = useSyncExternalStore(on ? hl.subscribe : noopSub, on ? hl.snapshot : zero);
  const planVer = useSyncExternalStore(on ? plans.subscribe : noopSub, on ? plans.snapshot : zero);
  const minePlans = useMinePlans(on && !anonymous);
  const { bible } = useBible();
  const galpiPrefs = useGalpiPrefs();

  useEffect(() => {
    if (on) hl.start();
  }, [on, hl]);

  // 위젯 체크 → 저장소
  const drain = useCallback(async () => {
    const ops = await takeWidgetPending();
    if (!ops.length) return;
    applyPending(ops, {
      getNote: (id) => store.get(id),
      saveNote: (n) => store.save(n),
      updatePlan: (week, fn) => plans.update(week, fn),
      today: todayString(),
    });
  }, [store, plans]);

  // 요약 → 위젯 (같은 내용이면 다시 쓰지 않는다)
  const lastJson = useRef('');
  const write = useCallback(() => {
    const now = new Date();
    const weekStart = weekOf(todayString());
    const wallet = anonymous ? null : readWallet(userId);
    const weekGalpi =
      galpiByWeek(store.all(), resolveGalpiRule(galpiPrefs, store.all())).get(weekStart) ?? null;
    const snap = buildSnapshot({
      notes: store.all(),
      plan: plans.get(weekStart),
      cats: plans.cats(),
      anonymous,
      ink: readInk(rootRef.current),
      weekComplete: wallet?.week_complete ?? null,
      streakWeeks: wallet?.streak_weeks ?? null,
      weekGalpi,
      highlights: hl.all(),
      plans: minePlans,
      verseText: bible ? (b, c, v) => bible[b]?.[c - 1]?.[v - 1] ?? '' : null,
      now,
    });
    const body = JSON.stringify({ ...snap, generated_at: 0 });
    if (body === lastJson.current) return;
    lastJson.current = body;
    void writeWidgetSnapshot(JSON.stringify(snap));
  }, [store, plans, anonymous, userId, galpiPrefs, hl, minePlans, bible, rootRef]);

  // 처음 열 때: 위젯 체크부터 옮기고 요약
  const loading = store.status.loading;
  useEffect(() => {
    if (!on || loading) return;
    void drain().then(write);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, loading]);

  // 바뀔 때마다 잠시 뒤 요약
  useEffect(() => {
    if (!on || loading) return;
    const id = window.setTimeout(write, WRITE_DELAY);
    return () => window.clearTimeout(id);
  }, [on, loading, write, notes, planVer, hlVer, ink]);

  // 앱으로 돌아오면: 위젯 체크 옮기고, 날이 바뀌었을 수 있으니 다시 요약
  useEffect(() => {
    if (!on) return;
    let remove: (() => void) | null = null;
    let alive = true;
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('appStateChange', (s) => {
        if (s.isActive) void drain().then(write);
      }).then((h) => {
        if (alive) remove = () => void h.remove();
        else void h.remove();
      }),
    );
    return () => {
      alive = false;
      remove?.();
    };
  }, [on, drain, write]);
}
