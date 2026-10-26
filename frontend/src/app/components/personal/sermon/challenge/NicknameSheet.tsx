import { useEffect, useState } from 'react';
import { SnOverlay } from '../SnOverlay';
import { SnSheetBar } from '../SnSheetBar';
import { challengeAPI, challengeErrorMessage } from './challengeApi';
import type { ChallengeStore } from './challengeStore';
import { validNickname, rankName } from './challengeUtil';

/**
 * 랭킹 이름 정하기 — 닉네임(2~12자) + 익명 켜기. 처음 정하면 서버가 #네 자리를 붙여 준다.
 */
export function NicknameSheet({
  open,
  store,
  onClose,
  first = false,
}: {
  open: boolean;
  store: ChallengeStore;
  onClose: () => void;
  /** 랭킹을 처음 열어서 묻는 경우 (건너뛰기 문구) */
  first?: boolean;
}) {
  const p = store.profile;
  const [nick, setNick] = useState(p?.nickname || '');
  const [anon, setAnon] = useState(!!p?.anonymous);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNick(store.profile?.nickname || '');
    setAnon(!!store.profile?.anonymous);
    setErr('');
    setSaved(false);
  }, [open, store]);

  const trimmed = nick.trim();
  const ok = validNickname(trimmed);

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr('');
    try {
      const res = await challengeAPI.putProfile({ nickname: trimmed, anonymous: anon });
      store.setProfile(res);
      setSaved(true);
    } catch (e) {
      setErr(challengeErrorMessage(e, '아직 저장할 수 없어요. 잠시 후 다시 해 주세요.'));
    } finally {
      setBusy(false);
    }
  };

  const shown = store.profile;

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sn-modal sn-ch-sheet"
      aria-labelledby="sn-ch-prof-h"
    >
      <div className="sn-ch-sheet-h">
        <h2 id="sn-ch-prof-h">랭킹에 보일 이름</h2>
      </div>
      {saved && shown?.nickname ? (
        <>
          <p>
            이제 랭킹에 <b className="sn-ch-name">{rankName(shown.nickname, shown.tag)}</b>
            {shown.anonymous ? ` 대신 「${shown.anon_name || '익명의 양'}」` : ''}(으)로 보여요.
          </p>
          <p className="sn-ch-hint">같은 닉네임이 있어도 뒤의 #숫자로 구분돼요.</p>
          <SnSheetBar onClose={onClose} />
        </>
      ) : (
        <>
          <p>2~12자 한글·영문·숫자로 정해 주세요. 나의 갈피에서 언제든 바꿀 수 있어요.</p>
          <label className="sn-ch-field">
            <span>닉네임</span>
            <input
              value={nick}
              maxLength={20}
              placeholder="예: 새벽별"
              onChange={(e) => setNick(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void save();
              }}
              aria-invalid={!!trimmed && !ok}
            />
          </label>
          {!!trimmed && !ok && (
            <p className="sn-ch-warn">2~12자 한글·영문·숫자·공백·_ 만 쓸 수 있어요</p>
          )}
          <label className="sn-ch-switch">
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
            <span>
              익명으로 보이기
              <small>랭킹에는 「{p?.anon_name || '익명의 양 #000'}」처럼 보여요</small>
            </span>
          </label>
          {err && <p className="sn-ch-warn">{err}</p>}
          <SnSheetBar onClose={onClose} closeLabel={first ? '나중에' : '닫기'}>
            <button
              type="button"
              className="sn-btn sn-primary"
              disabled={!ok || busy}
              onClick={save}
            >
              {busy ? '저장 중…' : '저장'}
            </button>
          </SnSheetBar>
        </>
      )}
    </SnOverlay>
  );
}
