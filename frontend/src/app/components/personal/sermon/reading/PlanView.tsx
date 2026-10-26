import { useState } from 'react';
import { BookOpen, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Faces } from '../group/Faces';
import { todayString } from '../sermonTypes';
import { readingAPI, readingErrorMessage, type PlanDay, type PlanDetail } from './readingApi';
import { refreshMine } from './readingStore';
import { BookMap } from './BookMap';
import { TeamRows } from './TeamRows';
import { chaptersLabel, md, mdDow, withYear } from './readingPlan';
import './reading.css';

/**
 * 길 하나 — 오늘 카드 · (모임) 읽음/아직 얼굴 · 밀린 날 · 함께 걸은 길(책 지도 + 모임은 사람마다) · 끝내기.
 * 모임 통독 탭과 「읽는 중인 길」 시트가 같이 쓴다.
 */
interface Props {
  plan: PlanDetail;
  onRead: (chapter: string) => void;
  onChange: (plan: PlanDetail) => void;
  onEnded: () => void;
}

const mine = (d: PlanDay) => d.my_chapters || [];
const myDone = (d: PlanDay) => mine(d).length >= d.chapters.length;
const firstUnread = (d: PlanDay) => d.chapters.find((k) => !mine(d).includes(k)) || d.chapters[0];

export function PlanView({ plan, onRead, onChange, onEnded }: Props) {
  const today = todayString();
  const [busy, setBusy] = useState<number | null>(null);
  const [askEnd, setAskEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const isGroup = !!plan.group_id;
  const todayDay = plan.days.find((d) => d.day_no === plan.today_day_no);
  const missed = plan.days.filter((d) => d.date < today && !myDone(d));
  const pctRaw = plan.team_total ? (plan.team_done / plan.team_total) * 100 : 0;
  // 1,189장 길에선 정수 %가 며칠씩 0에 머문다 — 10% 미만은 소수 한 자리
  const pct = pctRaw > 0 && pctRaw < 10 ? pctRaw.toFixed(1) : String(Math.round(pctRaw));
  const rows = isGroup && !!plan.members?.length;
  const read = plan.today?.read || [];
  const unread = plan.today?.unread || [];

  const toggleDay = async (d: PlanDay) => {
    if (busy !== null) return;
    setBusy(d.day_no);
    try {
      onChange(await readingAPI.checkDay(plan.id, d.day_no, !myDone(d), today));
      void refreshMine();
    } catch (e) {
      toast.error(readingErrorMessage(e, '도장을 찍지 못했어요'));
    } finally {
      setBusy(null);
    }
  };

  const end = async () => {
    setEnding(true);
    try {
      await readingAPI.end(plan.id);
      void refreshMine();
      toast.success('길을 끝냈어요. 기록은 남아 있어요');
      onEnded();
    } catch (e) {
      toast.error(readingErrorMessage(e, '끝내지 못했어요'));
      setEnding(false);
    }
  };

  const restLine =
    today < plan.start_date
      ? `${mdDow(plan.start_date)}에 시작해요`
      : today > plan.end_date
        ? '길을 다 걸었어요'
        : '오늘은 쉼표예요. 밀린 날이 있으면 오늘 따라 읽어도 좋아요';

  return (
    <div className="rp-view">
      <div className="rp-head">
        <h3>{plan.title}</h3>
        <span>
          {md(plan.start_date)} – {withYear(plan.end_date, plan.start_date)} · {plan.total_days}일
        </span>
      </div>

      {todayDay ? (
        <div className="rp-today" data-done={myDone(todayDay) || undefined}>
          <div className="rp-today-n">
            {todayDay.day_no}
            <small>일째</small>
          </div>
          <div className="rp-today-in">
            <small>오늘 읽을 곳 · {mdDow(todayDay.date)}</small>
            <b>{chaptersLabel(todayDay.chapters)}</b>
          </div>
          <div className="rp-today-act">
            <button
              type="button"
              className="sn-btn sn-primary"
              onClick={() => onRead(firstUnread(todayDay))}
            >
              <BookOpen className="sn-icon" aria-hidden />
              {myDone(todayDay) ? '다시 읽기' : '읽으러 가기'}
            </button>
            <button
              type="button"
              className="rp-manual"
              aria-pressed={myDone(todayDay)}
              disabled={busy !== null}
              onClick={() => void toggleDay(todayDay)}
              title="종이 성경이나 다른 곳에서 읽었다면"
            >
              {busy === todayDay.day_no ? (
                <Loader2 className="sn-icon animate-spin" aria-hidden />
              ) : (
                myDone(todayDay) && <Check className="sn-icon" aria-hidden />
              )}
              {myDone(todayDay) ? '오늘 도장 찍음' : '따로 읽었어요'}
            </button>
          </div>
        </div>
      ) : (
        <p className="rp-rest">{restLine}</p>
      )}

      {isGroup && todayDay && (
        <div className="rp-who">
          {read.length > 0 && (
            <>
              <Faces people={read} max={8} size={26} />
              <span>읽음 {read.length}</span>
            </>
          )}
          {unread.length > 0 ? (
            <>
              <Faces people={unread.map((p) => ({ ...p, off: true }))} max={8} size={26} />
              <span>아직 {unread.length}</span>
            </>
          ) : (
            <span className="rp-all">오늘 모두 읽었어요</span>
          )}
        </div>
      )}

      {missed.length > 0 && (
        <div className="rp-missed">
          <span className="rp-lb">밀린 날 {missed.length}</span>
          <div className="rp-missed-list">
            {missed.slice(0, 6).map((d) => (
              <button key={d.day_no} type="button" onClick={() => onRead(firstUnread(d))}>
                {d.day_no}일째 · {chaptersLabel(d.chapters, true)}
              </button>
            ))}
            {missed.length > 6 && <span>+{missed.length - 6}</span>}
          </div>
        </div>
      )}

      <div className="rp-trail-box">
        <div className="rp-trail-top">
          <b>{isGroup ? `${plan.group_name || '모임'}이 함께 걸은 길` : '내가 걸은 길'}</b>
          <span>
            <em>{pct}%</em>
            {isGroup
              ? ` · ${plan.member_count}명 · ${plan.team_done.toLocaleString()}/${plan.team_total.toLocaleString()}장`
              : ''}
          </span>
        </div>
        <BookMap plan={plan} today={today} onRead={onRead} />
        {rows && (
          <div className="rp-team-box">
            <span className="rp-lb">사람마다</span>
            <TeamRows plan={plan} today={today} />
          </div>
        )}
      </div>

      {plan.can_manage && (
        <div className="rp-manage">
          {askEnd ? (
            <>
              <span>길을 끝낼까요? 지금까지 기록은 남아요.</span>
              <button type="button" className="sn-btn sn-ghost" onClick={() => setAskEnd(false)}>
                그대로 두기
              </button>
              <button
                type="button"
                className="sn-btn rp-danger"
                disabled={ending}
                onClick={() => void end()}
              >
                {ending && <Loader2 className="sn-icon animate-spin" aria-hidden />}
                끝내기
              </button>
            </>
          ) : (
            <button type="button" className="rp-link" onClick={() => setAskEnd(true)}>
              길 끝내기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
