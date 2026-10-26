import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { Mascot, type MascotState } from '../Mascot';
import { SnActionBar } from '../SnActionBar';
import { loadLook, type MascotId } from '../sermonLook';
import { ANONYMOUS_USER } from '../sermonStore';
import { UNTITLED, type SermonNote } from '../sermonTypes';
import { useBible } from '../useBible';
import { Coin } from './ChallengeBits';
import {
  chapterDone,
  chapterLong,
  chapterTag,
  doneCount,
  elapsedMs,
  firstUndone,
  isSkipChar,
  pilsaSource,
  pilsaWeekLabel,
  reasonText,
  stripText,
  verseChars,
  verseComplete,
  weekDone,
  type PilsaChapter,
  type PilsaPlan,
  type PilsaReason,
} from './pilsaPlan';
import { usePilsa, type PilsaMarkResult } from './pilsaStore';
import './pilsa.css';

/**
 * 이번 주 말씀 필사 — (a) 성경책에 꽂힌 일곱 가름끈 → (b) 한 장 따라 쓰기 → 일곱 장 다 쓰면 스티커 판.
 * 시안: https://claude.ai/artifact/VGETvTSKVaHg9Xfy2FhQKv §2–4
 * 약속: 진행 = 가름끈, 끝난 것 = 스티커, 말씀 = 명조(Hahmlet), 갈피의 말 = 손글씨(Gaegu).
 */

const ROT = [-4, 3, -2, 4, -3, 2, -5];
const LEGEND: Array<[PilsaReason, string]> = [
  ['main', '설교 본문'],
  ['cited', '설교에 나온 장'],
  ['near', '앞뒤 장'],
  ['next', '다음 주 본문 미리'],
  ['common', '함께 쓰는 장'],
];

function Poster({ text, id, as = 'h2' }: { text: string; id?: string; as?: 'h2' | 'h3' }) {
  const Tag = as;
  return (
    <Tag className="sn-pl-poster" id={id}>
      <span className="sn-pl-ink2" aria-hidden>
        {text}
      </span>
      <span className="sn-pl-ink1">{text}</span>
    </Tag>
  );
}

function shortDate(ds: string): string {
  const [, m, d] = (ds || '').split('-').map(Number);
  return m && d ? `${m}.${d}` : '';
}

export function PilsaView({
  notes,
  userId,
  anonymous,
  onBack,
  onLogin,
}: {
  notes: SermonNote[];
  userId: string;
  anonymous: boolean;
  onBack: () => void;
  onLogin?: () => void;
}) {
  const anon = anonymous || userId === ANONYMOUS_USER;
  const { plan, markVerse } = usePilsa(notes, userId, anonymous);
  const [open, setOpen] = useState<{ b: number; c: number } | null>(null);
  const [mascot] = useState<MascotId>(() => loadLook().mascot);
  const source = useMemo(() => pilsaSource(notes), [notes]);
  const close = useCallback(() => setOpen(null), []);

  const ch = open ? plan?.chapters.find((x) => x.b === open.b && x.c === open.c) : undefined;
  if (plan && ch) {
    return (
      <PilsaWriter
        key={`${ch.b}:${ch.c}`}
        ch={ch}
        plan={plan}
        mascot={mascot}
        anon={anon}
        onClose={close}
        markVerse={markVerse}
      />
    );
  }

  const main = plan?.chapters.find((x) => x.reason === 'main');
  const label = plan ? pilsaWeekLabel(plan.week) : '';
  let from = '';
  if (plan && main) {
    from =
      source && source.main.b === main.b && source.main.c === main.c
        ? `${shortDate(source.note.date)} 「${source.note.title || UNTITLED}」에서 골랐어요`
        : `${chapterLong(main.b, main.c)}에서 시작했어요`;
  } else if (plan) {
    from = '설교 노트가 없는 주라 요한복음을 함께 써요';
  }
  const reasons = new Set(plan?.chapters.map((x) => x.reason));

  return (
    <div className="sn-pl">
      <SnActionBar backLabel="챌린지" onBack={onBack} />
      {!plan ? (
        <div className="sn-pl-wait" role="status">
          <Loader2 className="sn-pl-spin" aria-hidden />
          <span>성경을 펴고 이번 주 일곱 장을 고르고 있어요</span>
        </div>
      ) : (
        <>
          {weekDone(plan) && <DoneSheet plan={plan} anon={anon} />}
          <section className="sn-pl-shelf" aria-labelledby="sn-pl-week">
            <div className="sn-pl-head">
              <Poster text={label} id="sn-pl-week" />
              <p className="sn-pl-sub">
                {from}
                <br />
                {doneCount(plan)}장 썼어요 · 일요일 밤까지
              </p>
            </div>
            <div className="sn-pl-book" aria-hidden>
              <span>성 경</span>
            </div>
            <div className="sn-pl-ribbons" role="group" aria-label="이번 주 일곱 장">
              {plan.chapters.map((x, i) => {
                const all = chapterDone(x);
                const n = x.done.length;
                const p = x.verses ? Math.round((n / x.verses) * 100) : 0;
                const why = reasonText(x, plan);
                const style = {
                  '--h': `${90 + Math.min(x.verses, 58) * 0.9}px`,
                  '--p': `${p}%`,
                  '--r': `${ROT[i % ROT.length]}deg`,
                } as CSSProperties;
                return (
                  <button
                    key={`${x.b}:${x.c}`}
                    type="button"
                    className="sn-pl-rib"
                    data-reason={x.reason}
                    style={style}
                    aria-label={`${chapterLong(x.b, x.c)} — ${why}, ${x.verses}절 중 ${n}절 썼어요`}
                    onClick={() => setOpen({ b: x.b, c: x.c })}
                  >
                    <span className="sn-pl-band" aria-hidden>
                      <span className="sn-pl-fill" />
                    </span>
                    <span className="sn-pl-tag">{chapterTag(x.b, x.c)}</span>
                    <span className="sn-pl-why">
                      {why}
                      <br />
                      {x.verses}절
                    </span>
                    {all ? (
                      <span className="sn-pl-done">다 썼어요</span>
                    ) : n > 0 ? (
                      <span className="sn-pl-done is-part">{Math.max(...x.done)}절까지</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="sn-pl-legend">
              {LEGEND.filter(([r]) => reasons.has(r)).map(([r, t]) => (
                <span key={r} data-reason={r}>
                  <i aria-hidden />
                  {t}
                </span>
              ))}
            </div>
            {anon && (
              <div className="sn-pl-anon">
                <span>연습 판이에요. 로그인하면 장마다 달란트가 쌓여요.</span>
                {onLogin && (
                  <button type="button" className="sn-btn" onClick={onLogin}>
                    <LogIn className="sn-icon" aria-hidden />
                    로그인
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ───────── 일곱 장 다 쓴 스티커 판 ───────── */

function DoneSheet({ plan, anon }: { plan: PilsaPlan; anon: boolean }) {
  const label = pilsaWeekLabel(plan.week);
  const first = plan.chapters.find((x) => x.reason === 'main') || plan.chapters[0];
  return (
    <section className="sn-pl-sheet" aria-labelledby="sn-pl-sheet-t">
      <Poster text="일곱 장 다 꽂았어요" id="sn-pl-sheet-t" />
      <p className="sn-pl-sub">
        {label} · {first ? `${chapterLong(first.b, first.c)}에서 시작` : ''} ·{' '}
        {anon ? '연습 판이라 달란트는 없어요' : '장마다 +5 그리고 +20'}
      </p>
      <div className="sn-pl-stks">
        {plan.chapters.map((x, i) => (
          <span
            key={`${x.b}:${x.c}`}
            className="sn-pl-stk"
            data-reason={x.reason}
            style={{ '--r': `${ROT[i % ROT.length]}deg` } as CSSProperties}
          >
            {chapterTag(x.b, x.c)}
            <small>{x.verses}절</small>
          </span>
        ))}
      </div>
      <div className="sn-pl-big" role="img" aria-label={`필사 한 주 스티커 · ${label}`}>
        필사
        <br />한 주<small>{label}</small>
      </div>
    </section>
  );
}

/* ───────── 한 장 따라 쓰기 ───────── */

type Seg = { cls: 'ok' | 'bad' | 'rest'; text: string } | { cls: 'cur' };

/** 지금 절 글자에 따라 쓴 글자를 겹친다 — 공백·문장 부호는 비교하지 않는다 */
function overlay(target: string, typed: string): Seg[] {
  const t = stripText(typed);
  const out: Seg[] = [];
  const push = (cls: 'ok' | 'bad' | 'rest', ch: string) => {
    const last = out[out.length - 1];
    if (last && last.cls === cls) (last as { text: string }).text += ch;
    else out.push({ cls, text: ch });
  };
  let k = 0;
  let placed = false;
  for (const ch of target) {
    const skip = isSkipChar(ch);
    if (!placed && !skip && k === t.length) {
      out.push({ cls: 'cur' });
      placed = true;
    }
    if (skip) {
      push(k < t.length ? 'ok' : 'rest', ch);
      continue;
    }
    if (k < t.length) push(t[k] === ch ? 'ok' : 'bad', ch);
    else push('rest', ch);
    k++;
  }
  if (!placed) out.push({ cls: 'cur' });
  return out;
}

const HINT = '한 글자씩 천천히. 띄어쓰기는 안 봐요.';

function PilsaWriter({
  ch,
  plan,
  mascot,
  anon,
  onClose,
  markVerse,
}: {
  ch: PilsaChapter;
  plan: PilsaPlan;
  mascot: MascotId;
  anon: boolean;
  onClose: () => void;
  markVerse: (
    b: number,
    c: number,
    v: number,
    chars: number,
    ms: number,
  ) => Promise<PilsaMarkResult>;
}) {
  const { bible, failed } = useBible();
  const texts = bible?.[ch.b]?.[ch.c - 1] ?? null;
  const done = useMemo(() => new Set(ch.done), [ch.done]);
  const cur = firstUndone(ch);
  const [typed, setTyped] = useState('');
  const [say, setSay] = useState<ReactNode>(HINT);
  const [mood, setMood] = useState<MascotState>('idle');
  const [hop, setHop] = useState(0);
  const [result, setResult] = useState<PilsaMarkResult | null>(null);
  const startRef = useRef<number | null>(null);
  const composing = useRef(false);
  const busy = useRef(false);
  const moodTimer = useRef(0);
  const nowRef = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const why = reasonText(ch, plan);
  const title = chapterLong(ch.b, ch.c).replace(/[장편]$/, '');
  const prog = ch.verses ? Math.round((ch.done.length / ch.verses) * 92) : 0;

  useEffect(() => () => window.clearTimeout(moodTimer.current), []);
  useEffect(() => {
    nowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [cur]);

  const tryAdvance = useCallback(
    (value: string) => {
      if (busy.current || cur == null || !texts) return;
      const target = texts[cur - 1] ?? '';
      if (!verseComplete(value, target)) {
        if (stripText(value).length >= stripText(target).length) {
          setSay('물결 밑줄이 있는 글자를 다시 봐 주세요.');
        }
        return;
      }
      busy.current = true;
      const chars = verseChars(target);
      const ms = elapsedMs(startRef.current, Date.now());
      startRef.current = null;
      setTyped('');
      setMood('done');
      setHop((h) => h + 1);
      setSay(
        <>
          <b>{cur}절</b> 꽂았어요.
        </>,
      );
      window.clearTimeout(moodTimer.current);
      moodTimer.current = window.setTimeout(() => setMood('idle'), 900);
      const p = markVerse(ch.b, ch.c, cur, chars, ms);
      busy.current = false;
      void p.then((r) => {
        if (r.chapterDone || r.awarded) setResult(r);
      });
    },
    [ch.b, ch.c, cur, markVerse, texts],
  );

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (startRef.current == null && stripText(v)) startRef.current = Date.now();
    setTyped(v);
    const ime = (e.nativeEvent as InputEvent).isComposing || composing.current;
    if (!ime) {
      tryAdvance(v);
      return;
    }
    // 한글 조합 중에는 넘기지 않는다 — 마지막 글자 조합이 끝나면(띄어쓰기·Enter) 넘어간다
    const target = cur != null && texts ? texts[cur - 1] : '';
    if (target && stripText(v).length >= stripText(target).length) {
      setSay('마지막 글자 뒤에 띄어쓰기를 한 번 누르면 넘어가요.');
    }
  };

  const blockPaste = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setSay('붙여넣기는 안 돼요. 한 글자씩 따라 써 봐요.');
    setMood('think');
  };

  const allDone = cur == null;
  const lastDoneAll = allDone && (result?.weekDone || weekDone(plan));

  return (
    <div className="sn-pl sn-pl-writing">
      <SnActionBar backLabel="일곱 장" onBack={onClose} />
      <article
        className="sn-pl-page"
        style={{ '--prog': prog } as CSSProperties}
        data-reason={ch.reason}
        aria-labelledby="sn-pl-ch"
      >
        <span className="sn-pl-side" aria-hidden />
        <div className="sn-pl-phead">
          <Poster text={title} id="sn-pl-ch" as="h2" />
          <span className="sn-pl-sub">
            {why} · {ch.verses}절 중 {ch.done.length}절 썼어요
          </span>
          <span className={`sn-pl-m${hop ? (hop % 2 ? ' is-hop-a' : ' is-hop-b') : ''}`}>
            <Mascot kind={mascot} state={mood} size={52} />
          </span>
        </div>

        {allDone ? (
          <div className="sn-pl-fin" role="status">
            <span
              className="sn-pl-stk"
              data-reason={ch.reason}
              style={{ '--r': '-6deg' } as CSSProperties}
            >
              {chapterTag(ch.b, ch.c)}
              <small>{ch.verses}절</small>
            </span>
            <p className="sn-pl-hand">{chapterLong(ch.b, ch.c)} 다 썼어요!</p>
            {!anon && (result?.awarded ?? 0) > 0 && (
              <p className="sn-pl-award">
                <Coin size={20} play="gain" /> +{result!.awarded} 달란트
              </p>
            )}
            {anon && <p className="sn-pl-note">연습 판이라 달란트는 쌓이지 않아요.</p>}
            <button type="button" className="sn-btn sn-primary" onClick={onClose}>
              {lastDoneAll ? '스티커 판 보기' : '가름끈으로 돌아가기'}
            </button>
          </div>
        ) : !texts ? (
          <div className="sn-pl-wait" role="status">
            {failed ? (
              <span>성경 본문을 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.</span>
            ) : (
              <>
                <Loader2 className="sn-pl-spin" aria-hidden />
                <span>성경을 펴는 중이에요</span>
              </>
            )}
          </div>
        ) : (
          <>
            <ol className="sn-pl-verses" aria-label={`${chapterLong(ch.b, ch.c)} 본문`}>
              {texts.map((t, i) => {
                const v = i + 1;
                if (v === cur) {
                  return (
                    <li key={v} className="sn-pl-v is-now" ref={nowRef}>
                      <span className="sn-pl-n">{v}</span>
                      <span className="sn-sr">지금 쓰는 절: {t}</span>
                      <span aria-hidden>
                        {overlay(t, typed).map((s, j) =>
                          s.cls === 'cur' ? (
                            <span key={j} className="sn-pl-cur" />
                          ) : (
                            <span key={j} className={`sn-pl-${s.cls}`}>
                              {s.text}
                            </span>
                          ),
                        )}
                      </span>
                    </li>
                  );
                }
                const isDone = done.has(v);
                const isNext = cur != null && v === cur + 1 && !isDone;
                return (
                  <li
                    key={v}
                    className={`sn-pl-v ${isDone ? 'is-past' : 'is-later'}${isNext ? ' is-next' : ''}`}
                  >
                    <span className="sn-pl-n">{v}</span>
                    {t}
                    {isDone && <span className="sn-pl-wrote">썼어요</span>}
                  </li>
                );
              })}
            </ol>
            <div className="sn-pl-in">
              <label htmlFor="sn-pl-input" className="sn-sr">
                지금 쓰는 절
              </label>
              <input
                id="sn-pl-input"
                ref={inputRef}
                type="text"
                value={typed}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="next"
                placeholder="흐린 글자를 따라 써요"
                onChange={onChange}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={(e) => {
                  composing.current = false;
                  tryAdvance(e.currentTarget.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    tryAdvance(e.currentTarget.value);
                  }
                }}
                onPaste={blockPaste}
                onDrop={blockPaste}
                onFocus={() => inputRef.current?.scrollIntoView?.({ block: 'nearest' })}
              />
            </div>
            <p className="sn-pl-say" aria-live="polite">
              {say}
            </p>
          </>
        )}
      </article>
    </div>
  );
}
