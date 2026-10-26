import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Lock, PenLine, Send } from 'lucide-react';
import { toast } from 'sonner';
import { decRef, encRef, finalRef, parseRef, refLong } from '../bibleRefs';
import { fmtDate, type SermonNote } from '../sermonTypes';
import {
  groupErrorMessage,
  sermonGroupAPI,
  type ReactionKind,
  type SessionDetail,
  type SessionShare,
} from './groupApi';
import { compareCounts, compareHighlights, groupHeat } from './compare';
import { faceColor, initial, josa, shareFieldsOf, type GroupStore } from './groupStore';
import { weekStartOf } from './sessionMatch';
import { useFx } from '../microFx';
import './group.css';

/**
 * 설교 자리 — 같은 설교를 들은 모임 사람들의 노트가 한자리에.
 * 누가 아직인지(멤버 띠), 설교 정보 같이 채우기, 공개 조각 카드, 반응, 나와 비교, 같이 써요.
 */
interface Props {
  store: GroupStore;
  groupId: string;
  sessionId: string;
  notes: SermonNote[];
  onBack: () => void;
  onOpenNote: (noteId: string) => void;
  /** 이 자리로 새 노트 쓰기 (설교 정보 미리 채움) */
  onWriteHere: (detail: SessionDetail) => void;
}

const REACTS: Array<{ kind: ReactionKind; label: string; only?: string }> = [
  { kind: 'amen', label: '아멘' },
  { kind: 'curious', label: '저도 궁금해요', only: '질문' },
  { kind: 'keeping', label: '같이 지킬게요', only: '적용' },
];

export function SessionView({
  store,
  groupId,
  sessionId,
  notes,
  onBack,
  onOpenNote,
  onWriteHere,
}: Props) {
  const group = store.get(groupId);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [cmpWith, setCmpWith] = useState<string | null>(null);
  const [editInfo, setEditInfo] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await sermonGroupAPI.session(sessionId);
      setDetail({ session: d.session, shares: d.shares || [] });
      setFailed(null);
    } catch (e) {
      setFailed(groupErrorMessage(e, '설교 자리를 불러오지 못했어요'));
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const me = group?.me.user_id;
  const myNote = useMemo(
    () => notes.find((n) => (n.groups || []).some((l) => l.session_id === sessionId && !l.off)),
    [notes, sessionId],
  );
  const myFields = useMemo(() => (myNote ? shareFieldsOf(myNote) : null), [myNote]);
  const shares = useMemo(() => detail?.shares || [], [detail]);
  const others = shares.filter((s) => s.user_id !== me);
  const heat = useMemo(() => groupHeat(shares.map((s) => s.fields)), [shares]);
  const iWrote = !!myNote || shares.some((s) => s.user_id === me);

  // 잠겨 있던 비교가, 한 줄 쓰고 돌아오면 블러가 걷히며 열린다 — 이 기기에서 한 번만
  const lockKey = `sg-locked:${sessionId}`;
  const [reveal, setReveal] = useState(false);
  useLayoutEffect(() => {
    if (!detail) return;
    try {
      if (!iWrote && others.length) localStorage.setItem(lockKey, '1');
      else if (iWrote && localStorage.getItem(lockKey)) {
        localStorage.removeItem(lockKey);
        if (others.length) setReveal(true);
      }
    } catch {
      /* 기록 못 하면 걷히는 장면만 빠진다 */
    }
  }, [detail, iWrote, others.length, lockKey]);

  if (!group) {
    return (
      <div className="sg-page">
        <div className="sg-empty">모임을 찾을 수 없어요.</div>
      </div>
    );
  }
  if (failed) {
    return (
      <div className="sg-page">
        <BackBar onBack={onBack} label={group.name} />
        <div className="sg-empty">{failed}</div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="sg-page" role="status" aria-label="불러오는 중">
        <BackBar onBack={onBack} label={group.name} />
        <div className="sg-empty">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--sn-accent)' }} />
        </div>
      </div>
    );
  }

  const s = detail.session;
  const svcName = s.name || group.services.find((x) => x.id === s.service_id)?.name || '설교';
  const ref = (s.refs || []).map(decRef).find(Boolean) || null;
  const states = new Map((s.members || []).map((m) => [m.user_id, m.state]));
  const activeMembers = group.members.filter((m) => m.status === 'active');
  const writtenCount = activeMembers.filter(
    (m) => states.has(m.user_id) || (m.user_id === me && iWrote),
  ).length;

  const react = async (share: SessionShare, item: string, kind: ReactionKind) => {
    try {
      const r = await sermonGroupAPI.react(share.id, item, kind);
      setDetail(
        (d) =>
          d && {
            ...d,
            shares: d.shares.map((x) =>
              x.id !== share.id
                ? x
                : {
                    ...x,
                    reactions: [
                      ...(x.reactions || []).filter(
                        (y) => !(y.item_key === item && y.kind === kind),
                      ),
                      r,
                    ],
                  },
            ),
          },
      );
    } catch (e) {
      toast(groupErrorMessage(e));
    }
  };

  const poke = async (userId: string, name: string) => {
    try {
      await sermonGroupAPI.poke(groupId, {
        to_user_id: userId,
        session_id: s.id,
        week_start: weekStartOf(s.date),
      });
      toast(`${name} 님에게 같이 쓰자고 했어요`);
    } catch (e) {
      toast(groupErrorMessage(e));
    }
  };

  const cmpShare = others.find((x) => x.id === cmpWith) || null;

  return (
    <div className="sg-page">
      <BackBar onBack={onBack} label={group.name} />
      <div className="sg-hero">
        <div style={{ minWidth: 0 }}>
          <small>
            {group.name} · {fmtDate(s.date)} {svcName}
            {s.updated_by_name ? ` · ${josa(s.updated_by_name, '이', '가')} 채움` : ''}
            {s.locked ? ' · 잠김' : ''}
          </small>
          <h2>{s.title || (ref ? refLong(ref) : '설교 정보가 아직 없어요')}</h2>
          <p>
            {[ref ? refLong(ref) : '', s.preacher || ''].filter(Boolean).join(' · ')}
            {(ref || s.preacher) && ' · '}
            <b>
              {activeMembers.length}명 중 {writtenCount}명 기록
            </b>
          </p>
        </div>
        <div className="sg-row">
          {!(s.locked && group.me.role !== 'leader') && (
            <button type="button" className="sn-btn" onClick={() => setEditInfo((v) => !v)}>
              {s.locked ? <Lock className="sn-icon" /> : <PenLine className="sn-icon" />}
              설교 정보 {s.title ? '고치기' : '채우기'}
            </button>
          )}
          {myNote ? (
            <button
              type="button"
              className="sn-btn sn-primary"
              onClick={() => onOpenNote(myNote.id)}
            >
              내 노트 열기
            </button>
          ) : (
            <button type="button" className="sn-btn sn-primary" onClick={() => onWriteHere(detail)}>
              이 설교로 쓰기
            </button>
          )}
        </div>
      </div>

      {editInfo && (
        <InfoEditor
          detail={detail}
          canLock={group.me.role === 'leader'}
          onSaved={(next) => {
            setDetail((d) => d && { ...d, session: { ...d.session, ...next } });
            store.patchSession(groupId, next);
            setEditInfo(false);
          }}
        />
      )}

      <div className="sg-members" aria-label="멤버 기록 현황">
        {activeMembers.map((m) => {
          const st =
            m.user_id === me ? (iWrote ? 'written' : 'none') : states.get(m.user_id) || 'none';
          const share = shares.find((x) => x.user_id === m.user_id);
          const n =
            share && myFields && m.user_id !== me
              ? compareCounts(compareHighlights(myFields, share.fields)).both
              : 0;
          return (
            <button
              key={m.user_id}
              type="button"
              className="sg-mem"
              data-state={st}
              data-me={m.user_id === me || undefined}
              onClick={() => {
                if (m.user_id === me) return;
                if (st === 'none') void poke(m.user_id, m.display_name);
                else if (share) setCmpWith(share.id);
              }}
              aria-label={
                m.user_id === me
                  ? '나'
                  : st === 'none'
                    ? `${m.display_name} 아직 · 같이 써요 보내기`
                    : `${josa(m.display_name, '과', '와')} 비교`
              }
            >
              <span className="sg-av" style={{ background: faceColor(m.user_id) }}>
                {initial(m.display_name)}
                {st !== 'none' && <span className="sg-st" aria-hidden />}
              </span>
              {m.user_id === me ? '나' : m.display_name}
              <span className={`sg-lab${st !== 'none' ? ' w' : ''}`}>
                {st === 'none'
                  ? m.user_id === me
                    ? '아직'
                    : '같이 써요'
                  : st === 'private'
                    ? '나만 보기'
                    : m.user_id === me
                      ? '기록함'
                      : iWrote && n
                        ? `${n}곳 겹침`
                        : '기록함'}
              </span>
            </button>
          );
        })}
      </div>

      {cmpShare && (
        <ComparePanel
          name={cmpShare.display_name}
          userId={cmpShare.user_id}
          mine={myFields}
          theirs={cmpShare}
          iWrote={iWrote}
          onWrite={() => onWriteHere(detail)}
          onClose={() => setCmpWith(null)}
        />
      )}

      {!iWrote && others.length > 0 ? (
        <div className="sg-blur">
          <div className="sg-blur-in" aria-hidden>
            <ShareGrid
              shares={others.slice(0, 2)}
              me={me}
              heat={heat}
              onReact={() => undefined}
              onCompare={() => undefined}
            />
          </div>
          <div className="sg-blur-ov">
            <span>
              {others.length}명이 이 설교를 기록했어요
              {heat.size > 0 && ` · 가장 많이 밑줄 그은 곳 ${topRefLabel(heat)}`}
            </span>
            <span style={{ fontWeight: 500, fontSize: 13 }}>
              한 줄만 써도 다른 사람의 노트와 비교가 열려요
            </span>
            <button type="button" className="sn-btn sn-primary" onClick={() => onWriteHere(detail)}>
              이 설교로 한 줄 쓰기
            </button>
          </div>
        </div>
      ) : others.length ? (
        <div className={reveal ? 'sg-reveal' : undefined}>
          <ShareGrid
            shares={others}
            me={me}
            heat={heat}
            onReact={react}
            onCompare={(id) => setCmpWith(id)}
          />
        </div>
      ) : (
        <div className="sg-empty">
          아직 다른 사람의 노트가 없어요.
          <span className="sg-note">멤버 얼굴을 누르면 같이 쓰자고 보낼 수 있어요.</span>
        </div>
      )}
    </div>
  );
}

function topRefLabel(heat: Map<string, number>): string {
  let best = '';
  let n = 0;
  heat.forEach((c, r) => {
    if (c > n) {
      best = r;
      n = c;
    }
  });
  const r = decRef(best);
  return r ? refLong(r) : '';
}

function BackBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <div className="sg-row">
      <button type="button" className="sn-btn sn-ghost" onClick={onBack}>
        <ArrowLeft className="sn-icon" />
        {label}
      </button>
    </div>
  );
}

function ShareGrid({
  shares,
  me,
  heat,
  onReact,
  onCompare,
}: {
  shares: SessionShare[];
  me?: string;
  heat: Map<string, number>;
  onReact: (s: SessionShare, item: string, kind: ReactionKind) => void;
  onCompare: (shareId: string) => void;
}) {
  // 누르는 즉시 톡 — 숫자는 서버 응답 뒤 굴러 바뀐다
  const [fx, fire] = useFx(600);
  const press = (sh: SessionShare, item: string, kind: ReactionKind) => {
    fire(`${sh.id}|${item}|${kind}`);
    onReact(sh, item, kind);
  };
  const num = (n?: number) =>
    n ? (
      <>
        {' '}
        <span key={n} className="sg-rc">
          {n}
        </span>
      </>
    ) : null;
  return (
    <div className="sg-shares">
      {shares.map((sh) => {
        const f = sh.fields || {};
        const count = (item: string, kind: ReactionKind) =>
          (sh.reactions || []).find((r) => r.item_key === item && r.kind === kind);
        return (
          <article key={sh.id} className="sg-share" data-me={sh.user_id === me || undefined}>
            <div className="sg-share-h">
              <span className="sg-faces" style={{ ['--f' as string]: '24px' }}>
                <i style={{ background: faceColor(sh.user_id) }}>{initial(sh.display_name)}</i>
              </span>
              <b>{sh.display_name}</b>
              {sh.my_title && <span>“{sh.my_title}”</span>}
              <span className="sg-sp">{sh.heard === 'video' ? '영상' : sh.part || ''}</span>
            </div>
            {sh.private ? (
              <p className="sg-note">기록은 했지만 내용은 나만 보기로 두었어요.</p>
            ) : (
              <>
                {(f.highlights || []).slice(0, 4).map((h) => {
                  const r = decRef(h.ref);
                  return (
                    <div key={h.ref} className="sg-hl">
                      <small>
                        {r ? refLong(r) : h.ref}
                        {(heat.get(h.ref) || 0) > 1 ? ` · ${heat.get(h.ref)}명` : ''}
                      </small>
                      <mark>{h.text || '(밑줄)'}</mark>
                    </div>
                  );
                })}
                {(f.thoughts || []).slice(0, 4).map((t) => {
                  const r = REACTS.filter((x) => !x.only || x.only === t.tag);
                  return (
                    <div key={t.id} className="sg-th">
                      <span className="sg-tag" data-tag={t.tag}>
                        {t.tag}
                      </span>
                      {t.text}
                      <div className="sg-reacts" style={{ marginTop: 6 }}>
                        {r.map((x) => {
                          const c = count(t.id, x.kind);
                          return (
                            <button
                              key={x.kind}
                              type="button"
                              aria-pressed={!!c?.mine}
                              data-fx={fx === `${sh.id}|${t.id}|${x.kind}` || undefined}
                              onClick={() => press(sh, t.id, x.kind)}
                            >
                              {x.label}
                              {num(c?.count)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {!(f.highlights || []).length && !(f.thoughts || []).length && (
                  <p className="sg-note">공개한 밑줄·생각이 아직 없어요.</p>
                )}
                <div className="sg-reacts">
                  {!(f.thoughts || []).length && (
                    <button
                      type="button"
                      aria-pressed={!!count('note', 'amen')?.mine}
                      data-fx={fx === `${sh.id}|note|amen` || undefined}
                      onClick={() => press(sh, 'note', 'amen')}
                    >
                      아멘{num(count('note', 'amen')?.count)}
                    </button>
                  )}
                  <button type="button" onClick={() => onCompare(sh.id)}>
                    나와 비교
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ComparePanel({
  name,
  userId,
  mine,
  theirs,
  iWrote,
  onWrite,
  onClose,
}: {
  name: string;
  userId: string;
  mine: ReturnType<typeof shareFieldsOf> | null;
  theirs: SessionShare;
  iWrote: boolean;
  onWrite: () => void;
  onClose: () => void;
}) {
  const list = compareHighlights(mine, theirs.fields);
  const c = compareCounts(list);
  const myApply = (mine?.thoughts || []).filter((t) => t.tag === '적용');
  const theirApply = (theirs.fields?.thoughts || []).filter((t) => t.tag === '적용');
  const label = (ref: string) => {
    const r = decRef(ref);
    return r ? refLong(r) : ref;
  };
  return (
    <section className="sg-share" aria-label={`${josa(name, '과', '와')} 나 비교`}>
      <div className="sg-share-h">
        <span className="sg-faces" style={{ ['--f' as string]: '24px' }}>
          <i style={{ background: 'var(--sn-t1)' }}>나</i>
          <i style={{ background: faceColor(userId) }}>{initial(name)}</i>
        </span>
        <b>{josa(name, '과', '와')} 나</b>
        <button type="button" className="sg-chip sg-sp" onClick={onClose}>
          닫기
        </button>
      </div>
      {!iWrote ? (
        <div className="sg-empty" style={{ padding: 12 }}>
          한 줄만 써도 비교가 열려요.
          <button type="button" className="sn-btn sn-primary" onClick={onWrite}>
            이 설교로 한 줄 쓰기
          </button>
        </div>
      ) : (
        <>
          <div className="sg-cmp-sum">
            <span>
              같은 구절 밑줄 <b>{c.both}곳</b>
            </span>
            <span>
              {name}만 <b>{c.theirs}곳</b>
            </span>
            <span>
              나만 <b>{c.mine}곳</b>
            </span>
          </div>
          <div className="sg-cmp">
            <div className="sg-col">
              <h4>나</h4>
              {list
                .filter((x) => x.mine)
                .map((x) => (
                  <div key={x.ref} className="sg-hl">
                    <small>
                      {label(x.ref)} · {x.kind === 'both' ? '둘 다' : '나만'}
                    </small>
                    <mark data-both={x.kind === 'both' || undefined}>
                      {x.mine?.text || '(밑줄)'}
                    </mark>
                  </div>
                ))}
              {myApply.map((t) => (
                <div key={t.id} className="sg-th">
                  <span className="sg-tag" data-tag="적용">
                    내 적용
                  </span>
                  {t.text}
                </div>
              ))}
            </div>
            <div className="sg-col">
              <h4>{name}</h4>
              {list
                .filter((x) => x.theirs)
                .map((x) => (
                  <div key={x.ref} className="sg-hl">
                    <small>
                      {label(x.ref)} · {x.kind === 'both' ? '둘 다' : `${name}만`}
                    </small>
                    <mark data-both={x.kind === 'both' || undefined}>
                      {x.theirs?.text || '(밑줄)'}
                    </mark>
                  </div>
                ))}
              {theirApply.map((t) => (
                <div key={t.id} className="sg-th">
                  <span className="sg-tag" data-tag="적용">
                    {name} 적용
                  </span>
                  {t.text}
                </div>
              ))}
            </div>
          </div>
          {!list.length && !myApply.length && !theirApply.length && (
            <p className="sg-note">
              비교할 밑줄·적용이 아직 없어요. 말씀 구절에 밑줄을 그으면 여기서 겹쳐 보여요.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function InfoEditor({
  detail,
  canLock,
  onSaved,
}: {
  detail: SessionDetail;
  canLock: boolean;
  onSaved: (s: SessionDetail['session']) => void;
}) {
  const s = detail.session;
  const [title, setTitle] = useState(s.title || '');
  const [preacher, setPreacher] = useState(s.preacher || '');
  const r0 = (s.refs || []).map(decRef).find(Boolean);
  const [refText, setRefText] = useState(r0 ? refLong(r0) : '');
  const [busy, setBusy] = useState(false);
  const parsed = refText.trim() ? finalRef(parseRef(refText.trim())) : null;

  const save = async () => {
    setBusy(true);
    try {
      const next = await sermonGroupAPI.updateSession(s.id, {
        title: title.trim().slice(0, 200),
        preacher: preacher.trim().slice(0, 60),
        refs: parsed ? [encRef(parsed)] : [],
      });
      onSaved(next);
      toast('설교 정보를 채웠어요 · 모임 모두에게 보여요');
    } catch (e) {
      toast(groupErrorMessage(e, '저장하지 못했어요'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sg-share">
      <p className="sg-note">
        한 사람이 적으면 모임 모두의 노트에 채워져요. 내 노트 제목은 따로 그대로 남아요.
      </p>
      <label className="sg-field" htmlFor="sg-i-title">
        설교 제목
        <input
          id="sg-i-title"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="sg-field" htmlFor="sg-i-preacher">
        설교자
        <input
          id="sg-i-preacher"
          value={preacher}
          maxLength={60}
          onChange={(e) => setPreacher(e.target.value)}
        />
      </label>
      <label className="sg-field" htmlFor="sg-i-ref">
        본문{' '}
        {refText.trim() && !parsed && (
          <span style={{ color: 'var(--sn-t2)' }}>· 구절을 알아보지 못했어요</span>
        )}
        <input
          id="sg-i-ref"
          value={refText}
          placeholder="예: 롬 5:12-14"
          onChange={(e) => setRefText(e.target.value)}
        />
      </label>
      <div className="sg-row">
        <button
          type="button"
          className="sn-btn sn-primary"
          disabled={busy || (!!refText.trim() && !parsed)}
          onClick={() => void save()}
        >
          {busy ? <Loader2 className="sn-icon animate-spin" /> : <Send className="sn-icon" />}
          채우기
        </button>
        {canLock && (
          <button
            type="button"
            className="sn-btn"
            onClick={async () => {
              try {
                onSaved(await sermonGroupAPI.lockSession(s.id, !s.locked));
              } catch (e) {
                toast(groupErrorMessage(e));
              }
            }}
          >
            <Lock className="sn-icon" />
            {s.locked ? '잠금 풀기' : '리더만 고치게 잠그기'}
          </button>
        )}
      </div>
    </div>
  );
}
