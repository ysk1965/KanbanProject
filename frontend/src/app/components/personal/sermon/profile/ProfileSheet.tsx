import { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { SnOverlay } from '../SnOverlay';
import { SnSheetBar } from '../SnSheetBar';
import { VersePicker } from '../VersePicker';
import { decRef, encRef, refLong, refShort, type Ref } from '../bibleRefs';
import { Mascot } from '../Mascot';
import { INKS, MASCOTS } from '../sermonLook';
import type { SermonNote } from '../sermonTypes';
import { useBible, verses } from '../useBible';
import { useChallengeStore } from '../challenge/challengeStore';
import { useChallengeUserId } from '../challenge/challengeUtil';
import { clampVerse, MASCOT_STATES, verseSuggestions, VISIBILITIES } from './profileModel';
import type { SermonProfileState } from './useSermonProfile';

/** 「이름표 꾸미기」 — 캐릭터·표정·색, 대표 말씀, 소속 교회(챌린지 교회 창으로), 공개 범위. 고치는 즉시 반영된다 */
export function ProfileSheet({
  open,
  profile,
  notes,
  onPickChurch,
  onClose,
}: {
  open: boolean;
  profile: SermonProfileState;
  notes: SermonNote[];
  /** 챌린지 교회 고르기 창 열기 */
  onPickChurch?: () => void;
  onClose: () => void;
}) {
  useBible();
  const challenge = useChallengeStore(useChallengeUserId());
  const { data, update, anonymous } = profile;
  const [picking, setPicking] = useState(false);
  const ref = decRef(data.verse_ref);
  const suggestions = useMemo(() => verseSuggestions(notes), [notes]);
  const church = anonymous ? null : challenge.profile?.church;

  const setVerse = (r: Ref) => {
    const { ref: v, clamped } = clampVerse(r);
    update({ verse_ref: encRef(v) });
    if (clamped) toast(`대표 말씀은 세 절까지라 ${refShort(v)}만 넣었어요`);
  };
  const preview = ref ? (verses(ref) || []).map(([, t]) => t).join(' ') : '';

  return (
    <>
      <SnOverlay
        open={open && !picking}
        onClose={onClose}
        className="snp-sheet snp-prof"
        aria-labelledby="snp-prof-title"
      >
        <div className="snp-shead">
          <h2 id="snp-prof-title">이름표 꾸미기</h2>
        </div>
        <div className="snp-sbody">
          <div className="snp-label">프로필 캐릭터</div>
          <div className="snp-opts" role="radiogroup" aria-label="캐릭터">
            {MASCOTS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={data.mascot === m.id}
                className="snp-mopt"
                onClick={() => update({ mascot: m.id })}
              >
                <Mascot
                  kind={m.id}
                  size={48}
                  state={data.mascot === m.id ? data.mascot_state : 'idle'}
                />
                <b>{m.name}</b>
              </button>
            ))}
          </div>
          <div className="snp-label">표정</div>
          <div className="snp-opts" role="radiogroup" aria-label="표정">
            {MASCOT_STATES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={data.mascot_state === s.id}
                className="snp-chip"
                onClick={() => update({ mascot_state: s.id })}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div className="snp-label">색</div>
          <div className="snp-opts" role="radiogroup" aria-label="색 조합">
            {INKS.map((i) => (
              <button
                key={i.id}
                type="button"
                role="radio"
                aria-checked={data.ink === i.id}
                aria-label={i.name}
                title={i.name}
                className="snp-sw"
                style={{ background: `linear-gradient(135deg, ${i.sw[0]} 50%, ${i.sw[1]} 50%)` }}
                onClick={() => update({ ink: i.id })}
              />
            ))}
          </div>

          <div className="snp-label">대표 말씀 · 세 절까지</div>
          {ref ? (
            <div className="snp-verse-pick" data-style={data.verse_style}>
              <p>{preview || refLong(ref)}</p>
              <b>{refLong(ref)}</b>
            </div>
          ) : (
            <p className="snp-hint">아직 고르지 않았어요.</p>
          )}
          <div className="snp-row">
            <button type="button" className="snp-btn" onClick={() => setPicking(true)}>
              <BookOpen className="sn-icon" aria-hidden />
              구절 찾기
            </button>
            {ref && (
              <button
                type="button"
                className="snp-btn snp-ghost"
                onClick={() => update({ verse_ref: null })}
              >
                비우기
              </button>
            )}
          </div>
          {suggestions.length > 0 && (
            <>
              <div className="snp-sub">내 노트에서</div>
              <div className="snp-opts">
                {suggestions.map((r) => (
                  <button
                    key={encRef(r)}
                    type="button"
                    className="snp-chip snp-chip-soft"
                    aria-pressed={data.verse_ref === encRef(r)}
                    onClick={() => setVerse(r)}
                  >
                    {refShort(r)}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="snp-sub">글씨</div>
          <div className="snp-opts" role="radiogroup" aria-label="말씀 글씨">
            {(
              [
                ['serif', '명조'],
                ['hand', '손글씨'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={data.verse_style === k}
                className={`snp-chip ${k === 'hand' ? 'snp-hand' : 'snp-serif'}`}
                onClick={() => update({ verse_style: k })}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="snp-label">소속 교회</div>
          {anonymous ? (
            <p className="snp-hint">로그인하면 소속 교회를 정할 수 있어요.</p>
          ) : (
            <div className="snp-row">
              <span className="snp-church">
                {church
                  ? [church.name, church.dept].filter(Boolean).join(' · ')
                  : '아직 정하지 않았어요'}
              </span>
              {onPickChurch && (
                <button type="button" className="snp-btn" onClick={onPickChurch}>
                  {church ? '바꾸기' : '교회 고르기'}
                </button>
              )}
            </div>
          )}
          {!anonymous && (
            <p className="snp-hint">
              챌린지 교회 랭킹과 같은 교회예요. 바꾸기는 30일에 한 번 할 수 있어요.
            </p>
          )}

          {!anonymous && (
            <>
              <div className="snp-label">이름표를 볼 수 있는 사람</div>
              <div className="snp-opts snp-vis" role="radiogroup" aria-label="공개 범위">
                {VISIBILITIES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={data.visibility === v.id}
                    className="snp-chip snp-chip-2"
                    onClick={() => update({ visibility: v.id })}
                  >
                    <b>{v.name}</b>
                    <span>{v.desc}</span>
                  </button>
                ))}
              </div>
              <p className="snp-hint">고정한 노트는 나에게만 보여요.</p>
            </>
          )}
          <p className="snp-hint">
            {anonymous
              ? '로그인 전이라 이 기기에만 저장돼요.'
              : profile.pending
                ? '저장하는 중…'
                : '저장했어요.'}
          </p>
        </div>
        <SnSheetBar onClose={onClose} />
      </SnOverlay>
      <VersePicker
        open={picking}
        target="meta"
        recent={suggestions}
        onClose={() => setPicking(false)}
        onInsert={(r) => {
          setVerse(r);
          setPicking(false);
        }}
      />
    </>
  );
}
