import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Briefcase,
  Check,
  Heart,
  Home,
  Pencil,
  Plus,
  Repeat,
  Tag,
  Trash2,
  Users,
  X,
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
  moveCategory,
  removeCategory,
  removeCategoryItems,
  removeItem,
  TEXT_MAX,
  TODO_CAT,
  toggleDaily,
  toggleOnce,
  updateCategory,
  weekRaw,
  type CatColor,
  type CatIcon,
  type DayEntry,
  type PlanCategory,
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
 * 마이크로 인터랙션은 누른 순간에만: 체크(상자 톡 + 체크 그리기 + 줄 긋기 + 한 것이 아래로 미끄러짐), 하루를 다 하면 고리 톡,
 * 새 할 일은 떨어지듯 붙고, 날을 바꾸면 목록이 그 방향에서 들어온다. 움직임 줄이기 설정이면 모두 멈춘다.
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
  const [editing, setEditing] = useState(false);
  const [openDone, setOpenDone] = useState<Record<string, boolean>>({});
  const [fx, fire] = useFx(700);

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
  };

  const check = (e: DayEntry) => {
    if (e.moved || sel > today) return;
    if (!e.done) {
      fire(`chk:${e.key}`);
      buzz();
    }
    if (e.note && e.thought) onToggleApply(e.note.id, e.thought.id);
    else if (e.planId && e.rep === 'daily') setPlan((p) => toggleDaily(p, e.planId!, sel, today));
    else if (e.planId) setPlan((p) => toggleOnce(p, e.planId!, sel));
  };

  const { listRef, indRef } = useJellyTab(days.indexOf(sel), { axis: 'x', item: '.sn-wc-dp' });
  const selDate = new Date(`${sel}T00:00:00`);
  const dayNotes = notes.filter((n) => n.date === sel);

  return (
    <aside className="sn-plan sn-wp sn-wc" aria-label="한 주 동안" data-notap>
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
        <button
          type="button"
          className="sn-wp-pen"
          aria-pressed={editing}
          aria-label={editing ? '편집 끝내기' : '할 일 편집'}
          title={editing ? '편집 끝내기' : '할 일 편집'}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? (
            <Check className="sn-icon" aria-hidden />
          ) : (
            <Pencil className="sn-icon" aria-hidden />
          )}
        </button>
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
              data-fx={fx === `full:${d}` ? 'pop' : undefined}
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
              editing={editing}
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
              onRemove={(id) => setPlan((p) => removeItem(p, id))}
              onToggleAdd={() => {
                setAdding((v) => (v === c.id ? null : c.id));
                setEditCat(null);
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
    </aside>
  );
}

interface CategoryBlockProps {
  cat: PlanCategory;
  entries: DayEntry[];
  sel: string;
  today: string;
  fx: string | null;
  editing: boolean;
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
  onRemove: (planId: string) => void;
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
  editing,
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
  onRemove,
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
  const shown = [...open, ...(fold ? [] : done)];
  const listRef = useRef<HTMLDivElement>(null);
  useFlip(listRef, shown.map((e) => `${e.key}:${e.done ? 1 : 0}`).join(','));

  // 이 날 보기에서 새로 생긴 할 일만 떨어지듯 붙는다 (날을 바꾼 첫 그림·동기화로 들어온 것은 그대로)
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (seen.current) for (const e of entries) if (!seen.current.has(e.key)) fresh.add(e.key);
  useLayoutEffect(() => {
    seen.current = new Set(entries.map((e) => e.key));
  });

  const fut = sel > today;
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
          <div
            key={e.key}
            data-flip={e.key}
            className="sn-wc-it"
            data-done={e.done || undefined}
            data-moved={e.moved || undefined}
            data-hl={(!!highlight && e.note?.id === highlight) || undefined}
            data-fx={fresh.has(e.key) ? 'new' : fx === `chk:${e.key}` ? 'chk' : undefined}
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
            <span className="sn-wc-tx">
              <span className="sn-wc-t">{e.text}</span>
              {e.rep === 'daily' && (
                <span className="sn-wc-mt">
                  <Repeat className="sn-icon" aria-hidden />
                  매일
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
                  data-grp={isGroupNote(e.note) || undefined}
                  title="노트 열기"
                  onClick={() => onOpenNote(e.note!.id, e.thought?.aid)}
                >
                  {e.note.service || e.note.title || '설교'}
                </button>
              )}
            </span>
            {editing && e.planId && (
              <button
                type="button"
                className="sn-wp-x"
                aria-label={`${e.text} 지우기`}
                onClick={() => onRemove(e.planId!)}
              >
                <X className="sn-icon" aria-hidden />
              </button>
            )}
          </div>
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
