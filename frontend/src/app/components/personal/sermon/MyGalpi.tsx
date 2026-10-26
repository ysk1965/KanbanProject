import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Mascot } from './Mascot';
import { useGalpiStickers } from './galpiPrefs';
import { GalpiSettingsRows } from './GalpiSettings';
import type { MascotId } from './sermonLook';
import type { SermonNote } from './sermonTypes';
import { Nametag } from './profile/Nametag';
import { PinnedNotes } from './profile/PinnedNotes';
import { ProfileSheet } from './profile/ProfileSheet';
import { useProfile } from './profile/ProfileContext';
import { booksHeard, weekStreak } from './profile/streak';
import './profile/profile.css';
import { ChallengeMeRows } from './challenge/ChallengeMeRows';
import { ChurchPicker } from './challenge/ChurchPicker';
import { useChallengeStore } from './challenge/challengeStore';
import { useChallengeUserId } from './challenge/challengeUtil';

/**
 * 「나의 갈피」 — 마이페이지. 기획: https://claude.ai/artifact/1pTWvwGGDy2aA1hYx6xnNA (1단계)
 * 위: 이름표(캐릭터·대표 말씀·소속 교회) / 가운데: 고정한 노트 폴라로이드 3장 / 아래: 챌린지 줄·메뉴
 * 소속 교회는 챌린지(user_churches)가 원본이라 고르기는 challenge/ChurchPicker 를 그대로 쓴다.
 */
export function MyGalpi({
  notes,
  mascot,
  name,
  anonymous,
  syncLine,
  onOpen,
  onLogin,
  onGoStickers,
}: {
  notes: SermonNote[];
  mascot: MascotId;
  name?: string;
  anonymous: boolean;
  syncLine: string;
  onOpen: (id: string) => void;
  onLogin?: () => void;
  onGoStickers: () => void;
}) {
  const profile = useProfile();
  const [editing, setEditing] = useState(false);
  const [churchOpen, setChurchOpen] = useState(false);
  // 소속 교회는 챌린지 교회가 원본 — 이름표에서도 같은 고르기 창을 연다
  const challenge = useChallengeStore(useChallengeUserId());
  const pickChurch = anonymous
    ? undefined
    : () => {
        setEditing(false);
        setChurchOpen(true);
      };
  const streak = useMemo(() => weekStreak(notes), [notes]);
  const stickerCount = useGalpiStickers(notes).size;
  const books = useMemo(() => booksHeard(notes), [notes]);

  if (!profile) return null;

  return (
    <div className="sn-me snp-me">
      <Nametag
        profile={profile}
        name={name}
        streak={streak}
        noteCount={notes.length}
        books={books}
        syncLine={syncLine}
        onEdit={() => setEditing(true)}
        onPickChurch={pickChurch}
        onLogin={onLogin}
      />

      <PinnedNotes profile={profile} notes={notes} mascot={mascot} onOpen={onOpen} />

      <ChallengeMeRows onLogin={onLogin} />

      <div className="sn-me-menu">
        <button type="button" onClick={() => setEditing(true)}>
          이름표 꾸미기
          <span>
            <Mascot kind={mascot} size={20} />
            <ChevronRight className="sn-icon" aria-hidden />
          </span>
        </button>
        <button type="button" onClick={onGoStickers}>
          모은 설교 스티커
          <span>
            {stickerCount}장 <ChevronRight className="sn-icon" aria-hidden />
          </span>
        </button>
        <GalpiSettingsRows notes={notes} />
        <div className="sn-me-row">
          기기·동기화
          <span>{anonymous ? '이 기기에만 저장' : syncLine}</span>
        </div>
      </div>

      <ProfileSheet
        open={editing}
        profile={profile}
        notes={notes}
        onPickChurch={pickChurch}
        onClose={() => setEditing(false)}
      />
      {!anonymous && (
        <ChurchPicker open={churchOpen} store={challenge} onClose={() => setChurchOpen(false)} />
      )}
    </div>
  );
}
