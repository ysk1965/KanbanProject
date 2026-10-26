import type { ReactNode } from 'react';
import { ANONYMOUS_USER } from '../sermonStore';
import type { SermonNote } from '../sermonTypes';
import { BooksGame } from './BooksGame';
import { PanelHead } from './ChallengeBits';
import { useChallengeUserId } from './challengeUtil';
import { ChallengeHome } from './ChallengeHome';
import { RainGame } from './RainGame';
import { RankingView } from './RankingView';

/** 챌린지 탭 본문의 보기 — 홈 · 랭킹 · 게임 둘 (주소가 아니라 상태로) */
export type ChallengeView = 'home' | 'ranking' | 'rain' | 'books';

export function ChallengeTab({
  view,
  onView,
  notes,
  anonymous,
  onLogin,
  applySection,
}: {
  view: ChallengeView;
  onView: (v: ChallengeView) => void;
  notes: SermonNote[];
  anonymous: boolean;
  onLogin?: () => void;
  /** 「이번 주 적용」 목록 (SermonList 가 그려서 넘긴다) */
  applySection?: ReactNode;
}) {
  const ctxUser = useChallengeUserId();
  // 모임 컨텍스트 밖이면 로그인 여부만 안다 — 그때는 게임을 연습 판으로
  const userId = anonymous ? ANONYMOUS_USER : ctxUser;
  const anon = anonymous || userId === ANONYMOUS_USER;
  const home = () => onView('home');

  if (view === 'rain')
    return (
      <RainGame notes={notes} userId={userId} anonymous={anon} onBack={home} onLogin={onLogin} />
    );
  if (view === 'books')
    return <BooksGame userId={userId} anonymous={anon} onBack={home} onLogin={onLogin} />;
  if (view === 'ranking')
    return (
      <div className="sn-ch-home">
        <PanelHead title="랭킹" onBack={home} />
        <RankingView userId={userId} anonymous={anon} onLogin={onLogin} />
      </div>
    );
  return (
    <ChallengeHome
      notes={notes}
      userId={userId}
      anonymous={anon}
      onLogin={onLogin}
      onPlay={onView}
      onRanking={() => onView('ranking')}
      applySection={applySection}
    />
  );
}
