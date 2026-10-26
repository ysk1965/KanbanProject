import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Loader2, Lock, PenLine, Send } from 'lucide-react';
import { toast } from 'sonner';
import { decRef, encRef, finalRef, parseRef, refLong } from '../bibleRefs';
import { Mascot } from '../Mascot';
import { loadLook, type MascotId } from '../sermonLook';
import { type SermonNote } from '../sermonTypes';
import {
  groupErrorMessage,
  sermonGroupAPI,
  type ReactionKind,
  type SessionDetail,
  type SessionShare,
} from './groupApi';
import { compareCounts, compareHighlights, groupHeat } from './compare';
import { faceColor, initial, josa, shareFieldsOf, type GroupStore } from './groupStore';
import { DOW_KO } from './servicePresets';
import { weekStartOf } from './sessionMatch';
import { useFx } from '../microFx';
import { SnActionBar } from '../SnActionBar';
import { GalpiMark } from '../GalpiMark';
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
  const [mascot] = useState<MascotId>(() => loadLook().mascot);

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
        <SnActionBar backLabel={group.name} onBack={onBack} />
        <div className="sg-empty">{failed}</div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="sg-page" role="status" aria-label="불러오는 중">
        <SnActionBar backLabel={group.name} onBack={onBack} />
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
  const galpiNames = (s.members || [])
    .filter((m) => m.galpi)
    .map((m) => group.members.find((x) => x.user_id === m.user_id)?.display_name)
    .filter((x): x is string => !!x);
  const activeMembers = group.members.filter((m) => m.status === 'active');
  const writtenCount = activeMembers.filter(
    (m) => states.has(m.user_id) || (m.user_id === me && iWrote),
  ).length;

  const title = s.title || (ref ? refLong(ref) : '');
  const sub = [s.title && ref ? refLong(ref) : '', s.preacher || ''].filter(Boolean).join(' · ');
  const [yy, mo, dd] = s.date.split('-').map(Number);
  const dow = DOW_KO[new Date(yy, mo - 1, dd).getDay()];
  const canEdit = !(s.locked && group.me.role !== 'leader');

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

  /** 주요 동작 — 본문 표지와 하단 동작 바에 같이 (하단 바가 있으면 표지 쪽은 CSS 로 숨김) */
  const primary = (cls = '') =>
    myNote ? (
      <button
        type="button"
        className={`sn-btn sn-primary${cls}`}
        onClick={() => onOpenNote(myNote.id)}
      >
        내 노트 열기
      </button>
    ) : (
      <button
        type="button"
        className={`sn-btn sn-primary${cls}`}
        onClick={() => onWriteHere(detail)}
      >
        이 설교로 쓰기
      </button>
    );

  return (
    <div className="sg-page">
      <SnActionBar backLabel={group.name} onBack={onBack} primary={primary()} />
      <header className="sg-cover sg-scover">
        <span className="sg-cover-tape" aria-hidden />
        <span className="sg-sdate" aria-hidden>
          <small>{Number(s.date.slice(5, 7))}월</small>
          <b>{Number(s.date.slice(8, 10))}</b>
          <span>{dow}</span>
        </span>
        <div className="sg-cover-in">
          <small>
            {group.name} · {svcName}
            {s.locked ? ' · 잠김' : ''}
          </small>
          <h2 data-ph={!title || undefined}>{title || '아직 제목 없는 설교'}</h2>
          {sub && <span className="sg-dref">{sub}</span>}
          {s.updated_by_name ? (
            <span className="sg-hand">{josa(s.updated_by_name, '이', '가')} 채워 줬어요</span>
          ) : (
            !title &&
            canEdit && (
              <button
                type="button"
                className="sg-hand sg-hand-btn"
                onClick={() => setEditInfo(true)}
              >
                ✎ 제목·본문 아는 사람이 적어 주세요
              </button>
            )
          )}
        </div>
        <div className="sg-scover-acts">
          {canEdit && (
            <button type="button" className="sn-btn" onClick={() => setEditInfo((v) => !v)}>
              {s.locked ? <Lock className="sn-icon" /> : <PenLine className="sn-icon" />}
              설교 정보 {s.title ? '고치기' : '채우기'}
            </button>
          )}
          {primary(' sn-abar-dup')}
        </div>
      </header>

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

      <section className="sg-mstrip" aria-label="멤버 기록 현황">
        <div className="sg-mstrip-h">
          <b>
            {activeMembers.length}명 중 <em>{writtenCount}명</em> 기록
          </b>
          {writtenCount < activeMembers.length && (
            <span className="sg-hand">아직인 얼굴을 누르면 같이 쓰자고 보내요</span>
          )}
          {galpiNames.length > 0 && (
            <span className="sg-hand sg-mstrip-galpi">
              <GalpiMark size={14} />
              {[
                ...galpiNames.slice(0, -1),
                josa(galpiNames[galpiNames.length - 1], '이', '가'),
              ].join(' · ')}{' '}
              이 설교에 갈피를 꽂았어요
            </span>
          )}
        </div>
        <div className="sg-members">
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
                  {(s.members || []).some((x) => x.user_id === m.user_id && x.galpi) && (
                    <GalpiMark size={13} className="sg-av-galpi" />
                  )}
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
      </section>

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
            <Mascot kind={mascot} size={56} state="think" />
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
        <div className="sg-quiet">
          <Mascot kind={mascot} size={64} state={iWrote ? 'idle' : 'think'} />
          <p className="sg-hand">
            {iWrote ? '내가 먼저 꽂았어요' : '아직 아무도 이 설교를 쓰지 않았어요'}
          </p>
          <p className="sg-note">
            {iWrote
              ? '다른 사람이 쓰면 여기에 노트가 모여요. 멤버 얼굴을 누르면 같이 쓰자고 보낼 수 있어요.'
              : '한 줄만 써도 이 자리에 붙어요.'}
          </p>
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
    <section className="sg-share sg-cmpcard" aria-label={`${josa(name, '과', '와')} 나 비교`}>
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
    <div className="sg-setcard">
      <h3>
        <span className="sg-label-stk">설교 정보</span>모임 모두에게 채워져요
      </h3>
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
