import { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { formatDate } from '../../../../utils/dateUtils';
import { SnOverlay } from '../SnOverlay';
import {
  challengeAPI,
  challengeErrorMessage,
  isUnavailable,
  type LedgerItem,
} from './challengeApi';
import { Coin } from './ChallengeBits';
import { num } from './challengeUtil';
import type { ChallengeStore } from './challengeStore';

/** 원장 사유 → 사람이 읽는 말 (서버 label 이 없을 때) */
const REASON: Record<string, string> = {
  note: '설교 기록',
  note_audio: '녹음과 함께 기록',
  apply: '적용 남기기',
  apply_done: '적용 실천',
  galpi: '갈피 꽂기',
  week_complete: '한 주 완주',
  streak: '연속 기록 보너스',
  game: '게임',
  game_first: '오늘 첫 게임',
  exchange: '리워드 크레딧 교환',
};

/** 달란트 내역 — 30개씩, 「더 보기」로 이어서 */
export function LedgerSheet({
  open,
  store,
  onClose,
}: {
  open: boolean;
  store: ChallengeStore;
  onClose: () => void;
}) {
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'soon' | 'error'>('loading');

  const load = (before: string | null) => {
    setState('loading');
    challengeAPI
      .ledger(before)
      .then((r) => {
        setItems((xs) => (before ? [...xs, ...(r?.items || [])] : r?.items || []));
        setNext(r?.next_before ?? null);
        setState('ok');
      })
      .catch((e) => setState(isUnavailable(e) ? 'soon' : 'error'));
  };

  useEffect(() => {
    if (open) load(null);
  }, [open]);

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sn-modal sn-ch-sheet sn-ch-ledger"
      aria-labelledby="sn-ch-led-h"
    >
      <div className="sn-ch-sheet-h">
        <h2 id="sn-ch-led-h">
          <Coin size={20} /> 달란트 {num(store.wallet?.balance)}
        </h2>
        <button
          type="button"
          className="sn-btn sn-ghost sn-icon-only"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="sn-icon" aria-hidden />
        </button>
      </div>
      <div className="sn-ch-ledger-list">
        {items.map((it) => (
          <div key={it.id} className="sn-ch-led-row">
            <span>
              {it.label || REASON[it.reason] || it.reason}
              <small>{formatDate(it.created_at, 'M월 d일 HH:mm')}</small>
            </span>
            <b className="sn-mono" data-neg={it.amount < 0}>
              {it.amount > 0 ? '+' : ''}
              {num(it.amount)}
            </b>
          </div>
        ))}
        {state === 'ok' && !items.length && (
          <p className="sn-ch-faint">아직 받은 달란트가 없어요.</p>
        )}
        {state === 'soon' && <p className="sn-ch-faint">달란트 내역은 아직 준비 중이에요.</p>}
        {state === 'error' && <p className="sn-ch-warn">내역을 불러오지 못했어요.</p>}
        {state === 'loading' && <p className="sn-ch-faint">불러오는 중…</p>}
        {state === 'ok' && next && (
          <button type="button" className="sn-btn" onClick={() => load(next)}>
            더 보기
          </button>
        )}
      </div>
    </SnOverlay>
  );
}

/** 달란트 → 리워드 크레딧 교환 (50 : 1, 한 달 20개, 다음 달 말 만료) */
export function ExchangeSheet({
  open,
  store,
  onClose,
}: {
  open: boolean;
  store: ChallengeStore;
  onClose: () => void;
}) {
  const w = store.wallet;
  const rate = w?.exchange_rate || 50;
  const cap = w?.exchange_monthly_cap ?? 20;
  const used = w?.exchanged_this_month ?? 0;
  const max = Math.max(0, Math.min(cap - used, Math.floor((w?.balance ?? 0) / rate)));
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      setN(1);
      setMsg(null);
    }
  }, [open]);

  const go = async () => {
    if (busy || n < 1 || n > max) return;
    setBusy(true);
    setMsg(null);
    try {
      store.setWallet(await challengeAPI.exchange(n));
      setMsg({ ok: true, text: `리워드 크레딧 ${n}개로 바꿨어요.` });
      setN(1);
    } catch (e) {
      setMsg({
        ok: false,
        text: isUnavailable(e) ? '교환은 아직 준비 중이에요.' : challengeErrorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sn-modal sn-ch-sheet"
      aria-labelledby="sn-ch-ex-h"
    >
      <div className="sn-ch-sheet-h">
        <h2 id="sn-ch-ex-h">리워드 크레딧 교환</h2>
        <button
          type="button"
          className="sn-btn sn-ghost sn-icon-only"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="sn-icon" aria-hidden />
        </button>
      </div>
      <p>
        {rate}달란트 = 리워드 크레딧 1개. AI 문장 정리처럼 크레딧이 드는 기능에 먼저 쓰여요 (월 무료
        → 리워드 → 구매 순서).
      </p>
      <div className="sn-ch-exstat">
        <div>
          <b className="sn-mono">{num(w?.balance)}</b>달란트
        </div>
        <div>
          <b className="sn-mono">{num(w?.reward_credits)}</b>리워드 크레딧
        </div>
        <div>
          <b className="sn-mono">
            {used}/{cap}
          </b>
          이번 달 교환
        </div>
      </div>
      {w?.reward_expires_at && (w.reward_credits ?? 0) > 0 && (
        <p className="sn-ch-hint">
          리워드 크레딧은 {formatDate(w.reward_expires_at, 'M월 d일')}에 사라져요.
        </p>
      )}
      <div className="sn-ch-stepper" role="group" aria-label="바꿀 크레딧 수">
        <button
          type="button"
          className="sn-btn sn-icon-only"
          aria-label="하나 줄이기"
          disabled={n <= 1}
          onClick={() => setN((x) => Math.max(1, x - 1))}
        >
          <Minus className="sn-icon" aria-hidden />
        </button>
        <span className="sn-mono" aria-live="polite">
          <b>{n}</b>크레딧 · {num(n * rate)}달란트
        </span>
        <button
          type="button"
          className="sn-btn sn-icon-only"
          aria-label="하나 늘리기"
          disabled={n >= max}
          onClick={() => setN((x) => Math.min(max, x + 1))}
        >
          <Plus className="sn-icon" aria-hidden />
        </button>
      </div>
      {max < 1 && (
        <p className="sn-ch-hint">
          {used >= cap ? '이번 달 교환 한도를 다 썼어요.' : `${rate}달란트부터 바꿀 수 있어요.`}
        </p>
      )}
      {msg && <p className={msg.ok ? 'sn-ch-okmsg' : 'sn-ch-warn'}>{msg.text}</p>}
      <div className="sn-acts">
        <button type="button" className="sn-btn sn-ghost" onClick={onClose}>
          닫기
        </button>
        <button type="button" className="sn-btn sn-primary" disabled={busy || max < 1} onClick={go}>
          {busy ? '바꾸는 중…' : '바꾸기'}
        </button>
      </div>
    </SnOverlay>
  );
}
