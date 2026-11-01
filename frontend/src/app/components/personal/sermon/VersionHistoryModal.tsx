import { Fragment, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import {
  diffBlocks,
  isBigRemoval,
  splitBlocks,
  summarize,
  takeOne,
  type BlockOp,
  type DiffSummary,
} from './versionDiff';
import './versionHistory.css';

/**
 * 버전 기록 창 — 기획서 §9, 2026-11-01 개편.
 * 왼쪽(폰은 첫 화면) = 시간순 목록: 각 버전에서 처음 바뀐 문장과 늘고 준 글자, 글자 수 흐름, 큰 삭제 표시.
 * 오른쪽(폰은 둘째 화면) = 고른 버전과 지금 글의 차이 ("되돌리면 달라지는 것") 또는 직전과의 차이 ("이때 쓴 것").
 * 돌아올 문단에는 「이 문단만 가져오기」, 통째 되돌리기는 아래 하나. 본문만 바꾸고 내 생각은 그대로.
 * 기기 버전에 서버 버전을 합쳐 보여 준다. 서버에만 있는 버전은 고를 때 본문을 받아 온다.
 */
interface VersionHistoryModalProps {
  open: boolean;
  /** 기기에 있는 버전 (본문 포함) */
  versions: NoteVersion[];
  /** 서버 목록을 받을 노트 id — 로컬 id·익명이면 서버를 부르지 않는다 */
  noteId?: string | null;
  remote?: boolean;
  /** 지금 본문 HTML */
  currentBody: string;
  onRestore: (v: NoteVersion) => void;
  /** 문단 하나만 가져온 새 본문 */
  onApplyBody: (html: string) => void;
  onClose: () => void;
}

type Mode = 'restore' | 'wrote';
const NOW = 'now';
const SESSION_GAP = 30 * 60 * 1000;
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function dayLabel(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
  if (same(d, today)) return `오늘 · ${base}`;
  if (same(d, y)) return `어제 · ${base}`;
  return base;
}

function useNarrow(query = '(max-width: 759px)') {
  const mq = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query)
      : null;
  const [narrow, setNarrow] = useState(() => !!mq()?.matches);
  useEffect(() => {
    const m = mq();
    if (!m) return;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return narrow;
}

interface Row {
  v: VersionView;
  body?: string;
  chars: number;
  /** 직전 버전 대비 (직전 본문을 모르면 없음) */
  sum?: DiffSummary;
  big: boolean;
  empty: boolean;
}

export function VersionHistoryModal({
  open,
  versions,
  noteId,
  remote = false,
  currentBody,
  onRestore,
  onApplyBody,
  onClose,
}: VersionHistoryModalProps) {
  const [server, setServer] = useState<ServerVersionItem[]>([]);
  const [loading, setLoading] = useState(false);
  /** 서버에서 받아 온 본문 (id → body) */
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('restore');
  const [step, setStep] = useState<'list' | 'detail'>('list');
  const [unfold, setUnfold] = useState<Set<number>>(() => new Set());
  const narrow = useNarrow();

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
    setSel(null);
    setMode('restore');
    setStep('list');
  }, [open]);

  const list: VersionView[] = useMemo(
    () => mergeVersionLists(versions, canFetch ? server : [], noteId || ''),
    [versions, server, canFetch, noteId],
  );

  const nowBlocks = useMemo(() => splitBlocks(currentBody), [currentBody]);
  const nowChars = useMemo(() => plainText(currentBody).length, [currentBody]);

  /** 최신순 목록 + 각 줄의 직전 대비 요약 */
  const rows: Row[] = useMemo(() => {
    const blocks = new Map<string, ReturnType<typeof splitBlocks>>();
    const bodyOfV = (v: VersionView) => v.body ?? bodies[v.id];
    const blocksOf = (v: VersionView) => {
      const b = bodyOfV(v);
      if (b == null) return null;
      let x = blocks.get(v.id);
      if (!x) {
        x = splitBlocks(b);
        blocks.set(v.id, x);
      }
      return x;
    };
    return list.map((v, i) => {
      const prev = list[i + 1];
      const body = bodyOfV(v);
      const cur = blocksOf(v);
      const before = prev ? blocksOf(prev) : [];
      const sum = cur && before ? summarize(diffBlocks(before, cur)) : undefined;
      const prevChars = prev ? prev.chars || 0 : 0;
      const chars = v.chars || 0;
      return {
        v,
        body,
        chars,
        sum,
        big: !!sum && isBigRemoval(sum, prevChars),
        empty: chars === 0 && (body == null || !plainText(body)),
      };
    });
  }, [list, bodies]);

  const nowSum = useMemo(() => {
    const latest = rows[0];
    if (!latest || latest.body == null) return undefined;
    return summarize(diffBlocks(splitBlocks(latest.body), nowBlocks));
  }, [rows, nowBlocks]);

  // 처음 열면 가장 최근의 빈 것 아닌 버전을 고른다
  useEffect(() => {
    if (!open || sel) return;
    const first = rows.find((r) => !r.empty);
    setSel(first ? first.v.id : NOW);
  }, [open, sel, rows]);

  const selIdx = rows.findIndex((r) => r.v.id === sel);
  const selRow = selIdx >= 0 ? rows[selIdx] : null;
  const isNow = sel === NOW;
  const effMode: Mode = isNow ? 'wrote' : mode;

  const fetchBody = async (v: VersionView): Promise<string | null> => {
    const have = v.body ?? bodies[v.id];
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

  // 고른 버전(과 "이때 쓴 것"이면 직전 버전) 본문이 서버에만 있으면 받아 온다
  useEffect(() => {
    if (!open || !selRow || selRow.body != null || busy || failed === selRow.v.id) return;
    void fetchBody(selRow.v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selRow?.v.id, selRow?.body, busy, failed]);
  useEffect(() => {
    if (!open || effMode !== 'wrote' || busy) return;
    const prev = isNow ? rows[0] : selIdx >= 0 ? rows[selIdx + 1] : undefined;
    if (prev && prev.body == null && failed !== prev.v.id) void fetchBody(prev.v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effMode, isNow, selIdx, rows, busy, failed]);

  /** 오른쪽에 그릴 차이 */
  const ops: BlockOp[] | null = useMemo(() => {
    if (isNow) {
      const latest = rows[0];
      if (!latest) return diffBlocks([], nowBlocks);
      return latest.body == null ? null : diffBlocks(splitBlocks(latest.body), nowBlocks);
    }
    if (!selRow || selRow.body == null) return null;
    const mine = splitBlocks(selRow.body);
    if (effMode === 'restore') return diffBlocks(nowBlocks, mine);
    const prev = rows[selIdx + 1];
    if (!prev) return diffBlocks([], mine);
    return prev.body == null ? null : diffBlocks(splitBlocks(prev.body), mine);
  }, [isNow, rows, selRow, selIdx, effMode, nowBlocks]);

  const pick = (id: string) => {
    setSel(id);
    setUnfold(new Set());
    setFailed(null);
    setStep('detail');
  };

  const restore = async () => {
    if (!selRow) return;
    const body = await fetchBody(selRow.v);
    if (body == null) return;
    const v = selRow.v;
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

  const copy = () => {
    const body = isNow ? currentBody : selRow?.body;
    if (body == null) return;
    const text = splitBlocks(body)
      .map((b) => b.text)
      .filter(Boolean)
      .join('\n\n');
    navigator.clipboard?.writeText(text).catch(() => {
      /* 복사 거부 — 조용히 */
    });
  };

  /* ───── 그리기 ───── */

  const spark = useMemo(() => {
    const pts = [...rows]
      .reverse()
      .map((r) => ({ id: r.v.id, c: r.chars, big: r.big }))
      .concat([{ id: NOW, c: nowChars, big: false }]);
    if (pts.length < 2) return null;
    const max = Math.max(1, ...pts.map((p) => p.c));
    const W = 300;
    const H = 44;
    return pts.map((p, i) => ({
      ...p,
      x: 6 + (i * (W - 12)) / (pts.length - 1),
      y: H - 4 - (p.c / max) * (H - 10),
    }));
  }, [rows, nowChars]);

  const delta = (s?: DiffSummary) =>
    s && (s.added || s.removed) ? (
      <span className="sn-vh-delta sn-mono">
        {s.added > 0 && <span className="a">+{s.added.toLocaleString()}</span>}
        {s.removed > 0 && <span className="d">−{s.removed.toLocaleString()}</span>}
      </span>
    ) : null;

  const listView = (
    <div className="sn-vh-side">
      {spark && (
        <svg
          className="sn-vh-spark"
          viewBox="0 0 300 44"
          preserveAspectRatio="none"
          role="img"
          aria-label="시간에 따른 글자 수"
        >
          <polyline points={spark.map((p) => `${p.x},${p.y}`).join(' ')} />
          {spark.map((p) => (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r={p.id === sel ? 4.5 : 2.5}
              className={p.id === sel ? 'on' : p.big ? 'big' : ''}
            />
          ))}
        </svg>
      )}
      <ul className="sn-vh-list">
        <li>
          <button
            type="button"
            className="sn-vh-item"
            aria-current={isNow}
            onClick={() => pick(NOW)}
          >
            <span className="l1">
              <b className="sn-mono">지금</b>
              <span className="sn-vh-chip now">지금 글</span>
              {delta(nowSum)}
            </span>
            <span className="snip">
              {nowSum
                ? nowSum.first || '마지막 버전 뒤로 바뀐 게 없어요'
                : `${nowChars.toLocaleString()}자`}
            </span>
          </button>
        </li>
        {rows.map((r, i) => {
          const prev = rows[i - 1];
          const newGroup =
            !prev || new Date(prev.v.at).toDateString() !== new Date(r.v.at).toDateString();
          const gap = !newGroup && prev && prev.v.at - r.v.at > SESSION_GAP;
          return (
            <Fragment key={r.v.id}>
              {newGroup && <li className="sn-vh-group">{dayLabel(r.v.at)}</li>}
              {gap && <li className="sn-vh-gap" aria-hidden />}
              {r.empty ? (
                <li className="sn-vh-empty">빈 노트에서 시작 · {hhmm(r.v.at)}</li>
              ) : (
                <li>
                  <button
                    type="button"
                    className={`sn-vh-item${r.big ? ' big' : ''}`}
                    aria-current={r.v.id === sel}
                    onClick={() => pick(r.v.id)}
                  >
                    <span className="l1">
                      <b className="sn-mono">{hhmm(r.v.at)}</b>
                      <span className="sn-vh-chip">
                        {VERSION_REASON_LABEL[r.v.reason] || '저장'}
                      </span>
                      {delta(r.sum)}
                    </span>
                    {r.big && <span className="warn">한 번에 많이 지워졌어요</span>}
                    <span className="snip">
                      {r.sum
                        ? r.sum.first
                          ? (r.sum.firstIsRemoval ? '지움 · ' : '') + r.sum.first
                          : '내용은 그대로예요'
                        : r.body == null
                          ? `${r.chars.toLocaleString()}자 · 다른 기기에서 남긴 버전`
                          : plainText(r.body).slice(0, 60)}
                    </span>
                  </button>
                </li>
              )}
            </Fragment>
          );
        })}
        {rows.length === 0 && (
          <li className="sn-vh-none">
            {loading ? (
              <Loader2 className="sn-icon sn-spin" aria-label="불러오는 중" />
            ) : (
              '아직 남은 버전이 없어요. 본문을 고치기 시작하면 고치기 전 내용부터 자동으로 남아요.'
            )}
          </li>
        )}
      </ul>
    </div>
  );

  const titleOf = () => {
    if (isNow) return { t: '지금 글', s: `${nowChars.toLocaleString()}자` };
    if (!selRow) return { t: '', s: '' };
    const d = new Date(selRow.v.at);
    return {
      t: `${d.getMonth() + 1}월 ${d.getDate()}일 ${hhmm(selRow.v.at)} · ${
        VERSION_REASON_LABEL[selRow.v.reason] || '저장'
      }`,
      s: `${selRow.chars.toLocaleString()}자 · 지금 ${nowChars.toLocaleString()}자`,
    };
  };
  const head = titleOf();

  const renderOps = (o: BlockOp[]) => {
    const out: JSX.Element[] = [];
    let run: Array<{ i: number; text: string }> = [];
    const flush = (at: number) => {
      const texts = run.filter((r) => r.text);
      if (texts.length >= 2 && !unfold.has(at)) {
        out.push(
          <button
            key={`f${at}`}
            type="button"
            className="sn-vh-fold"
            onClick={() => setUnfold((s) => new Set(s).add(at))}
          >
            그대로인 문단 {texts.length}개 펼치기
          </button>,
        );
      } else {
        texts.forEach((r) =>
          out.push(
            <p key={`e${r.i}`} className="sn-vh-p eq">
              {r.text}
            </p>,
          ),
        );
      }
      run = [];
    };
    const take = (i: number) =>
      effMode === 'restore' ? (
        <button type="button" className="sn-vh-take" onClick={() => onApplyBody(takeOne(o, i))}>
          이 문단만 가져오기
        </button>
      ) : null;
    o.forEach((op, i) => {
      if (op.t === 'eq') {
        run.push({ i, text: op.o.text });
        return;
      }
      flush(i);
      if (op.t === 'add') {
        if (!op.n.text) return;
        out.push(
          <p key={i} className="sn-vh-p add">
            {op.n.text}
            {take(i)}
          </p>,
        );
      } else if (op.t === 'del') {
        if (!op.o.text) return;
        out.push(
          <p key={i} className="sn-vh-p del">
            {op.o.text}
          </p>,
        );
      } else {
        out.push(
          <p key={i} className="sn-vh-p mod">
            {op.words.map((w, k) =>
              w.t === 'eq' ? (
                <Fragment key={k}>{w.v}</Fragment>
              ) : w.t === 'add' ? (
                <ins key={k}>{w.v}</ins>
              ) : (
                <del key={k}>{w.v}</del>
              ),
            )}
            {take(i)}
          </p>,
        );
      }
    });
    flush(-1);
    if (!o.some((x) => x.t !== 'eq' && ((x.t === 'del' ? x.o : x.n).text || x.t === 'mod'))) {
      return (
        <p className="sn-vh-none">
          {effMode === 'restore'
            ? '지금 글과 같아요. 되돌릴 게 없어요.'
            : '이때 바뀐 글자는 없어요.'}
        </p>
      );
    }
    return out;
  };

  const busySel = !!selRow && busy === selRow.v.id;
  const detailView = (
    <div className="sn-vh-main">
      <div className="sn-vh-mhead">
        <div className="ttl">
          <b>{head.t}</b>
          <span className="sn-mono">{head.s}</span>
        </div>
        <div className="sn-vh-seg" role="group" aria-label="비교 방식">
          <button
            type="button"
            aria-pressed={effMode === 'restore'}
            disabled={isNow}
            onClick={() => {
              setMode('restore');
              setUnfold(new Set());
            }}
          >
            되돌리면 달라지는 것
          </button>
          <button
            type="button"
            aria-pressed={effMode === 'wrote'}
            onClick={() => {
              setMode('wrote');
              setUnfold(new Set());
            }}
          >
            {isNow ? '마지막 버전 뒤로 쓴 것' : '이때 쓴 것'}
          </button>
        </div>
        <div className="sn-vh-legend">
          {effMode === 'restore' ? (
            <>
              <span>
                <i className="a" />
                되돌리면 돌아와요
              </span>
              <span>
                <i className="d" />
                되돌리면 사라져요
              </span>
            </>
          ) : (
            <>
              <span>
                <i className="a" />
                새로 쓴 것
              </span>
              <span>
                <i className="d" />
                지운 것
              </span>
            </>
          )}
        </div>
      </div>
      <div className="sn-vh-doc">
        {ops ? (
          renderOps(ops)
        ) : selRow && failed === selRow.v.id ? (
          <p className="sn-vh-none">
            버전을 불러오지 못했어요. 연결을 확인해 주세요.{' '}
            <button type="button" className="sn-vh-take" onClick={() => setFailed(null)}>
              다시 불러오기
            </button>
          </p>
        ) : (
          <p className="sn-vh-none">
            <Loader2 className="sn-icon sn-spin" aria-label="불러오는 중" />
          </p>
        )}
      </div>
    </div>
  );

  const showDetail = !narrow || step === 'detail';
  const canRestore = !isNow && !!selRow && !busySel;

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sn-vh"
      overlayClassName="sn-vh-ov"
      aria-labelledby="sn-ver-title"
    >
      <div className="sn-vhead">
        <h2 id="sn-ver-title">버전 기록</h2>
      </div>
      <div className="sn-vh-body" data-step={narrow ? step : 'both'}>
        {(!narrow || step === 'list') && listView}
        {showDetail && sel && detailView}
      </div>
      <SnSheetBar
        onClose={narrow && step === 'detail' ? () => setStep('list') : onClose}
        closeLabel={narrow && step === 'detail' ? '목록' : '닫기'}
        back={narrow && step === 'detail'}
        note={
          showDetail && !narrow
            ? '되돌려도 지금 글은 버전으로 남고, 내 생각 메모는 그대로예요'
            : undefined
        }
      >
        {showDetail && sel && (
          <>
            <button
              type="button"
              className="sn-btn"
              disabled={isNow ? !currentBody : !selRow || selRow.body == null}
              onClick={copy}
            >
              복사
            </button>
            {!isNow && (
              <button
                type="button"
                className="sn-btn sn-primary"
                disabled={!canRestore}
                onClick={() => void restore()}
              >
                {selRow ? `${hhmm(selRow.v.at)} 버전으로 되돌리기` : '되돌리기'}
              </button>
            )}
          </>
        )}
      </SnSheetBar>
    </SnOverlay>
  );
}
