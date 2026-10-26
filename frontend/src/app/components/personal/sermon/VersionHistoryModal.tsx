import { useEffect, useMemo, useState } from 'react';
import { SnOverlay } from './SnOverlay';
import { SnSheetBar } from './SnSheetBar';
import {
  VERSION_REASON_LABEL,
  mergeVersionLists,
  sermonVersionAPI,
  type NoteVersion,
  type ServerVersionItem,
  type VersionView,
} from './sermonVersions';
import { hhmm, isLocalId, plainText } from './sermonTypes';

/**
 * 버전 기록 창 — 기획서 §9.
 * 시각, 저장 이유, 글자 수와 지금과의 차이, 앞부분 미리보기. 본문만 되돌린다.
 * 기기 버전에 서버 버전을 합쳐 보여 준다 (열 때 목록을 받아 온다, 새 기기에서도 보이게).
 * 서버에만 있는 버전은 본문이 없어 「미리 보기」·「되돌리기」 때 하나를 받아 온다.
 */
interface VersionHistoryModalProps {
  open: boolean;
  /** 기기에 있는 버전 (본문 포함) */
  versions: NoteVersion[];
  /** 서버 목록을 받을 노트 id — 로컬 id·익명이면 서버를 부르지 않는다 */
  noteId?: string | null;
  remote?: boolean;
  currentChars: number;
  onRestore: (v: NoteVersion) => void;
  onClose: () => void;
}

export function VersionHistoryModal({
  open,
  versions,
  noteId,
  remote = false,
  currentChars,
  onRestore,
  onClose,
}: VersionHistoryModalProps) {
  const [server, setServer] = useState<ServerVersionItem[]>([]);
  const [loading, setLoading] = useState(false);
  /** 서버에서 받아 온 본문 (id → body) */
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const canFetch = open && remote && !!noteId && !isLocalId(noteId);

  useEffect(() => {
    if (!canFetch || !noteId) return;
    let gone = false;
    setLoading(true);
    sermonVersionAPI
      .list(noteId)
      .then((res) => {
        if (!gone) setServer(Array.isArray(res?.items) ? res.items : []);
      })
      .catch(() => {
        /* 오프라인 — 기기 버전만 */
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, [canFetch, noteId]);

  useEffect(() => {
    if (open) return;
    setServer([]);
    setBodies({});
    setBusy(null);
    setFailed(null);
  }, [open]);

  const list: VersionView[] = useMemo(
    () => mergeVersionLists(versions, canFetch ? server : [], noteId || ''),
    [versions, server, canFetch, noteId],
  );

  const bodyOf = (v: VersionView): string | undefined => v.body ?? bodies[v.id];

  const fetchBody = async (v: VersionView): Promise<string | null> => {
    const have = bodyOf(v);
    if (have != null) return have;
    if (!noteId) return null;
    setBusy(v.id);
    setFailed(null);
    try {
      const one = await sermonVersionAPI.get(noteId, v.id);
      const body = one?.body ?? '';
      setBodies((b) => ({ ...b, [v.id]: body }));
      return body;
    } catch {
      setFailed(v.id);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const restore = async (v: VersionView) => {
    const body = await fetchBody(v);
    if (body == null) return;
    onRestore({
      id: v.id,
      note_id: v.note_id,
      at: v.at,
      reason: v.reason,
      title: v.title,
      chars: v.chars,
      body,
    });
  };

  return (
    <SnOverlay open={open} onClose={onClose} className="sn-verm" aria-labelledby="sn-ver-title">
      <div className="sn-vhead">
        <h2 id="sn-ver-title">버전 기록</h2>
      </div>
      <p>
        본문은 고치기 시작할 때, 10분마다, 노트를 닫을 때 자동으로 남아요. 되돌려도 내 생각 메모는
        바뀌지 않아요.
      </p>
      <div className="sn-ver-list">
        {list.length === 0 ? (
          <div className="sn-th-empty">
            {loading
              ? '버전 기록을 불러오는 중이에요…'
              : '아직 저장된 버전이 없어요. 본문을 고치기 시작하면 열었을 때의 내용부터 자동으로 남아요.'}
          </div>
        ) : (
          list.map((v) => {
            const d = new Date(v.at);
            const diff = (v.chars || 0) - currentChars;
            const diffText =
              diff === 0
                ? '같음'
                : diff > 0
                  ? `${diff.toLocaleString()}자 많음`
                  : `${(-diff).toLocaleString()}자 적음`;
            const body = bodyOf(v);
            return (
              <div key={v.id} className="sn-vrow">
                <div className="sn-vtop">
                  <b className="sn-mono">
                    {d.getMonth() + 1}.{d.getDate()} {hhmm(v.at)}
                  </b>
                  <span className="sn-tag">{VERSION_REASON_LABEL[v.reason] || '저장'}</span>
                  <span className="sn-label">
                    {(v.chars || 0).toLocaleString()}자 · 지금보다 {diffText}
                  </span>
                </div>
                <div className="sn-vprev">
                  {body != null
                    ? plainText(body).slice(0, 140) || '(구절만 있음)'
                    : failed === v.id
                      ? '불러오지 못했어요. 연결을 확인하고 다시 눌러 주세요'
                      : '다른 기기에서 남긴 버전이에요'}
                </div>
                <div className="sn-vacts" style={{ gap: 6 }}>
                  {body == null && (
                    <button
                      type="button"
                      className="sn-btn"
                      disabled={busy === v.id}
                      onClick={() => void fetchBody(v)}
                    >
                      {busy === v.id ? '불러오는 중…' : '미리 보기'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="sn-btn"
                    disabled={busy === v.id}
                    onClick={() => void restore(v)}
                  >
                    이 버전으로 되돌리기
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <SnSheetBar onClose={onClose} />
    </SnOverlay>
  );
}
