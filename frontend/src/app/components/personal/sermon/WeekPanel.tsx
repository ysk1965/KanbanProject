import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Mascot } from './Mascot';
import { mascotName, type MascotId } from './sermonLook';
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
 *  - 「이번 주 안에」: 날짜 안 정한 한 번 할 일 (설교 노트의 「적용」 + 직접 적은 것)
 *  - 일~토 줄: 한 날 ♥ 스티커, 그날로 정해 둔 할 일(점선), 오늘·앞으로 올 날은 「+」로 적기
 *  - 매일 할 일: 날짜 줄 오른쪽 기둥 (머리 = 짧은 이름, 위 「매일」 줄 = 전체 문장). 오늘 이후는 못 누른다
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
  mascot: MascotId;
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
  mascot,
  onOpen,
  onToggleApply,
}: WeekPanelProps) {
  const [addAt, setAddAt] = useState<AddAt>(null);
  const [editing, setEditing] = useState(false);
  const [fx, fire] = useFx();
  const { once, daily, tray, total, done, left, dailyLeftToday } = board;
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

  const onAdd = (day: string | null) => (input: { text: string; rep: PlanRep; short?: string }) => {
    setPlan((p) => addItem(p, { ...input, day: input.rep === 'once' ? day : null }));
  };

  const name = mascotName(mascot);
  const dailyFull = daily.length >= DAILY_MAX;

  return (
    <aside className="sn-plan sn-wp" aria-label="한 주 동안">
      <span className="sn-stk sn-c2 sn-plan-tag" style={{ ['--r' as string]: '5deg' }}>
        ♥ 이번 주 적용
      </span>
      <h4>
        한 주 동안
        {total > 0 && (
          <span className="sn-plan-fr">
            <b key={done}>{done}</b>/{total}
          </span>
        )}
      </h4>
      <div className="sn-wp-sub">
        <span>
          {daily.length > 0 && `오늘 매일 ${daily.length - dailyLeftToday}/${daily.length} · `}
          이번 주 {once.filter((x) => x.doneOn).length}/{once.length}
        </span>
        {mine && (
          <button
            type="button"
            className="sn-wp-edit"
            aria-pressed={editing}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? '완료' : '편집'}
          </button>
        )}
      </div>

      {daily.length > 0 && (
        <div className="sn-wp-leg" aria-label="매일 할 일">
          <span className="sn-wp-leg-l">매일</span>
          {daily.map((d, i) => (
            <span
              key={d.id}
              className="sn-wp-leg-it"
              style={{ ['--c' as string]: HC[i % HC.length] }}
            >
              <b>{d.short}</b>
              <em title={d.text}>{d.text}</em>
              {editing && (
                <button
                  type="button"
                  className="sn-wp-x"
                  aria-label={`${d.text} 지우기`}
                  onClick={() => remove(d.id)}
                >
                  <X className="sn-icon" aria-hidden />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="sn-wp-tray">
        <div className="sn-wp-tray-h">
          <span>이번 주 안에 · {tray.length}</span>
          {addAt !== 'tray' && (
            <button type="button" onClick={() => setAddAt('tray')}>
              <Plus className="sn-icon" aria-hidden /> 적기
            </button>
          )}
        </div>
        {tray.length > 0 ? (
          <div className="sn-wp-items">{tray.map((e) => chip(e))}</div>
        ) : (
          addAt !== 'tray' && <p className="sn-wp-empty">날짜 안 정한 할 일이 없어요</p>
        )}
        {addAt === 'tray' && (
          <AddForm
            placeholder="이번 주 안에 해볼 것"
            dailyFull={dailyFull}
            onAdd={onAdd(null)}
            onClose={() => setAddAt(null)}
          />
        )}
      </div>

      <div className="sn-wp-days" data-cols={daily.length || undefined}>
        {daily.length > 0 && (
          <div className="sn-wp-dh" aria-hidden>
            <span />
            <span className="sn-wp-dh-l">한 번 할 일</span>
            <span className="sn-wp-cols">
              {daily.map((d, i) => (
                <span key={d.id} className="sn-wp-col">
                  <span
                    className="sn-wp-hn"
                    style={{ ['--c' as string]: HC[i % HC.length] }}
                    title={d.text}
                  >
                    {d.short}
                  </span>
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
              data-sun={d.getDay() === 0 || undefined}
            >
              <div className="sn-wp-dl">
                <b>
                  {d.getDate()}
                  {dayNotes.length > 0 && (
                    <span className="sn-wp-dots" title={`이날 들은 예배 ${dayNotes.length}편`}>
                      {dayNotes.slice(0, 3).map((n) => (
                        <i key={n.id} data-grp={isGroupNote(n) || undefined} />
                      ))}
                    </span>
                  )}
                </b>
                <span>{isToday ? '오늘' : `${DOW[d.getDay()]}요일`}</span>
              </div>
              <div className="sn-wp-items">
                {stuck.map(sticker)}
                {planned.map((e) => chip(e, true))}
                {(isToday || fut) && addAt !== ds && (
                  <button
                    type="button"
                    className="sn-slot sn-wp-add"
                    data-quiet={!empty || undefined}
                    aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 할 일 적기`}
                    onClick={() => setAddAt(ds)}
                  >
                    +
                  </button>
                )}
                {!isToday && !fut && empty && <span className="sn-slot" aria-hidden />}
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
                <AddForm
                  placeholder={
                    isToday
                      ? '오늘 해볼 것'
                      : `${d.getMonth() + 1}.${d.getDate()} ${DOW[d.getDay()]}요일에 해볼 것`
                  }
                  dailyFull={dailyFull}
                  onAdd={onAdd(ds)}
                  onClose={() => setAddAt(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="sn-cheer">
        <Mascot kind={mascot} size={50} state={total && !left ? 'done' : 'think'} />
        <span>
          {!total ? (
            <>
              이번 주에 해볼 것을 적어 보세요
              <small>설교의 ‘적용’ 태그와 여기 바로 적은 것이 함께 모여요</small>
            </>
          ) : dailyLeftToday ? (
            <>
              오늘 매일 할 일 {dailyLeftToday}개 남았어요
              <small>실천하면 {name}도 같이 기뻐해요</small>
            </>
          ) : left ? (
            <>
              이번 주 {left}개 남았어요
              <small>실천하면 {name}도 같이 기뻐해요</small>
            </>
          ) : (
            <>
              이번 주 적용 완료!
              <small>다음 주일에 새 스티커가 생겨요</small>
            </>
          )}
        </span>
      </div>
    </aside>
  );
}

function AddForm({
  placeholder,
  dailyFull,
  onAdd,
  onClose,
}: {
  placeholder: string;
  dailyFull: boolean;
  onAdd: (input: { text: string; rep: PlanRep; short?: string }) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [rep, setRep] = useState<PlanRep>('once');
  const [short, setShort] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const submit = () => {
    if (!text.trim()) return;
    onAdd({ text, rep, short });
    setText('');
    setShort('');
    if (rep === 'daily') setRep('once');
    ref.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="sn-wp-form">
      <div className="sn-wp-form-l">
        <input
          ref={ref}
          type="text"
          value={text}
          maxLength={TEXT_MAX}
          placeholder={placeholder}
          aria-label="할 일"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="sn-wp-seg" role="group" aria-label="반복">
          <button type="button" aria-pressed={rep === 'once'} onClick={() => setRep('once')}>
            한 번
          </button>
          <button
            type="button"
            aria-pressed={rep === 'daily'}
            disabled={dailyFull}
            title={dailyFull ? `매일 할 일은 ${DAILY_MAX}개까지예요` : undefined}
            onClick={() => setRep('daily')}
          >
            매일
          </button>
        </div>
      </div>
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
      <div className="sn-wp-form-f">
        <span>
          {dailyFull ? `매일 할 일은 ${DAILY_MAX}개까지예요 · ` : ''}Enter 추가 · Esc 닫기
        </span>
        <span>
          <button type="button" className="sn-wp-cancel" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="sn-wp-go" disabled={!text.trim()} onClick={submit}>
            추가
          </button>
        </span>
      </div>
    </div>
  );
}
