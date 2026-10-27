import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Briefcase,
  Heart,
  Home,
  MoreHorizontal,
  Plus,
  Repeat,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import type { SermonNote } from './sermonTypes';
import { prefersReducedMotion, useFlip, useFx, useJellyTab } from './microFx';
import {
  addCategory,
  addItem,
  CAT_COLORS,
  CAT_ICONS,
  CAT_MAX,
  CAT_NAME_MAX,
  dayEntries,
  dayStat,
  GALPI_CAT,
  GALPI_CATEGORY,
  itemDays,
  moveCategory,
  putItem,
  removeCategory,
  removeCategoryItems,
  removeItem,
  setItemDays,
  TEXT_MAX,
  TODO_CAT,
  toggleDaily,
  toggleOnce,
  updateCategory,
  updateItem,
  weekRaw,
  type CatColor,
  type CatIcon,
  type DayEntry,
  type PlanCategory,
  type PlanItem,
  type PlanRep,
  type WeekPlanApi,
} from './weekPlan';
import './weekPanel.css';

/**
 * 홈 오른쪽 「한 주 동안」 — 이번 주 날짜 띠 + 고른 날의 할 일을 카테고리별로 (weekPlan.ts).
 *  - 날짜 띠: 일~토. 고리 = 그날 한 비율(다 하면 꽉 찬 분홍이 톡), 아래 점 = 그날 들은 예배. 고른 날 표시는 말랑하게 따라간다
 *  - 예배 갈피(고정, 첫 칸): 이번 주 설교 노트의 「적용」이 그 설교 날짜에 들어온다. 꼬리표를 누르면 그 노트로
 *  - 내 카테고리: 이름 옆 「+」로 고른 날에 적기(「매일」 켜면 그날부터 매일). 이름을 누르면 이름·색·아이콘·순서·지우기
 *  - 못 한 지난 일은 오늘로 넘어오고(「M.D부터」), 원래 날엔 흐린 「오늘로 넘김」으로 남는다
 *  - 할 일 고치기: 줄(또는 ⋯)을 누르면 그 자리에서 펼쳐진다. 제목 자리가 입력칸, 아래에 요일(+매일)·카테고리, 맨 아래 지우기 | 완료.
 *    판 전체에서 한 줄만 열린다. 휴대폰은 줄을 밀어서: → 다음 날로, ← 지우기. 지우기·다른 날로 보내기는 5초 동안 되돌릴 수 있다
 * 마이크로 인터랙션은 누른 순간에만: 체크(상자 톡 + 체크 그리기 + 줄 긋기 + 한 것이 아래로 미끄러짐), 하루를 다 하면 고리 톡,
 * 새 할 일은 떨어지듯 붙고, 날을 바꾸면 목록이 그 방향에서 들어온다. 펼침은 칸이 차례로 내려앉고, 요일은 톡·매일은 띠가 이어지며,
 * 다른 날로 보내면 줄이 그쪽으로 날아가고 그 날짜가 톡, 지우면 왼쪽으로 빠진다. 움직임 줄이기 설정이면 모두 멈춘다.
 */
const DOW = '일월화수목금토';

const CAT_HEX: Record<CatColor, string> = {
  g2: 'var(--sn-g2)',
  g1: 'var(--sn-g1)',
  g3: 'var(--sn-g3)',
  purple: 'var(--sn-c-purple)',
  orange: 'var(--sn-c-orange)',
  green: 'var(--sn-c-green)',
  red: 'var(--sn-c-red)',
};
const COLOR_NAME: Record<CatColor, string> = {
  g2: '분홍',
  g1: '파랑',
  g3: '민트',
  purple: '보라',
  orange: '주황',
  green: '초록',
  red: '빨강',
};
const ICONS: Record<CatIcon, (p: { className?: string }) => ReactNode> = {
  ribbon: ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 2h12v20l-6-4.5L6 22z" />
    </svg>
  ),
  tag: ({ className }) => <Tag className={className} aria-hidden />,
  home: ({ className }) => <Home className={className} aria-hidden />,
  users: ({ className }) => <Users className={className} aria-hidden />,
  book: ({ className }) => <BookOpen className={className} aria-hidden />,
  briefcase: ({ className }) => <Briefcase className={className} aria-hidden />,
  heart: ({ className }) => <Heart className={className} aria-hidden />,
};
const ICON_NAME: Record<CatIcon, string> = {
  ribbon: '갈피',
  tag: '꼬리표',
  home: '집',
  users: '사람들',
  book: '책',
  briefcase: '가방',
  heart: '하트',
};

function md(ds: string): string {
  const [, m, d] = ds.split('-').map(Number);
  return `${m}.${d}`;
}

const UNDO_MS = 5000;
const LEAVE_MS = 240;

function buzz() {
  try {
    if (!prefersReducedMotion()) navigator.vibrate?.(8);
  } catch {
    // 진동이 없는 기기
  }
}

interface WeekPanelProps {
  days: string[];
  today: string;
  api: WeekPlanApi;
  /** 이번 주 노트 — 예배 갈피 할 일과 날짜 띠의 예배 점 */
  notes: SermonNote[];
  /** 이번 주 갈피 노트 — 예배 갈피에서 바로 적은 할 일이 붙는다 */
  galpiNote: SermonNote | null;
  isGroupNote: (n: SermonNote) => boolean;
  /** 아래 예배 카드에서 「적용 N」을 누른 노트 */
  highlight: string | null;
  onOpen: (id: string, aid?: string | null) => void;
  onToggleApply: (noteId: string, thoughtId: string) => void;
}

export function WeekPanel({
  days,
  today,
  api,
  notes,
  galpiNote,
  isGroupNote,
  highlight,
  onOpen,
  onToggleApply,
}: WeekPanelProps) {
  const { plan, cats, setPlan, setCats } = api;
  const [sel, setSel] = useState(() => (days.includes(today) ? today : days[0]));
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const [adding, setAdding] = useState<string | null>(null);
  const [editCat, setEditCat] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Record<string, 'l' | 'r'>>({});
  const [undo, setUndo] = useState<{ msg: string; run: () => void; n: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>();
  const [openDone, setOpenDone] = useState<Record<string, boolean>>({});
  const [fx, fire] = useFx(700);
  const panelRef = useRef<HTMLElement>(null);

  const raw = useMemo(() => weekRaw(notes, plan, days, today), [notes, plan, days, today]);
  const byDay = useMemo(
    () => new Map(days.map((d) => [d, dayEntries(raw, d, days, today)])),
    [raw, days, today],
  );
  const entries = byDay.get(sel) || [];
  const stat = dayStat(entries);

  // 하루를 다 채운 순간에만 그 날 고리가 톡
  const fullRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const full = new Set(
      days.filter((d) => {
        const s = dayStat(byDay.get(d) || []);
        return s.total > 0 && s.done === s.total;
      }),
    );
    const prev = fullRef.current;
    fullRef.current = full;
    if (!prev) return;
    const fresh = [...full].find((d) => !prev.has(d));
    if (fresh) fire(`full:${fresh}`);
  }, [byDay, days, fire]);

  const userCats = cats.cats;
  const allCats: PlanCategory[] = useMemo(() => {
    const list = [GALPI_CATEGORY, ...userCats];
    // 다른 기기에서 지운 카테고리의 할 일은 첫 내 카테고리(없으면 임시 「할 일」)로 모은다
    const known = new Set(list.map((c) => c.id));
    if (!userCats.length && raw.some((r) => !known.has(r.cat)))
      list.push({ id: TODO_CAT, name: '할 일', color: 'g1', icon: 'tag' });
    return list;
  }, [userCats, raw]);
  const catOf = (e: DayEntry) =>
    allCats.some((c) => c.id === e.cat) ? e.cat : (allCats[1]?.id ?? TODO_CAT);

  const pick = (d: string) => {
    if (d === sel) return;
    setDir(d > sel ? 1 : -1);
    setSel(d);
    setAdding(null);
    setEditCat(null);
    setOpenKey(null);
  };

  // 펼친 줄 바깥을 누르면 닫는다 (제목은 닫히면서 저장된다)
  useEffect(() => {
    if (!openKey) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Element | null;
      if (t?.closest?.('[data-open-item]')) return;
      setOpenKey(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [openKey]);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const showUndo = (msg: string, run: () => void) => {
    clearTimeout(undoTimer.current);
    setUndo({ msg, run, n: Date.now() });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };
  /** 줄이 빠져나가는 움직임을 보여 준 뒤 바꾼다 (밀기로 이미 빠졌으면 바로) */
  const leave = (key: string, side: 'l' | 'r', run: () => void, now = false) => {
    if (now || prefersReducedMotion()) return run();
    setLeaving((m) => ({ ...m, [key]: side }));
    setTimeout(() => {
      run();
      setLeaving((m) => {
        const n = { ...m };
        delete n[key];
        return n;
      });
    }, LEAVE_MS);
  };
  const itemOf = (id?: string) => (id ? plan.items.find((x) => x.id === id) : undefined);
  const dayWord = (d: string) => {
    const i = days.indexOf(d);
    if (d === today) return '오늘';
    if (i > 0 && days[i - 1] === today) return '내일';
    return `${DOW[new Date(`${d}T00:00:00`).getDay()]}요일`;
  };

  const act: ItemActions = {
    toggleOpen: (e) => {
      setOpenKey((k) => (k === e.key ? null : e.key));
      setAdding(null);
      setEditCat(null);
    },
    close: () => setOpenKey(null),
    rename: (e, text) => {
      if (e.planId) setPlan((p) => updateItem(p, e.planId!, { text }));
    },
    setCat: (e, cat) => {
      if (e.planId) setPlan((p) => updateItem(p, e.planId!, { cat }));
    },
    remove: (e, now) => {
      const it = itemOf(e.planId);
      if (!it) return;
      const idx = plan.items.indexOf(it);
      setOpenKey(null);
      leave(e.key, 'l', () => setPlan((p) => removeItem(p, it.id)), now);
      showUndo('지웠어요', () => setPlan((p) => putItem(p, it, idx)));
    },
    setDays: (e, picked, now) => {
      const it = itemOf(e.planId);
      if (!it) return;
      const next = days.filter((d) => picked.includes(d));
      if (!next.length) return;
      const apply = () => setPlan((p) => setItemDays(p, it.id, next, days, today));
      // 이 날 보기에 계속 남는지 — 하루짜리 지난 할 일은 오늘로 넘어와 보인다
      const stays =
        next.includes(sel) || (next.length === 1 && next[0] < today && sel === today && !e.done);
      if (stays) return apply();
      setOpenKey(null);
      leave(e.key, 'r', apply, now);
      const land = next.find((d) => d >= today) ?? next[0];
      fire(`land:${land}`);
      const label =
        next.length === 1
          ? dayWord(next[0])
          : next.map((d) => DOW[new Date(`${d}T00:00:00`).getDay()]).join('·');
      showUndo(`${label}로 옮겼어요`, () => setPlan((p) => putItem(p, it)));
    },
    goToday: (e) => {
      pick(today);
      setTimeout(() => setOpenKey(e.key), 0);
    },
    openNote: (e) => {
      if (e.note) onOpen(e.note.id, e.thought?.aid);
    },
  };

  const check = (e: DayEntry) => {
    if (e.moved || sel > today) return;
    if (!e.done) {
      fire(`chk:${e.key}`);
      buzz();
    }
    if (e.note && e.thought) onToggleApply(e.note.id, e.thought.id);
    else if (e.planId && e.rep !== 'once') setPlan((p) => toggleDaily(p, e.planId!, sel, today));
    else if (e.planId) setPlan((p) => toggleOnce(p, e.planId!, sel));
  };

  const { listRef, indRef } = useJellyTab(days.indexOf(sel), { axis: 'x', item: '.sn-wc-dp' });
  const selDate = new Date(`${sel}T00:00:00`);
  const dayNotes = notes.filter((n) => n.date === sel);

  return (
    <aside className="sn-plan sn-wp sn-wc" aria-label="한 주 동안" data-notap ref={panelRef}>
      <span className="sn-stk sn-c2 sn-plan-tag" style={{ ['--r' as string]: '5deg' }}>
        ♥ 이번 주 적용
      </span>
      <div className="sn-wp-h">
        <h4>한 주 동안</h4>
        <small className="sn-wc-when">{sel === today ? '오늘' : md(sel)}</small>
        {stat.total > 0 && (
          <span className="sn-plan-fr sn-wc-fr" data-fx={fx === `full:${sel}` ? 'all' : undefined}>
            <b key={`${sel}:${stat.done}`} data-fx={fx?.startsWith('chk:') ? 'roll' : undefined}>
              {stat.done}
            </b>
            /{stat.total}
          </span>
        )}
      </div>

      <div className="sn-wc-strip" role="group" aria-label="이번 주 날짜" ref={listRef}>
        <span className="sn-wc-ind" ref={indRef} aria-hidden />
        {days.map((d) => {
          const s = dayStat(byDay.get(d) || []);
          const dt = new Date(`${d}T00:00:00`);
          const full = s.total > 0 && s.done === s.total;
          const svc = notes.filter((n) => n.date === d);
          return (
            <button
              key={d}
              type="button"
              className="sn-wc-dp"
              aria-pressed={d === sel}
              aria-label={`${dt.getMonth() + 1}월 ${dt.getDate()}일 ${DOW[dt.getDay()]}요일${s.total ? `, ${s.total}개 중 ${s.done}개` : ''}`}
              data-today={d === today || undefined}
              data-fut={d > today || undefined}
              data-sun={dt.getDay() === 0 || undefined}
              data-full={full || undefined}
              data-fx={fx === `full:${d}` || fx === `land:${d}` ? 'pop' : undefined}
              onClick={() => pick(d)}
            >
              <span className="sn-wc-w">{d === today ? '오늘' : DOW[dt.getDay()]}</span>
              <span
                className="sn-wc-ring"
                style={{ ['--sn-wc-p' as string]: s.total ? s.done / s.total : 0 }}
              >
                <b>{dt.getDate()}</b>
              </span>
              <span className="sn-wc-sv">
                {svc.slice(0, 3).map((n) => (
                  <i key={n.id} data-grp={isGroupNote(n) || undefined} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sn-wc-dayline">
        <b>
          {selDate.getMonth() + 1}.{selDate.getDate()}{' '}
          {selDate.getDay() === 0 ? '주일' : `${DOW[selDate.getDay()]}요일`}
        </b>
        {dayNotes.length > 0 && (
          <span>들은 예배 · {dayNotes.map((n) => n.service || n.title || '예배').join(', ')}</span>
        )}
        {sel !== today && days.includes(today) && (
          <button type="button" onClick={() => pick(today)}>
            오늘로
          </button>
        )}
      </div>

      <div className="sn-wc-cats" key={sel} data-dir={dir || undefined}>
        {allCats.map((c) => {
          const ui = userCats.findIndex((u) => u.id === c.id);
          return (
            <CategoryBlock
              key={c.id}
              cat={c}
              entries={entries.filter((e) => catOf(e) === c.id)}
              sel={sel}
              today={today}
              fx={fx}
              days={days}
              userCats={userCats}
              openKey={openKey}
              leaving={leaving}
              act={act}
              plan={plan.items}
              highlight={highlight}
              adding={adding === c.id}
              editOpen={editCat === c.id}
              openDone={!!openDone[`${sel}:${c.id}`]}
              isGroupNote={isGroupNote}
              canMoveUp={ui > 0}
              canMoveDown={ui >= 0 && ui < userCats.length - 1}
              weekCount={raw.filter((r) => r.cat === c.id && r.planId).length}
              onCheck={check}
              onOpenNote={onOpen}
              onToggleAdd={() => {
                setAdding((v) => (v === c.id ? null : c.id));
                setEditCat(null);
                setOpenKey(null);
              }}
              onCloseAdd={() => setAdding((v) => (v === c.id ? null : v))}
              onAdd={(text, rep) =>
                setPlan((p) =>
                  addItem(p, {
                    text,
                    rep,
                    cat: c.id,
                    day: sel,
                    noteId: c.id === GALPI_CAT ? (galpiNote?.id ?? null) : null,
                  }),
                )
              }
              onShowDone={() => setOpenDone((o) => ({ ...o, [`${sel}:${c.id}`]: true }))}
              onEdit={() => {
                setEditCat((v) => (v === c.id ? null : c.id));
                setAdding(null);
              }}
              onSaveCat={(patch) => {
                setCats((l) => updateCategory(l, c.id, patch));
                setEditCat(null);
              }}
              onMoveCat={(d) => setCats((l) => moveCategory(l, c.id, d))}
              onDeleteCat={() => {
                setCats((l) => removeCategory(l, c.id));
                setPlan((p) => removeCategoryItems(p, c.id));
                setEditCat(null);
              }}
            />
          );
        })}
        {userCats.length < CAT_MAX &&
          (editCat === 'new' ? (
            <CategoryForm
              used={userCats.map((u) => u.color)}
              onSave={(v) => {
                setCats((l) => addCategory(l, v));
                setEditCat(null);
                fire('newcat');
              }}
              onCancel={() => setEditCat(null)}
            />
          ) : (
            <button
              type="button"
              className="sn-wc-newcat"
              onClick={() => {
                setEditCat('new');
                setAdding(null);
              }}
            >
              <Plus className="sn-icon" aria-hidden />
              카테고리
            </button>
          ))}
      </div>

      {undo && (
        <div className="sn-wc-toast" role="status" key={undo.n}>
          <span>{undo.msg}</span>
          <button
            type="button"
            onClick={() => {
              undo.run();
              clearTimeout(undoTimer.current);
              setUndo(null);
            }}
          >
            되돌리기
          </button>
          <i aria-hidden />
        </div>
      )}
    </aside>
  );
}

interface ItemActions {
  toggleOpen: (e: DayEntry) => void;
  close: () => void;
  rename: (e: DayEntry, text: string) => void;
  setCat: (e: DayEntry, cat: string) => void;
  /** now = 밀기로 이미 빠져나간 줄 */
  remove: (e: DayEntry, now?: boolean) => void;
  setDays: (e: DayEntry, picked: string[], now?: boolean) => void;
  goToday: (e: DayEntry) => void;
  openNote: (e: DayEntry) => void;
}

interface CategoryBlockProps {
  cat: PlanCategory;
  entries: DayEntry[];
  sel: string;
  today: string;
  fx: string | null;
  days: string[];
  userCats: PlanCategory[];
  openKey: string | null;
  leaving: Record<string, 'l' | 'r'>;
  act: ItemActions;
  plan: PlanItem[];
  highlight: string | null;
  adding: boolean;
  editOpen: boolean;
  openDone: boolean;
  isGroupNote: (n: SermonNote) => boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  weekCount: number;
  onCheck: (e: DayEntry) => void;
  onOpenNote: (id: string, aid?: string | null) => void;
  onToggleAdd: () => void;
  onCloseAdd: () => void;
  onAdd: (text: string, rep: PlanRep) => void;
  onShowDone: () => void;
  onEdit: () => void;
  onSaveCat: (patch: { name: string; color: CatColor; icon: CatIcon }) => void;
  onMoveCat: (d: -1 | 1) => void;
  onDeleteCat: () => void;
}

/** 카테고리 하나 — 이름 칩, 안 한 것 → 한 것(2개 넘으면 접음), 적기 줄. 순서가 바뀌면 미끄러진다 */
function CategoryBlock({
  cat,
  entries,
  sel,
  today,
  fx,
  days,
  userCats,
  openKey,
  leaving,
  act,
  plan,
  highlight,
  adding,
  editOpen,
  openDone,
  isGroupNote,
  canMoveUp,
  canMoveDown,
  weekCount,
  onCheck,
  onOpenNote,
  onToggleAdd,
  onCloseAdd,
  onAdd,
  onShowDone,
  onEdit,
  onSaveCat,
  onMoveCat,
  onDeleteCat,
}: CategoryBlockProps) {
  const fixed = cat.id === GALPI_CAT;
  const open = entries.filter((e) => !e.done);
  const done = entries.filter((e) => e.done);
  const fold = done.length > 2 && !openDone;
  const shown = [...open, ...(fold ? done.filter((e) => e.key === openKey) : done)];
  const listRef = useRef<HTMLDivElement>(null);
  useFlip(listRef, shown.map((e) => `${e.key}:${e.done ? 1 : 0}`).join(','));

  // 이 날 보기에서 새로 생긴 할 일만 떨어지듯 붙는다 (날을 바꾼 첫 그림·동기화로 들어온 것은 그대로)
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (seen.current) for (const e of entries) if (!seen.current.has(e.key)) fresh.add(e.key);
  useLayoutEffect(() => {
    seen.current = new Set(entries.map((e) => e.key));
  });

  const Icon = ICONS[cat.icon];
  return (
    <section
      className="sn-wc-cat"
      style={{ ['--cc' as string]: CAT_HEX[cat.color] }}
      aria-label={cat.name}
      data-fx={fx === 'newcat' && !fixed ? 'in' : undefined}
    >
      <span className="sn-wc-pill">
        <Icon className="sn-wc-ic" />
        {fixed ? (
          <span className="sn-wc-nm" title="이번 주 설교 노트의 ‘적용’이 모여요">
            {cat.name}
          </span>
        ) : (
          <button
            type="button"
            className="sn-wc-nm"
            aria-expanded={editOpen}
            title="이름·색 바꾸기"
            onClick={onEdit}
          >
            {cat.name}
          </button>
        )}
        {entries.length > 0 && (
          <span className="sn-wc-cnt">
            {done.length}/{entries.length}
          </span>
        )}
        <button
          type="button"
          className="sn-wc-add"
          aria-expanded={adding}
          aria-label={adding ? `${cat.name} 적기 닫기` : `${cat.name}에 할 일 적기`}
          onClick={onToggleAdd}
        >
          <Plus className="sn-icon" aria-hidden />
        </button>
      </span>

      {editOpen && !fixed && (
        <CategoryForm
          initial={cat}
          used={[]}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          weekCount={weekCount}
          onSave={onSaveCat}
          onMove={onMoveCat}
          onDelete={onDeleteCat}
          onCancel={onEdit}
        />
      )}

      <div className="sn-wc-list" ref={listRef}>
        {shown.map((e) => (
          <ItemRow
            key={e.key}
            e={e}
            item={e.planId ? plan.find((x) => x.id === e.planId) : undefined}
            sel={sel}
            today={today}
            days={days}
            userCats={userCats}
            open={openKey === e.key}
            leaving={leaving[e.key]}
            fxAttr={fresh.has(e.key) ? 'new' : fx === `chk:${e.key}` ? 'chk' : undefined}
            hl={!!highlight && e.note?.id === highlight}
            isGroup={!!e.note && isGroupNote(e.note)}
            act={act}
            onCheck={onCheck}
            onOpenNote={onOpenNote}
          />
        ))}
      </div>
      {fold && (
        <button type="button" className="sn-wc-fold" onClick={onShowDone}>
          한 것 {done.length}개 보기
        </button>
      )}
      {adding && (
        <AddRow
          placeholder={`${sel === today ? '오늘' : md(sel)} 할 일 · Enter`}
          allowDaily={!fixed}
          label={`${cat.name} 할 일`}
          onAdd={onAdd}
          onClose={onCloseAdd}
        />
      )}
    </section>
  );
}

const dowOf = (d: string) => DOW[new Date(`${d}T00:00:00`).getDay()];

interface ItemRowProps {
  e: DayEntry;
  item?: PlanItem;
  sel: string;
  today: string;
  days: string[];
  userCats: PlanCategory[];
  open: boolean;
  leaving?: 'l' | 'r';
  fxAttr?: string;
  hl: boolean;
  isGroup: boolean;
  act: ItemActions;
  onCheck: (e: DayEntry) => void;
  onOpenNote: (id: string, aid?: string | null) => void;
}

/**
 * 할 일 한 줄 + 펼친 칸. 휴대폰(터치)에선 줄을 가로로 밀 수 있다 — 세로로 먼저 움직이면 스크롤에 양보.
 * 밀기는 렌더 없이 transform 만 바꾸고, 끝까지 밀었을 때(문턱 넘김) 한 번 진동한다.
 */
function ItemRow({
  e,
  item,
  sel,
  today,
  days,
  userCats,
  open,
  leaving,
  fxAttr,
  hl,
  isGroup,
  act,
  onCheck,
  onOpenNote,
}: ItemRowProps) {
  const fut = sel > today;
  const editable = !!item && !e.moved;
  const next = days[days.indexOf(sel) + 1];
  // → 는 하루짜리 안 한 할 일만 (매일·며칠·한 것·노트 적용·흐린 줄은 막힘), ← 는 내가 적은 할 일
  const canRight = editable && item!.rep === 'once' && !e.done && !!next;
  const canLeft = editable;
  const swipeable = canLeft || canRight;

  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; axis: 0 | 'x' | 'y'; armed: boolean } | null>(null);
  const swipedAt = useRef(0);

  const reset = () => {
    const row = rowRef.current;
    const wrap = wrapRef.current;
    if (!row || !wrap) return;
    row.style.transition = prefersReducedMotion() ? '' : 'transform 0.34s var(--sn-spring)';
    row.style.transform = '';
    setTimeout(() => {
      row.style.transition = '';
      delete wrap.dataset.swipe;
      delete wrap.dataset.armed;
    }, 340);
  };

  const onDown = (ev: ReactPointerEvent) => {
    if (ev.pointerType === 'mouse' || open || !swipeable) return;
    drag.current = { x: ev.clientX, y: ev.clientY, axis: 0, armed: false };
  };
  const onMove = (ev: ReactPointerEvent) => {
    const d = drag.current;
    const row = rowRef.current;
    const wrap = wrapRef.current;
    if (!d || !row || !wrap) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'y') {
        drag.current = null;
        return;
      }
      row.setPointerCapture?.(ev.pointerId);
    }
    const ok = dx > 0 ? canRight : canLeft;
    // 막힌 쪽은 고무줄처럼 조금만 따라온다
    const tx = ok ? dx : Math.sign(dx) * Math.min(26, Math.abs(dx) * 0.22);
    row.style.transform = `translateX(${tx}px)`;
    wrap.dataset.swipe = dx > 0 ? 'r' : 'l';
    const armed = ok && Math.abs(dx) > Math.min(row.offsetWidth * 0.4, 140);
    if (armed !== d.armed) {
      d.armed = armed;
      if (armed) {
        wrap.dataset.armed = 'true';
        buzz();
      } else delete wrap.dataset.armed;
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x') return;
    swipedAt.current = Date.now();
    const row = rowRef.current;
    const side = wrapRef.current?.dataset.swipe;
    if (!d.armed || !row) return reset();
    row.style.transition = 'transform 0.2s cubic-bezier(0.5, 0, 0.75, 0)';
    row.style.transform = `translateX(${side === 'r' ? 110 : -110}%)`;
    setTimeout(
      () => {
        if (side === 'r' && next) act.setDays(e, [next], true);
        else act.remove(e, true);
        reset();
      },
      prefersReducedMotion() ? 0 : 200,
    );
  };
  const toggle = () => {
    if (Date.now() - swipedAt.current < 400) return;
    act.toggleOpen(e);
  };

  const meta = (
    <>
      {e.rep === 'daily' && (
        <span className="sn-wc-mt">
          <Repeat className="sn-icon" aria-hidden />
          매일
        </span>
      )}
      {e.rep === 'days' && e.days && (
        <span className="sn-wc-mt">
          <Repeat className="sn-icon" aria-hidden />
          {e.days.map(dowOf).join('·')}
        </span>
      )}
      {e.carry && (
        <span className="sn-wc-mt" data-k="carry">
          {md(e.carry)}부터
        </span>
      )}
      {e.moved && (
        <span className="sn-wc-mt" data-k="carry">
          오늘로 넘김
        </span>
      )}
      {e.note && (
        <button
          type="button"
          className="sn-wc-mt"
          data-k="src"
          data-grp={isGroup || undefined}
          title="노트 열기"
          onClick={(ev) => {
            ev.stopPropagation();
            onOpenNote(e.note!.id, e.thought?.aid);
          }}
        >
          {e.note.service || e.note.title || '설교'}
        </button>
      )}
    </>
  );

  return (
    <div
      ref={wrapRef}
      data-flip={e.key}
      className="sn-wc-it"
      data-open={open || undefined}
      data-open-item={open || undefined}
      data-out={leaving}
      data-done={e.done || undefined}
      data-moved={e.moved || undefined}
      data-hl={hl || undefined}
      data-fx={fxAttr}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape' && open) {
          ev.stopPropagation();
          act.close();
        }
      }}
    >
      {swipeable && (
        <div className="sn-wc-swbg" aria-hidden>
          <span data-side="r">
            <ArrowRight className="sn-icon" />
            {next
              ? next === today
                ? '오늘로'
                : sel === today
                  ? '내일로'
                  : `${dowOf(next)}요일로`
              : ''}
          </span>
          <span data-side="l">
            지우기
            <Trash2 className="sn-icon" />
          </span>
        </div>
      )}
      <div
        className="sn-wc-row"
        ref={rowRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <button
          type="button"
          className="sn-wc-box"
          aria-pressed={e.done}
          disabled={e.moved || fut}
          aria-label={`${e.text} ${e.done ? '되돌리기' : '했어요'}`}
          title={
            fut ? '그날부터 체크할 수 있어요' : e.moved ? '오늘 목록으로 넘어갔어요' : undefined
          }
          onClick={() => onCheck(e)}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12.5 10 17 19 7.5" />
          </svg>
        </button>
        {open && editable ? (
          <TitleInput text={e.text} onSave={(t) => act.rename(e, t)} onDone={act.close} />
        ) : (
          <span className="sn-wc-tx" onClick={toggle}>
            <span className="sn-wc-t">{e.text}</span>
            {meta}
          </span>
        )}
        <button
          type="button"
          className="sn-wc-more"
          aria-expanded={open}
          aria-label={open ? `${e.text} 닫기` : `${e.text} 고치기`}
          onClick={toggle}
        >
          <MoreHorizontal className="sn-icon" aria-hidden />
        </button>
      </div>
      {open && (
        <ItemTray
          e={e}
          item={item}
          sel={sel}
          today={today}
          days={days}
          userCats={userCats}
          act={act}
        />
      )}
    </div>
  );
}

/** 펼친 줄의 제목 자리 = 입력칸. Enter 저장·닫기, Esc 되돌리고 닫기, 다른 데로 가면(닫히면) 저장 */
function TitleInput({
  text,
  onSave,
  onDone,
}: {
  text: string;
  onSave: (t: string) => void;
  onDone: () => void;
}) {
  const [v, setV] = useState(text);
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef({ v, cancel: false, onSave, text });
  latest.current = { ...latest.current, v, onSave, text };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(
    () => () => {
      const l = latest.current;
      if (!l.cancel && l.v.trim() && l.v.trim() !== l.text) l.onSave(l.v);
    },
    [],
  );
  return (
    <input
      ref={ref}
      className="sn-wc-tin"
      type="text"
      value={v}
      maxLength={TEXT_MAX}
      aria-label="할 일 제목"
      onChange={(ev) => setV(ev.target.value)}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' && !ev.nativeEvent.isComposing) {
          ev.preventDefault();
          onDone();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          latest.current.cancel = true;
          onDone();
        }
      }}
    />
  );
}

/** 펼친 칸 — 요일(+매일) · 카테고리 · 지우기 | 완료. 할 일 종류에 맞지 않는 칸만 빠진다 */
function ItemTray({
  e,
  item,
  sel,
  today,
  days,
  userCats,
  act,
}: {
  e: DayEntry;
  item?: PlanItem;
  sel: string;
  today: string;
  days: string[];
  userCats: PlanCategory[];
  act: ItemActions;
}) {
  const done = (
    <button type="button" className="sn-wc-done" onClick={act.close}>
      완료
    </button>
  );
  let i = 0;
  const step = () => ({ ['--i' as string]: i++ });

  if (e.moved) {
    return (
      <div className="sn-wc-tray">
        <p className="sn-wc-tr-note" style={step()}>
          오늘 목록으로 넘어간 할 일이에요.
        </p>
        <div className="sn-wc-tr-f" style={step()}>
          <button type="button" className="sn-wc-tr-link" onClick={() => act.goToday(e)}>
            오늘에서 보기
            <ArrowRight className="sn-icon" aria-hidden />
          </button>
          {done}
        </div>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="sn-wc-tray">
        <p className="sn-wc-tr-note" style={step()}>
          설교 노트의 적용이에요. 글자와 날짜는 노트를 따라가요.
        </p>
        <div className="sn-wc-tr-f" style={step()}>
          <button type="button" className="sn-wc-tr-link" onClick={() => act.openNote(e)}>
            노트에서 고치기
            <ArrowRight className="sn-icon" aria-hidden />
          </button>
          {done}
        </div>
      </div>
    );
  }
  const galpi = item.cat === GALPI_CAT;
  const picked = itemDays(item, days, today);
  const showDays = !(item.rep === 'once' && e.done);
  const showCats = !galpi && userCats.length > 1;
  const offDay = sel >= today ? sel : days.includes(today) ? today : days[0];
  return (
    <div className="sn-wc-tray">
      {showDays && (
        <div style={step()}>
          <DayPicker
            days={days}
            today={today}
            picked={picked}
            daily={item.rep === 'daily'}
            single={galpi}
            offDay={offDay}
            onPick={(d) => act.setDays(e, d)}
          />
        </div>
      )}
      {showCats && (
        <div className="sn-wc-chips" role="radiogroup" aria-label="카테고리" style={step()}>
          {userCats.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={item.cat === c.id}
              className="sn-wc-chip"
              style={{ ['--c' as string]: CAT_HEX[c.color] }}
              onClick={() => act.setCat(e, c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="sn-wc-tr-f" style={step()}>
        <button type="button" className="sn-wc-tr-del" onClick={() => act.remove(e)}>
          <Trash2 className="sn-icon" aria-hidden />
          지우기
        </button>
        {done}
      </div>
    </div>
  );
}

/**
 * 요일 고르기 — 일~토 + 「매일」. 하루면 그날 한 번, 며칠이면 요일마다, 매일이면 고른 날부터 토요일까지 한 줄 띠로 이어진다.
 * 오늘은 아래 점, 지난 요일은 흐리게(그래도 고를 수 있다). 예배 갈피는 하루만 고른다.
 */
function DayPicker({
  days,
  today,
  picked,
  daily,
  single,
  offDay,
  onPick,
}: {
  days: string[];
  today: string;
  picked: string[];
  daily: boolean;
  single: boolean;
  offDay: string;
  onPick: (days: string[]) => void;
}) {
  const [fx, fire] = useFx(450);
  const on = new Set(picked);
  const bandFrom = daily ? days.indexOf(picked[0]) : -1;
  const anchor = days.includes(today) ? today : days[0];
  const tap = (d: string) => {
    fire(d);
    if (single) return onPick([d]);
    if (on.has(d)) {
      if (on.size === 1) return; // 하나는 남긴다
      onPick(picked.filter((x) => x !== d));
    } else onPick([...picked, d]);
  };
  return (
    <div className="sn-wc-dw">
      <div className="sn-wc-dw-row" role="group" aria-label="할 요일">
        {bandFrom >= 0 && (
          <span
            className="sn-wc-dw-band"
            aria-hidden
            style={{ gridColumn: `${bandFrom + 1} / ${days.length + 1}` }}
          />
        )}
        {days.map((d) => {
          const dt = new Date(`${d}T00:00:00`);
          return (
            <button
              key={d}
              type="button"
              className="sn-wc-dw-b"
              aria-pressed={on.has(d)}
              aria-label={`${dt.getMonth() + 1}월 ${dt.getDate()}일 ${DOW[dt.getDay()]}요일${d === today ? ' (오늘)' : ''}`}
              data-past={d < today || undefined}
              data-today={d === today || undefined}
              data-band={(daily && on.has(d)) || undefined}
              data-fx={fx === d ? 'pop' : undefined}
              onClick={() => tap(d)}
            >
              {DOW[dt.getDay()]}
            </button>
          );
        })}
      </div>
      {!single && (
        <button
          type="button"
          className="sn-wc-dw-all"
          aria-pressed={daily}
          onClick={() => {
            fire('all');
            onPick(daily ? [offDay] : days.filter((d) => d >= anchor));
          }}
          data-fx={fx === 'all' ? 'pop' : undefined}
        >
          <Repeat className="sn-icon" aria-hidden />
          매일
        </button>
      )}
    </div>
  );
}

function AddRow({
  placeholder,
  allowDaily,
  label,
  onAdd,
  onClose,
}: {
  placeholder: string;
  allowDaily: boolean;
  label: string;
  onAdd: (text: string, rep: PlanRep) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [daily, setDaily] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = () => {
    if (!text.trim()) return;
    onAdd(text, daily ? 'daily' : 'once');
    setText('');
    setDaily(false);
    ref.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!text.trim()) onClose();
      else submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };
  return (
    <div
      className="sn-wc-addrow"
      ref={wrap}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null) && !text.trim()) onClose();
      }}
    >
      <span className="sn-wc-box" aria-hidden />
      <input
        ref={ref}
        type="text"
        value={text}
        maxLength={TEXT_MAX}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />
      {allowDaily && (
        <button
          type="button"
          className="sn-wc-rep"
          aria-pressed={daily}
          title="이날부터 이번 주 남은 날마다"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDaily((v) => !v)}
        >
          <Repeat className="sn-icon" aria-hidden />
          매일
        </button>
      )}
      <button
        type="button"
        className="sn-wc-go"
        disabled={!text.trim()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={submit}
      >
        추가
      </button>
    </div>
  );
}

function CategoryForm({
  initial,
  used,
  canMoveUp,
  canMoveDown,
  weekCount = 0,
  onSave,
  onMove,
  onDelete,
  onCancel,
}: {
  initial?: PlanCategory;
  used: CatColor[];
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  weekCount?: number;
  onSave: (v: { name: string; color: CatColor; icon: CatIcon }) => void;
  onMove?: (d: -1 | 1) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState<CatColor>(
    initial?.color ?? CAT_COLORS.find((c) => !used.includes(c)) ?? 'g1',
  );
  const [icon, setIcon] = useState<CatIcon>(initial?.icon ?? 'tag');
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const save = () => {
    if (name.trim()) onSave({ name, color, icon });
  };

  return (
    <div className="sn-wc-form" style={{ ['--cc' as string]: CAT_HEX[color] }}>
      <input
        ref={ref}
        type="text"
        value={name}
        maxLength={CAT_NAME_MAX}
        placeholder="카테고리 이름 (예: 가정, 셀 모임)"
        aria-label="카테고리 이름"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="sn-wc-sw" role="radiogroup" aria-label="색">
        {CAT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={COLOR_NAME[c]}
            style={{ ['--c' as string]: CAT_HEX[c] }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      <div className="sn-wc-icons" role="radiogroup" aria-label="아이콘">
        {CAT_ICONS.map((ic) => {
          const I = ICONS[ic];
          return (
            <button
              key={ic}
              type="button"
              role="radio"
              aria-checked={icon === ic}
              aria-label={ICON_NAME[ic]}
              onClick={() => setIcon(ic)}
            >
              <I className="sn-icon" />
            </button>
          );
        })}
      </div>
      <div className="sn-wc-form-f">
        {initial && onMove && (
          <span className="sn-wc-order">
            <button
              type="button"
              aria-label="위로"
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="sn-icon" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="아래로"
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="sn-icon" aria-hidden />
            </button>
          </span>
        )}
        {initial &&
          onDelete &&
          (confirm ? (
            <button type="button" className="sn-wc-del" data-confirm onClick={onDelete}>
              {weekCount ? `이번 주 할 일 ${weekCount}개도 지워요 · 지우기` : '지우기'}
            </button>
          ) : (
            <button
              type="button"
              className="sn-wc-del"
              aria-label="카테고리 지우기"
              onClick={() => setConfirm(true)}
            >
              <Trash2 className="sn-icon" aria-hidden />
            </button>
          ))}
        <span className="sn-wc-sp" />
        <button type="button" className="sn-wc-cancel" onClick={onCancel}>
          닫기
        </button>
        <button type="button" className="sn-wc-go" disabled={!name.trim()} onClick={save}>
          {initial ? '저장' : '만들기'}
        </button>
      </div>
    </div>
  );
}
