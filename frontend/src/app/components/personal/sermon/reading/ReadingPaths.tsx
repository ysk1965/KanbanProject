import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, Stamp } from 'lucide-react';
import { toast } from 'sonner';
import { SnOverlay } from '../SnOverlay';
import { SnSheetBar } from '../SnSheetBar';
import { todayString } from '../sermonTypes';
import { readingAPI, readingErrorMessage, type PlanDetail } from './readingApi';
import { nextDue, planOwnerName, plansDueFor, refreshMine, useMyPlans } from './readingStore';
import { chLabel, parseCh } from './readingPlan';
import { PlanView } from './PlanView';
import './reading.css';

/** 길 하나 시트 (PlanView) — 「오늘 읽을 곳」 카드·띠에서 길 이름을 누르면 */
export function PlanOverlay({
  id,
  onClose,
  onRead,
}: {
  id: string | null;
  onClose: () => void;
  onRead: (chapter: string) => void;
}) {
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  useEffect(() => {
    setPlan(null);
    if (!id) return;
    let live = true;
    readingAPI
      .get(id, todayString())
      .then((p) => live && setPlan(p))
      .catch((e) => {
        if (!live) return;
        toast.error(readingErrorMessage(e, '길을 불러오지 못했어요'));
        onClose();
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <SnOverlay
      open={!!id}
      onClose={onClose}
      className="sn-dialog sg-dialog rp-sheet"
      aria-label={plan ? plan.title : '통독 길'}
    >
      <div className="rp-sheet-body">
        {plan ? (
          <>
            <small className="rp-sheet-owner">{planOwnerName(plan)}</small>
            <PlanView plan={plan} onRead={onRead} onChange={setPlan} onEnded={onClose} />
          </>
        ) : (
          <div className="rp-empty">
            <Loader2 className="sn-icon animate-spin" aria-label="불러오는 중" />
          </div>
        )}
      </div>
      <SnSheetBar onClose={onClose} />
    </SnOverlay>
  );
}

/**
 * 장 끝 도장 — 이 장이 오늘(또는 밀려서) 읽을 곳인 길이 있을 때만 장 끝(바닥 내비 위)에 뜬다.
 * 장 끝까지 내려야 보이는 자리라 「끝까지 읽기」가 도장 조건이 된다.
 */
export function ReadingStamp({
  b,
  c,
  onGo,
}: {
  b: number;
  c: number;
  onGo: (b: number, c: number) => void;
}) {
  const plans = useMyPlans();
  const key = `${b}:${c}`;
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => setDone(null), [key]);

  if (!plans) return null;
  const due = plansDueFor(plans, key);
  const next = nextDue(plans, key);
  if (!due.length && done !== key) return null;

  const stamp = async () => {
    setBusy(true);
    try {
      const r = await readingAPI.stamp(key, todayString());
      const list = r.stamped || [];
      await refreshMine();
      if (list.length)
        toast.success(
          `${list.map((s) => `${s.group_name || '내 읽기표'} ${s.day_no}일째`).join(' · ')} 도장 찍었어요`,
        );
      // 이어서 읽을 장이 있으면 바로 넘긴다 — 없을 때만 「오늘 읽을 곳을 다 읽었어요」 카드를 남긴다
      const p = next ? parseCh(next) : null;
      if (p) onGo(p.b, p.c);
      else setDone(key);
    } catch (e) {
      toast.error(readingErrorMessage(e, '도장을 찍지 못했어요'));
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    const p = next ? parseCh(next) : null;
    if (p) onGo(p.b, p.c);
  };

  if (done === key) {
    return (
      <div className="rp-stamp" data-done>
        <span className="rp-stamp-seal" aria-hidden>
          <Stamp className="sn-icon" />
        </span>
        <span className="rp-stamp-txt">
          <b>{chLabel(key)} 도장 찍었어요</b>
          <small>{next ? '이어서 읽을 곳이 있어요' : '오늘 읽을 곳을 다 읽었어요'}</small>
        </span>
        {next && (
          <button type="button" className="sn-btn sn-ghost" onClick={goNext}>
            {chLabel(next)}
            <ChevronRight className="sn-icon" aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rp-stamp">
      <span className="rp-stamp-txt">
        <b>{chLabel(key)}을 다 읽었나요?</b>
        <small>{due.map((d) => `${planOwnerName(d.plan)} ${d.dayNo}일째`).join(' · ')}</small>
      </span>
      <button
        type="button"
        className="sn-btn sn-primary"
        disabled={busy}
        onClick={() => void stamp()}
      >
        {busy ? (
          <Loader2 className="sn-icon animate-spin" aria-hidden />
        ) : (
          <Stamp className="sn-icon" aria-hidden />
        )}
        다 읽었어요
      </button>
    </div>
  );
}
