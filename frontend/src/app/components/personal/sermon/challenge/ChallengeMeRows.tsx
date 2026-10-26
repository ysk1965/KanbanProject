import { useState } from 'react';
import { ChevronRight, LogIn } from 'lucide-react';
import { Coin } from './ChallengeBits';
import { num, useChallengeUserId, rankName } from './challengeUtil';
import { useChallengeStore } from './challengeStore';
import { ChurchPicker } from './ChurchPicker';
import { NicknameSheet } from './NicknameSheet';
import { ExchangeSheet, LedgerSheet } from './TalentSheets';

/**
 * 나의 갈피 › 챌린지 줄 — 랭킹 닉네임 · 소속 교회 · 달란트(내역) · 리워드 크레딧 교환.
 * 로그인 전이면 한 줄 안내만.
 */
export function ChallengeMeRows({ onLogin }: { onLogin?: () => void }) {
  const userId = useChallengeUserId();
  const store = useChallengeStore(userId);
  const [open, setOpen] = useState<null | 'nick' | 'church' | 'ledger' | 'exchange'>(null);
  const close = () => setOpen(null);

  if (store.anonymous) {
    return (
      <div className="sn-me-menu" aria-label="챌린지">
        <button type="button" onClick={onLogin} disabled={!onLogin}>
          달란트 · 랭킹
          <span>
            로그인하면 모을 수 있어요 <LogIn className="sn-icon" aria-hidden />
          </span>
        </button>
      </div>
    );
  }

  const p = store.profile;
  const w = store.wallet;
  const soon = !store.loaded && store.unavailable;
  const right = (text: string) => (
    <span>
      {text} <ChevronRight className="sn-icon" aria-hidden />
    </span>
  );

  return (
    <>
      <div className="sn-me-menu" aria-label="챌린지">
        <button type="button" onClick={() => setOpen('nick')}>
          랭킹 닉네임
          {right(
            p?.nickname ? rankName(p.nickname, p.tag) + (p.anonymous ? ' · 익명' : '') : '정하기',
          )}
        </button>
        <button type="button" onClick={() => setOpen('church')}>
          소속 교회
          {right(p?.church ? [p.church.name, p.church.dept].filter(Boolean).join(' · ') : '정하기')}
        </button>
        <button type="button" onClick={() => setOpen('ledger')}>
          달란트
          <span>
            {soon ? (
              '아직 준비 중'
            ) : (
              <>
                <Coin size={16} />
                {num(w?.balance)}
              </>
            )}
            <ChevronRight className="sn-icon" aria-hidden />
          </span>
        </button>
        <button type="button" onClick={() => setOpen('exchange')}>
          리워드 크레딧 교환
          {right(
            soon
              ? '아직 준비 중'
              : `${num(w?.reward_credits)}개 · ${w?.exchange_rate || 50}달란트 = 1`,
          )}
        </button>
      </div>
      <NicknameSheet open={open === 'nick'} store={store} onClose={close} />
      <ChurchPicker open={open === 'church'} store={store} onClose={close} />
      <LedgerSheet open={open === 'ledger'} store={store} onClose={close} />
      <ExchangeSheet open={open === 'exchange'} store={store} onClose={close} />
    </>
  );
}
