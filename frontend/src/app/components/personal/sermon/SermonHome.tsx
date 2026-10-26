import { useMemo, useState } from 'react';
import { ArrowRight, MessageCircle, Mic, Share2 } from 'lucide-react';
import { PSALMS, refLong, type Ref } from './bibleRefs';
import { Mascot } from './Mascot';
import type { MascotId } from './sermonLook';
import {
  audioDuration,
  galpiByWeek,
  mainRef,
  todayString,
  UNTITLED,
  type SermonNote,
} from './sermonTypes';
import { firstVerseText } from './useBible';
import { NoteShareRow, useNoteGroups } from './group/GroupWeekBits';
import { WorshipSuggest } from './WorshipHomeBits';
import { WeekPanel } from './WeekPanel';
import { WeekServices } from './WeekServices';
import { bookName, chapterUnit, dayLabel } from './homeFmt';
import { useWeekPlan, weekBoard } from './weekPlan';
import { resolveGalpiRule, useGalpiPrefs } from './galpiPrefs';
import { ShareSheet } from './share/ShareSheet';
import './homeShare.css';

/**
 * 노트 목록의 첫 화면 「한 주 다이어리」.
 *  - 이번 주 설교 카드(표지형): 이번 주 갈피(그 주의 중심 설교)가 있으면 그 설교, 없으면 최근 설교.
 *    그림은 장 번호만이 아니라 항상 「책 이름 + 장」을 가리킨다.
 *    카드의 다음 행동은 「공유」와 「나눈 곳」 줄 (홈에서는 갈피를 꽂고 빼지 않는다)
 *  - 한 주 동안(WeekPanel): 이번 주 할 일 판 — 설교의 「적용」 + 직접 적은 할 일(한 번 / 매일), 한 날에 ♥ 스티커
 *  - 이번 주 들은 예배(WeekServices): 이번 주 노트 카드 + 아직 안 쓴 예배 자리
 *  (모은 설교 스티커 = 스티커북은 「나의 갈피」 탭으로 옮김 — MyGalpi.tsx)
 */
interface SermonHomeProps {
  notes: SermonNote[];
  mascot: MascotId;
  onOpen: (id: string, aid?: string | null) => void;
  onNew: () => void;
  onToggleApply: (noteId: string, thoughtId: string) => void;
}

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

function verseRange(r: Ref): string {
  if (r.whole) return r.b === PSALMS ? '전체' : '장 전체';
  return r.v2 > r.v1 ? `${r.v1}–${r.v2}절` : `${r.v1}절`;
}

function fmtMin(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}

export function SermonHome({ notes, mascot, onOpen, onNew, onToggleApply }: SermonHomeProps) {
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

  // 「한 주 동안」: 이번 주(일~토) 노트의 적용 + 직접 적은 할 일 (weekPlan.ts)
  const { isGroupNote } = useNoteGroups();
  const dayStrs = useMemo(() => days.map(ymd), [days]);
  const weekNotes = useMemo(
    () =>
      notes
        .filter((n) => (n.date || '') >= dayStrs[0] && (n.date || '') <= dayStrs[6])
        .sort((a, b) => a.date.localeCompare(b.date) || a.created_at - b.created_at),
    [notes, dayStrs],
  );
  const [plan, setPlan] = useWeekPlan(weekStart);
  const board = useMemo(
    () => weekBoard(weekNotes, plan, dayStrs, today),
    [weekNotes, plan, dayStrs, today],
  );
  const [highlight, setHighlight] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="sn-home">
      <div className="sn-home-top">
        {hero && (
          <article className="sn-hc" data-galpi={!!weekGalpi}>
            <span className="sn-tape" style={{ left: 44, ['--r' as string]: '-7deg' }} />
            <span className="sn-tape sn-c1" style={{ right: 150, ['--r' as string]: '5deg' }} />
            <span className="sn-hc-peek">
              <Mascot
                kind={mascot}
                size={84}
                state={board.total && !board.left ? 'done' : 'idle'}
              />
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

        <WeekPanel
          days={dayStrs}
          today={today}
          board={board}
          setPlan={setPlan}
          notes={weekNotes}
          isGroupNote={isGroupNote}
          highlight={highlight}
          onOpen={onOpen}
          onToggleApply={onToggleApply}
        />
      </div>

      <WorshipSuggest notes={notes} />
      <WeekServices
        notes={weekNotes}
        days={dayStrs}
        weekStart={weekStart}
        galpi={galpi}
        isGroupNote={isGroupNote}
        highlight={highlight}
        onHighlight={setHighlight}
        onOpen={onOpen}
        onNew={onNew}
      />
    </div>
  );
}
