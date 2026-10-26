import { useEffect, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { formatDate } from '../../../../utils/dateUtils';
import { SnOverlay } from '../SnOverlay';
import { SnSheetBar } from '../SnSheetBar';
import {
  challengeAPI,
  challengeErrorCode,
  challengeErrorMessage,
  isUnavailable,
  type Church,
} from './challengeApi';
import type { ChallengeStore } from './challengeStore';
import { num } from './challengeUtil';

/**
 * 소속 교회 고르기 — 이름 검색(디바운스) → 고르고 부서(선택) → 정하기.
 * 목록에 없으면 이름 + 지역으로 직접 등록 (같은 교회가 있으면 서버가 그 교회를 돌려준다).
 * 바꾸기·빼기는 30일에 한 번 (CH005).
 */
export function ChurchPicker({
  open,
  store,
  onClose,
}: {
  open: boolean;
  store: ChallengeStore;
  onClose: () => void;
}) {
  const mine = store.profile?.church;
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Church[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');
  const [picked, setPicked] = useState<Church | null>(null);
  const [dept, setDept] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRegion, setNewRegion] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setQ('');
    setItems([]);
    setPicked(null);
    setDept(store.profile?.church?.dept || '');
    setAdding(false);
    setErr('');
    setSearchErr('');
  }, [open, store]);

  // 검색 — 0.3초 쉬면
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 1) {
      setItems([]);
      setSearching(false);
      return;
    }
    let alive = true;
    setSearching(true);
    const id = window.setTimeout(() => {
      challengeAPI
        .churches(term)
        .then((r) => {
          if (!alive) return;
          setItems(r?.items || []);
          setSearchErr('');
        })
        .catch((e) => {
          if (!alive) return;
          setItems([]);
          setSearchErr(
            isUnavailable(e) ? '교회 찾기는 아직 준비 중이에요' : challengeErrorMessage(e),
          );
        })
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [q, open]);

  const lockedUntil =
    mine?.can_change_at && Date.parse(mine.can_change_at) > Date.now() ? mine.can_change_at : null;

  const fail = (e: unknown) => {
    const code = challengeErrorCode(e);
    if (code === 'CH005') {
      const at = (e as { message?: string })?.message?.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/)?.[0];
      const when = at || lockedUntil;
      setErr(
        when
          ? `소속 교회는 30일에 한 번 바꿀 수 있어요 · ${formatDate(when, 'M월 d일')}부터 바꿀 수 있어요`
          : challengeErrorMessage(e),
      );
    } else setErr(challengeErrorMessage(e, '아직 저장할 수 없어요. 잠시 후 다시 해 주세요.'));
  };

  const confirm = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setErr('');
    try {
      const res = await challengeAPI.setChurch({ church_id: picked.id, dept: dept.trim() || null });
      store.setProfile(res);
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    const name = newName.trim();
    const region = newRegion.trim();
    if (name.length < 2 || region.length < 2 || busy) return;
    setBusy(true);
    setErr('');
    try {
      const c = await challengeAPI.createChurch({ name, region, address: null });
      if (c?.id) {
        setPicked(c);
        setItems((xs) => (xs.some((x) => x.id === c.id) ? xs : [c, ...xs]));
        setAdding(false);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      store.setProfile(await challengeAPI.leaveChurch());
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sn-modal sn-ch-sheet sn-ch-church"
      aria-labelledby="sn-ch-church-h"
    >
      <div className="sn-ch-sheet-h">
        <h2 id="sn-ch-church-h">소속 교회</h2>
      </div>
      {mine && (
        <div className="sn-ch-mine">
          <b>{mine.name}</b>
          <span>{[mine.region, mine.dept].filter(Boolean).join(' · ')}</span>
          {lockedUntil && (
            <span className="sn-ch-faint">
              {formatDate(lockedUntil, 'M월 d일')}부터 바꿀 수 있어요
            </span>
          )}
          {!adding && (
            <button
              type="button"
              className="sn-btn sn-ghost sn-ch-leave"
              onClick={leave}
              disabled={busy}
            >
              소속 빼기
            </button>
          )}
        </div>
      )}
      {adding ? (
        <div className="sn-ch-form">
          <label className="sn-ch-field">
            <span>교회 이름</span>
            <input
              value={newName}
              maxLength={40}
              placeholder="예: 사랑의교회"
              onChange={(e) => setNewName(e.target.value)}
            />
          </label>
          <label className="sn-ch-field">
            <span>지역 (시·구)</span>
            <input
              value={newRegion}
              maxLength={40}
              placeholder="예: 서울 서초구"
              onChange={(e) => setNewRegion(e.target.value)}
            />
          </label>
        </div>
      ) : (
        <>
          <label className="sn-ch-search">
            <Search className="sn-icon" aria-hidden />
            <input
              type="search"
              value={q}
              placeholder="교회 이름으로 찾기"
              aria-label="교회 이름"
              autoComplete="off"
              onChange={(e) => setQ(e.target.value)}
            />
            {searching && <Loader2 className="sn-icon sn-ch-spin" aria-label="찾는 중" />}
          </label>
          <div className="sn-ch-results" role="listbox" aria-label="교회 목록">
            {items.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={picked?.id === c.id}
                onClick={() => setPicked(c)}
              >
                <b>{c.name}</b>
                <span>
                  {[c.region || c.address, `갈피 ${num(c.member_count)}명`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            ))}
            {!items.length && q.trim() && !searching && (
              <p className="sn-ch-faint">{searchErr || `‘${q.trim()}’ 교회가 아직 없어요`}</p>
            )}
            <button
              type="button"
              className="sn-ch-add"
              onClick={() => {
                setNewName(q.trim());
                setAdding(true);
              }}
            >
              <Plus className="sn-icon" aria-hidden />
              목록에 없어요, 직접 등록
            </button>
          </div>
          <label className="sn-ch-field">
            <span>부서·교구 (선택)</span>
            <input
              value={dept}
              maxLength={30}
              placeholder="예: 청년부"
              onChange={(e) => setDept(e.target.value)}
            />
          </label>
        </>
      )}
      {err && <p className="sn-ch-warn">{err}</p>}
      {!adding && <p className="sn-ch-hint">정하고 나면 30일 뒤에 바꿀 수 있어요.</p>}
      {adding ? (
        <SnSheetBar onClose={() => setAdding(false)} closeLabel="검색으로" back>
          <button
            type="button"
            className="sn-btn sn-primary"
            disabled={newName.trim().length < 2 || newRegion.trim().length < 2 || busy}
            onClick={register}
          >
            등록하고 고르기
          </button>
        </SnSheetBar>
      ) : (
        <SnSheetBar onClose={onClose}>
          <button
            type="button"
            className="sn-btn sn-primary"
            disabled={!picked || busy}
            onClick={confirm}
          >
            {picked ? '정하기' : '교회를 골라 주세요'}
          </button>
        </SnSheetBar>
      )}
    </SnOverlay>
  );
}
