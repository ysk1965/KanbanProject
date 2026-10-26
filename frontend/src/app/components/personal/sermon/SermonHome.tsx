import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, MessageCircle, Mic, Share2 } from 'lucide-react';
import { BOOKS, PSALMS, refLong, type Ref } from './bibleRefs';
import { Mascot } from './Mascot';
import { mascotName, type MascotId } from './sermonLook';
import {
  audioDuration,
  galpiByWeek,
  isGalpi,
  mainRef,
  todayString,
  UNTITLED,
  type ApplyItem,
  type SermonNote,
} from './sermonTypes';
import { firstVerseText } from './useBible';
import { useFlip, useFx } from './microFx';
import { GroupDaySlots, NoteGroupFaces, NoteShareRow, useNoteGroups } from './group/GroupWeekBits';
import { resolveGalpiRule, useGalpiPrefs } from './galpiPrefs';
import { ShareSheet } from './share/ShareSheet';
import { StickerBook } from './StickerBook';
import './homeShare.css';

/**
 * 노트 목록의 첫 화면 「한 주 다이어리」.
 *  - 이번 주 설교 카드(표지형): 이번 주 갈피(그 주의 중심 설교)가 있으면 그 설교, 없으면 최근 설교.
 *    그림은 장 번호만이 아니라 항상 「책 이름 + 장」을 가리킨다.
 *    카드의 다음 행동은 「공유」와 「나눈 곳」 줄 (홈에서는 갈피를 꽂고 빼지 않는다)
 *  - 한 주 동안: 일~토 칸에 그날 들은 설교와 실천한 적용이 스티커로 붙는다
 *  - 모은 설교 스티커: 한 해 스티커북(StickerBook) — 주일마다 그 주 갈피 노트가 스티커로 붙는다
 */
interface SermonHomeProps {
  notes: SermonNote[];
  week: ApplyItem[];
  mascot: MascotId;
  onOpen: (id: string, aid?: string | null) => void;
  onNew: () => void;
  onToggleApply: (noteId: string, thoughtId: string) => void;
}

const DOW = '일월화수목금토';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 오늘이 든 주의 일요일 ~ 토요일 */
function weekDays(): Date[] {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const start = new Date(t);
  start.setDate(t.getDate() - t.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/** 책 이름: 다섯 글자가 넘으면 약어 (예레미야애가 → 애) */
function bookName(r: Ref): string {
  const [long, short] = BOOKS[r.b];
  return long.length > 4 ? short : long;
}

function verseRange(r: Ref): string {
  if (r.whole) return r.b === PSALMS ? '전체' : '장 전체';
  return r.v2 > r.v1 ? `${r.v1}–${r.v2}절` : `${r.v1}절`;
}

function chapterUnit(r: Ref): string {
  return r.b === PSALMS ? '편' : '장';
}

/** 'yyyy-MM-dd' → '10.25 주일' / '10.28 수요일' */
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${m}.${String(d).padStart(2, '0')} ${dow === 0 ? '주일' : `${DOW[dow]}요일`}`;
}

function fmtMin(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}

export function SermonHome({ notes, week, mascot, onOpen, onNew, onToggleApply }: SermonHomeProps) {
  const today = todayString();
  const days = useMemo(() => weekDays(), []);
  const weekStart = ymd(days[0]);
  const byDate = useMemo(
    () => [...notes].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [notes],
  );
  const galpiPrefs = useGalpiPrefs();
  const galpi = useMemo(
    () => galpiByWeek(notes, resolveGalpiRule(galpiPrefs, notes)),
    [notes, galpiPrefs],
  );
  const weekGalpi = galpi.get(weekStart);
  const hero = weekGalpi ?? byDate[0];
  const heroThisWeek = !!hero && (hero.date || '') >= weekStart && (hero.date || '') <= today;
  const ref = hero ? mainRef(hero) : null;
  const quote = ref ? firstVerseText(ref) : '';
  const thn = hero ? (hero.thoughts || []).length : 0;
  const rec = hero ? audioDuration(hero) : 0;

  // 「한 주 동안」 스티커 색: 개인 노트 = c1, 모임 노트 = c3, 갈피 노트는 앞에 갈피 리본
  const { hasGroups, isGroupNote } = useNoteGroups();

  const done = week.filter((x) => x.t.done).length;
  const left = week.length - done;
  const name = mascotName(mascot);

  // 누른 순간에만 한 번 움직인다 (microFx.ts)
  const [fx, fire] = useFx();
  const todoRef = useRef<HTMLDivElement>(null);
  const doneSig = week.map((x) => `${x.t.id}:${x.t.done ? 1 : 0}`).join(',');
  useFlip(todoRef, doneSig);
  const toggleApply = (noteId: string, thoughtId: string, wasDone: boolean) => {
    if (!wasDone) fire(left === 1 ? `all:${thoughtId}` : `apply:${thoughtId}`);
    onToggleApply(noteId, thoughtId);
  };
  const [shareOpen, setShareOpen] = useState(false);
  const applyFx = fx?.startsWith('apply:') || fx?.startsWith('all:');

  return (
    <div className="sn-home">
      <div className="sn-home-top">
        {hero && (
          <article className="sn-hc" data-galpi={!!weekGalpi}>
            <span className="sn-tape" style={{ left: 44, ['--r' as string]: '-7deg' }} />
            <span className="sn-tape sn-c1" style={{ right: 150, ['--r' as string]: '5deg' }} />
            <span className="sn-hc-peek">
              <Mascot kind={mascot} size={84} state={left === 0 && week.length ? 'done' : 'idle'} />
            </span>
            <button
              type="button"
              className="sn-cover"
              onClick={() => onOpen(hero.id)}
              aria-label={`${hero.title || UNTITLED} 노트 열기`}
            >
              <span className="sn-ht" aria-hidden />
              <span className="sn-disc" aria-hidden />
              {ref ? (
                <span className="sn-cover-txt" aria-hidden>
                  <span className="sn-cover-bk">{bookName(ref)}</span>
                  <span className="sn-cover-ch">
                    {ref.c}
                    <small>{chapterUnit(ref)}</small>
                  </span>
                </span>
              ) : (
                <span className="sn-cover-txt" aria-hidden>
                  <span className="sn-cover-bk">설교</span>
                </span>
              )}
              {ref && (
                <span className="sn-stk sn-cover-vs" style={{ ['--r' as string]: '3deg' }}>
                  {verseRange(ref)} · 개역한글
                </span>
              )}
            </button>
            <div className="sn-hc-body">
              <p className="sn-hc-run">
                <b className="sn-hc-chip">{heroThisWeek ? '이번 주 설교' : '최근 설교'}</b>
                {hero.date && <span className="sn-hc-date">{dayLabel(hero.date)}</span>}
                {hero.service && <span>{hero.service}</span>}
              </p>
              <h3>{hero.title || UNTITLED}</h3>
              <p className="sn-hc-who">
                {hero.preacher && <b>{hero.preacher}</b>}
                {rec > 0 && (
                  <span>
                    <Mic className="sn-icon" aria-hidden />
                    녹음 {fmtMin(rec)}
                  </span>
                )}
                {thn > 0 && (
                  <span>
                    <MessageCircle className="sn-icon" aria-hidden />
                    생각 {thn}개
                  </span>
                )}
              </p>
              {ref && quote && (
                <blockquote className="sn-vq">
                  <p>{quote}</p>
                  <cite>{refLong(ref)}</cite>
                </blockquote>
              )}
              <div className="sn-hc-acts">
                <button type="button" className="sn-btn sn-primary" onClick={() => onOpen(hero.id)}>
                  노트 열기
                  <ArrowRight className="sn-icon" aria-hidden />
                </button>
                <button
                  type="button"
                  className="sn-btn sn-hc-share"
                  onClick={() => setShareOpen(true)}
                >
                  <Share2 className="sn-icon" aria-hidden />
                  공유
                </button>
              </div>
              {heroThisWeek && <NoteShareRow note={hero} onCard={() => setShareOpen(true)} />}
            </div>
          </article>
        )}
        <ShareSheet
          open={shareOpen && !!hero}
          note={hero ?? null}
          mascot={mascot}
          onClose={() => setShareOpen(false)}
        />

        <aside className="sn-plan" aria-label="한 주 동안">
          <span className="sn-stk sn-c2 sn-plan-tag" style={{ ['--r' as string]: '5deg' }}>
            ♥ 이번 주 적용
          </span>
          <h4>
            한 주 동안
            {week.length > 0 && (
              <span className="sn-plan-fr" data-fx={fx?.startsWith('all:') ? 'all' : undefined}>
                <b key={done} data-fx={applyFx ? 'roll' : undefined}>
                  {done}
                </b>
                /{week.length}
              </span>
            )}
          </h4>
          {hasGroups && (
            <div className="sn-plan-lg" aria-label="스티커 색">
              <span>
                <i style={{ background: 'var(--sn-g1)' }} />
                개인
              </span>
              <span>
                <i style={{ background: 'var(--sn-g3)' }} />
                모임
              </span>
              <span>
                <span className="sn-rib" />
                갈피
              </span>
            </div>
          )}
          <div className="sn-days">
            {days.map((d) => {
              const ds = ymd(d);
              const dayNotes = notes.filter((n) => n.date === ds);
              const dayDone = week.filter(
                (x) => x.t.done && x.t.done_at && ymd(new Date(x.t.done_at)) === ds,
              );
              return (
                <div
                  key={ds}
                  className="sn-day"
                  data-sun={d.getDay() === 0}
                  data-today={ds === today}
                >
                  <div className="sn-day-l">
                    <b>{d.getDate()}</b>
                    <span>{ds === today ? '오늘' : `${DOW[d.getDay()]}요일`}</span>
                  </div>
                  <div className="sn-day-it">
                    {dayNotes.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={`sn-stk ${isGroupNote(n) ? 'sn-c3' : 'sn-c1'}`}
                        style={{ ['--r' as string]: '-2deg' }}
                        onClick={() => onOpen(n.id)}
                      >
                        {isGalpi(n, galpi) ? (
                          <span className="sn-rib" role="img" aria-label="갈피" />
                        ) : (
                          '✦'
                        )}{' '}
                        {n.title || UNTITLED}
                        <NoteGroupFaces note={n} />
                      </button>
                    ))}
                    {dayDone.map(({ n, t }) => (
                      <button
                        key={t.id}
                        type="button"
                        data-fx={fx?.endsWith(`:${t.id}`) && applyFx ? 'stick' : undefined}
                        className="sn-stk sn-c2"
                        style={{ ['--r' as string]: '2deg' }}
                        onClick={() => onOpen(n.id, t.aid)}
                      >
                        ♥ {t.text || '적용'}
                      </button>
                    ))}
                    <GroupDaySlots date={ds} notes={dayNotes} />
                    {!dayNotes.length &&
                      !dayDone.length &&
                      (ds === today ? (
                        <button
                          type="button"
                          className="sn-slot"
                          aria-label="오늘 설교 기록"
                          onClick={onNew}
                        >
                          +
                        </button>
                      ) : (
                        <span className="sn-slot" aria-hidden />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
          {week.length > 0 ? (
            <div className="sn-todo" ref={todoRef}>
              {[...week.filter((x) => !x.t.done), ...week.filter((x) => x.t.done)].map(
                ({ n, t }) => (
                  <div
                    key={`${n.id}|${t.id}`}
                    data-flip={`${n.id}|${t.id}`}
                    className="sn-todo-row"
                    data-checked={!!t.done}
                  >
                    <button
                      type="button"
                      data-fx={applyFx && fx?.endsWith(`:${t.id}`) ? 'press' : undefined}
                      className="sn-ck"
                      aria-pressed={!!t.done}
                      aria-label={t.done ? '실천 표시 지우기' : '실천했어요'}
                      onClick={() => toggleApply(n.id, t.id, !!t.done)}
                    >
                      <Check className="sn-icon" style={{ width: 15, height: 15 }} />
                    </button>
                    <button type="button" className="sn-todo-t" onClick={() => onOpen(n.id, t.aid)}>
                      {t.text || '(사진·영상 메모)'}
                      <small>{n.title || UNTITLED}</small>
                    </button>
                  </div>
                ),
              )}
            </div>
          ) : null}
          <div className="sn-cheer" data-fx={fx?.startsWith('all:') ? 'all' : undefined}>
            <Mascot kind={mascot} size={50} state={week.length && !left ? 'done' : 'think'} />
            <span>
              {!week.length ? (
                <>
                  적용할 점을 남겨 보세요
                  <small>설교를 들으며 ‘적용’ 태그로 적으면 여기 모여요</small>
                </>
              ) : left ? (
                <>
                  {left}개 남았어요
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
      </div>

      <div className="sn-sticker-sec">
        <div className="sn-sec-h">
          <h4>모은 설교 스티커</h4>
          <span>주일마다 갈피 노트 한 장</span>
        </div>
        <StickerBook notes={notes} galpi={galpi} mascot={mascot} onOpen={onOpen} />
      </div>
    </div>
  );
}
