import { LogIn, Pencil, Plus } from 'lucide-react';
import { parseUTCDate } from '../../../../utils/dateUtils';
import { decRef, refLong } from '../bibleRefs';
import { Mascot } from '../Mascot';
import { useBible, verses } from '../useBible';
import type { SermonProfileState } from './useSermonProfile';
import { useChallengeStore } from '../challenge/challengeStore';
import { useChallengeUserId } from '../challenge/challengeUtil';

/**
 * 이름표 — 잉크 띠(망점) 위에 캐릭터 얼굴, 이름, 소속 교회·공동체, 대표 말씀, 기록 숫자.
 * 이름표 전체가 「이름표 꾸미기」로 들어가는 문이다(연필 버튼 + 빈 자리 버튼).
 */
export function Nametag({
  profile,
  name,
  streak,
  noteCount,
  books,
  syncLine,
  onEdit,
  onPickChurch,
  onLogin,
}: {
  profile: SermonProfileState;
  name?: string;
  streak: number;
  noteCount: number;
  books: number;
  syncLine: string;
  onEdit: () => void;
  /** 소속 교회 고르기 — 챌린지 교회(랭킹과 같은 값). 로그인 전이면 없음 */
  onPickChurch?: () => void;
  onLogin?: () => void;
}) {
  useBible();
  const challenge = useChallengeStore(useChallengeUserId());
  const { data, history, verseCount, anonymous } = profile;
  const ref = decRef(data.verse_ref);
  const text = ref ? (verses(ref) || []).map(([, t]) => t).join(' ') : '';
  const since = history.find((h) => !h.to_at && h.verse_ref === data.verse_ref)?.from_at;
  const sinceDate = since ? parseUTCDate(since) : null;
  const church = anonymous ? null : challenge.profile?.church;
  const where = church ? [church.name, church.dept].filter(Boolean).join(' · ') : '';

  return (
    <section className="snp-tag" aria-label="내 이름표">
      <div className="snp-tag-band" aria-hidden />
      <div className="snp-tag-row">
        <span className="snp-av">
          <Mascot kind={data.mascot} state={data.mascot_state} size={60} />
          {streak > 0 && <span className="snp-av-badge">{streak}주</span>}
        </span>
        <div className="snp-who">
          <b>{name || '나'}</b>
          {where ? (
            <span>{where}</span>
          ) : (
            onPickChurch && (
              <button type="button" className="snp-link" onClick={onPickChurch}>
                <Plus className="sn-icon" aria-hidden />
                소속 교회 정하기
              </button>
            )
          )}
        </div>
        <button type="button" className="snp-edit" onClick={onEdit} aria-label="이름표 꾸미기">
          <Pencil className="sn-icon" aria-hidden />
          <span className="snp-hide-sm">꾸미기</span>
        </button>
      </div>

      {ref ? (
        <figure className="snp-verse" data-style={data.verse_style}>
          <blockquote>{text || refLong(ref)}</blockquote>
          <figcaption>
            <b>{refLong(ref)}</b>
            {(verseCount ?? 0) > 1 || sinceDate ? (
              <span>
                {[
                  verseCount && verseCount > 1 ? `${verseCount}번째 대표 말씀` : '',
                  sinceDate ? `${sinceDate.getFullYear()}년 ${sinceDate.getMonth() + 1}월부터` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
          </figcaption>
        </figure>
      ) : (
        <button type="button" className="snp-verse snp-verse-empty" onClick={onEdit}>
          <Plus className="sn-icon" aria-hidden />
          나를 붙드는 대표 말씀을 골라 보세요
        </button>
      )}

      <div className="snp-stats" role="list">
        <div role="listitem">
          <b>{streak}주</b>이어 쓰기
        </div>
        <div role="listitem">
          <b>{noteCount}</b>설교 노트
        </div>
        <div role="listitem">
          <b>{books}권</b>들은 말씀
        </div>
      </div>

      <div className="snp-tag-foot">
        <span>{anonymous ? '로그인 전 · 이 기기에만 저장돼요' : syncLine}</span>
        {anonymous && onLogin && (
          <button type="button" className="snp-btn snp-primary" onClick={onLogin}>
            <LogIn className="sn-icon" aria-hidden />
            로그인
          </button>
        )}
      </div>
    </section>
  );
}
