import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Pencil, Plus, X } from 'lucide-react';
import type { SermonNote } from './sermonTypes';
import { useFx } from './microFx';
import {
  addItem,
  autoShort,
  DAILY_MAX,
  removeItem,
  SHORT_MAX,
  stickDay,
  TEXT_MAX,
  toggleDaily,
  toggleOnce,
  type OnceEntry,
  type PlanRep,
  type WeekBoard,
  type WeekPlan,
} from './weekPlan';
import './weekPanel.css';

/**
 * 홈 오른쪽 「한 주 동안」 — 이번 주 할 일 판.
 *  - 제목 줄: 「한 주 동안」 + 한 것/전체 숫자 + 연필(편집 → 지우기)
 *  - 이번 주 안에(상자 없이 제목 아래): 날짜 안 정한 한 번 할 일 (설교 노트의 「적용」 + 직접 적은 것), 끝의 점선 칩이 입력칸
 *  - 일~토 줄(한 줄 날짜): 한 날 ♥ 스티커, 그날로 정해 둔 할 일(점선), 오늘·앞으로 올 날은 「+」로 그 줄 아래 한 줄 입력
 *  - 매일 할 일: 날짜 줄 오른쪽 기둥 (머리 = 짧은 이름, 올리면 전체 문장). 오늘 이후는 못 누른다
 *  - 날짜 옆 작은 점 = 그날 들은 예배 (개인 g1 / 모임 g3)
 * 직접 적은 것은 weekPlan.ts (서버 sermon_plan 문서), 설교 적용 체크는 노트 thoughts[].done 이 그대로 맡는다.
 */
const DOW = '일월화수목금토';
const HC = ['var(--sn-g2)', 'var(--sn-g1)', 'var(--sn-g3)'];

interface WeekPanelProps {
  days: string[];
  today: string;
  board: WeekBoard;
  setPlan: (fn: (p: WeekPlan) => WeekPlan) => void;
  /** 이번 주 노트 — 날짜 옆 예배 점 */
  notes: SermonNote[];
  isGroupNote: (n: SermonNote) => boolean;
  /** 아래 예배 카드에서 「적용 N」을 누른 노트 */
  highlight: string | null;
  onOpen: (id: string, aid?: string | null) => void;
  onToggleApply: (noteId: string, thoughtId: string) => void;
}

type AddAt = 'tray' | string | null;

export function WeekPanel({
  days,
  today,
  board,
  setPlan,
  notes,
  isGroupNote,
  highlight,
  onOpen,
  onToggleApply,
}: WeekPanelProps) {
  const [addAt, setAddAt] = useState<AddAt>(null);
  const [editing, setEditing] = useState(false);
  const [fx, fire] = useFx();
  const { once, daily, tray, total, done, dailyLeftToday } = board;
  const mine = once.some((x) => x.planId) || daily.length > 0;
  useEffect(() => {
    if (!mine) setEditing(false);
  }, [mine]);

  const check = (e: OnceEntry) => {
    if (!e.doneOn) fire(`stick:${e.key}`);
    if (e.note && e.thought) onToggleApply(e.note.id, e.thought.id);
    else if (e.planId) setPlan((p) => toggleOnce(p, e.planId!, today));
  };
  const remove = (id: string) => setPlan((p) => removeItem(p, id));

  const chip = (e: OnceEntry, planned = false) => (
    <span
      key={e.key}
      className="sn-wp-chip"
      data-plan={planned || undefined}
      data-hl={(!!highlight && e.note?.id === highlight) || undefined}
    >
      <button
        type="button"
        className="sn-wp-ck"
        aria-label={`${e.text} 했어요`}
        onClick={() => check(e)}
      >
        <Check className="sn-icon" aria-hidden />
      </button>
      {e.note && <i className="sn-wp-from" data-grp={isGroupNote(e.note) || undefined} />}
      {e.note ? (
        <button
          type="button"
          className="sn-wp-tx"
          title={e.text}
          onClick={() => onOpen(e.note!.id, e.thought?.aid)}
        >
          {e.text}
        </button>
      ) : (
        <span className="sn-wp-tx" title={e.text}>
          {e.text}
        </span>
      )}
      {editing && e.planId && (
        <button
          type="button"
          className="sn-wp-x"
          aria-label={`${e.text} 지우기`}
          onClick={() => remove(e.planId!)}
        >
          <X className="sn-icon" aria-hidden />
        </button>
      )}
    </span>
  );

  const sticker = (e: OnceEntry, i: number) => (
    <span
      key={e.key}
      className="sn-wp-stkw"
      data-hl={(!!highlight && e.note?.id === highlight) || undefined}
    >
      <button
        type="button"
        className="sn-stk sn-c2"
        data-fx={fx === `stick:${e.key}` ? 'stick' : undefined}
        style={{ ['--r' as string]: i % 2 ? '2deg' : '-2deg' }}
        aria-label={`${e.text} 되돌리기`}
        title="누르면 되돌려요"
        onClick={() => check(e)}
      >
        ♥ {e.text}
      </button>
      {editing && e.planId && (
        <button
          type="button"
          className="sn-wp-x"
          aria-label={`${e.text} 지우기`}
          onClick={() => remove(e.planId!)}
        >
          <X className="sn-icon" aria-hidden />
        </button>
      )}
    </span>
  );

  const add = (input: { text: string; rep: PlanRep; short?: string; day?: string | null }) =>
    setPlan((p) =>
      addItem(p, { ...input, day: input.rep === 'once' ? (input.day ?? null) : null }),
    );

  const dailyFull = daily.length >= DAILY_MAX;

  return (
    <aside className="sn-plan sn-wp" aria-label="한 주 동안">
      <span className="sn-stk sn-c2 sn-plan-tag" style={{ ['--r' as string]: '5deg' }}>
        ♥ 이번 주 적용
      </span>
      <div className="sn-wp-h">
        <h4>한 주 동안</h4>
        {total > 0 && (
          <span
            className="sn-plan-fr"
            title={`이번 주 ${once.filter((x) => x.doneOn).length}/${once.length}${daily.length ? ` · 오늘 매일 ${daily.length - dailyLeftToday}/${daily.length}` : ''}`}
          >
            <b key={done}>{done}</b>/{total}
          </span>
        )}
        {mine && (
          <button
            type="button"
            className="sn-wp-pen"
            aria-pressed={editing}
            aria-label={editing ? '편집 끝내기' : '편집'}
            title={editing ? '편집 끝내기' : '편집'}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? (
              <Check className="sn-icon" aria-hidden />
            ) : (
              <Pencil className="sn-icon" aria-hidden />
            )}
          </button>
        )}
      </div>

      {/* 이번 주 안에 (날짜 안 정한 할 일) — 칩 끝 점선 칩이 곧 입력칸 */}
      <div className="sn-wp-free sn-wp-items">
        {tray.map((e) => chip(e))}
        <TrayInput hasItems={tray.length > 0} dailyFull={dailyFull} onAdd={add} />
      </div>

      <div className="sn-wp-days" data-cols={daily.length || undefined}>
        {daily.length > 0 && (
          <div className="sn-wp-dh">
            <span />
            <span />
            <span className="sn-wp-cols">
              {daily.map((d, i) => (
                <span key={d.id} className="sn-wp-col">
                  {editing ? (
                    <button
                      type="button"
                      className="sn-wp-hn"
                      data-del
                      style={{ ['--c' as string]: HC[i % HC.length] }}
                      aria-label={`매일 · ${d.text} 지우기`}
                      title={`${d.text} 지우기`}
                      onClick={() => remove(d.id)}
                    >
                      <X className="sn-icon" aria-hidden />
                      {d.short}
                    </button>
                  ) : (
                    <span
                      className="sn-wp-hn"
                      style={{ ['--c' as string]: HC[i % HC.length] }}
                      title={`매일 · ${d.text}`}
                      tabIndex={0}
                      aria-label={`매일 · ${d.text}`}
                    >
                      {d.short}
                    </span>
                  )}
                </span>
              ))}
            </span>
          </div>
        )}
        {days.map((ds) => {
          const d = new Date(`${ds}T00:00:00`);
          const fut = ds > today;
          const isToday = ds === today;
          const dayNotes = notes.filter((n) => n.date === ds);
          const stuck = once.filter((e) => stickDay(e, days, today) === ds);
          const planned = once.filter((e) => !e.doneOn && e.day === ds);
          const empty = !stuck.length && !planned.length;
          return (
            <div
              key={ds}
              className="sn-wp-row"
              data-today={isToday || undefined}
              data-fut={fut || undefined}
              data-past={(!isToday && !fut) || undefined}
              data-empty={empty || undefined}
              data-sun={d.getDay() === 0 || undefined}
            >
              <div className="sn-wp-dl">
                <b>{d.getDate()}</b>
                <span>{isToday ? '오늘' : DOW[d.getDay()]}</span>
                {dayNotes.length > 0 && (
                  <span className="sn-wp-dots" title={`이날 들은 예배 ${dayNotes.length}편`}>
                    {dayNotes.slice(0, 3).map((n) => (
                      <i key={n.id} data-grp={isGroupNote(n) || undefined} />
                    ))}
                  </span>
                )}
              </div>
              <div className="sn-wp-items">
                {stuck.map(sticker)}
                {planned.map((e) => chip(e, true))}
                {(isToday || fut) && addAt !== ds && (
                  <button
                    type="button"
                    className="sn-wp-add"
                    aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 할 일 적기`}
                    onClick={() => setAddAt(ds)}
                  >
                    +
                  </button>
                )}
              </div>
              {daily.length > 0 && (
                <span className="sn-wp-cols">
                  {daily.map((h, i) => {
                    const on = (h.log || []).includes(ds);
                    return (
                      <span key={h.id} className="sn-wp-col">
                        <button
                          type="button"
                          className="sn-wp-hd"
                          style={{ ['--c' as string]: HC[i % HC.length] }}
                          aria-pressed={on}
                          disabled={fut}
                          aria-label={`${h.short} · ${d.getMonth() + 1}월 ${d.getDate()}일 ${on ? '되돌리기' : '했어요'}`}
                          title={h.text}
                          onClick={() => setPlan((p) => toggleDaily(p, h.id, ds, today))}
                        >
                          <Check className="sn-icon" aria-hidden />
                        </button>
                      </span>
                    );
                  })}
                </span>
              )}
              {addAt === ds && (
                <DayInput
                  placeholder={
                    isToday
                      ? '오늘 해볼 것 · Enter'
                      : `${d.getMonth() + 1}.${d.getDate()} ${DOW[d.getDay()]}요일에 해볼 것 · Enter`
                  }
                  onAdd={(text) => add({ text, rep: 'once', day: ds })}
                  onClose={() => setAddAt(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

/** 「이번 주 안에」 칩 끝 점선 칩 = 입력칸. 글자를 쓰면 「한 번·매일」, 매일이면 아래 줄에 기둥 이름 */
function TrayInput({
  hasItems,
  dailyFull,
  onAdd,
}: {
  hasItems: boolean;
  dailyFull: boolean;
  onAdd: (input: { text: string; rep: PlanRep; short?: string }) => void;
}) {
  const [text, setText] = useState('');
  const [rep, setRep] = useState<PlanRep>('once');
  const [short, setShort] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!text.trim()) return;
    onAdd({ text, rep, short });
    setText('');
    setShort('');
    setRep('once');
    ref.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setText('');
      setShort('');
      setRep('once');
      ref.current?.blur();
    }
  };
  const showSeg = !!text.trim() || rep === 'daily';

  return (
    <>
      <label className="sn-wp-in">
        <Plus className="sn-icon" aria-hidden />
        <input
          ref={ref}
          type="text"
          value={text}
          maxLength={TEXT_MAX}
          placeholder={hasItems ? '더 적기' : '이번 주 안에 할 것 적기'}
          aria-label="이번 주 안에 할 것"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        {showSeg && (
          <span className="sn-wp-seg" role="group" aria-label="반복">
            <button
              type="button"
              aria-pressed={rep === 'once'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setRep('once')}
            >
              한 번
            </button>
            <button
              type="button"
              aria-pressed={rep === 'daily'}
              disabled={dailyFull}
              title={dailyFull ? `매일 할 일은 ${DAILY_MAX}개까지예요` : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setRep('daily')}
            >
              매일
            </button>
          </span>
        )}
      </label>
      {rep === 'daily' && (
        <label className="sn-wp-short">
          기둥에 보일 이름
          <input
            type="text"
            value={short}
            maxLength={SHORT_MAX}
            placeholder={text.trim() ? autoShort(text) : '예: 감사기도'}
            onChange={(e) => setShort(e.target.value)}
            onKeyDown={onKey}
          />
        </label>
      )}
    </>
  );
}

/** 날짜 줄 「+」 → 그 줄 아래 한 줄 입력 (그날 한 번 할 일). 비운 채 벗어나면 닫힌다 */
function DayInput({
  placeholder,
  onAdd,
  onClose,
}: {
  placeholder: string;
  onAdd: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <label className="sn-wp-dayin">
      <input
        ref={ref}
        type="text"
        value={text}
        maxLength={TEXT_MAX}
        placeholder={placeholder}
        aria-label="그날 할 일"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (text.trim()) onAdd(text);
            onClose();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
    </label>
  );
}
