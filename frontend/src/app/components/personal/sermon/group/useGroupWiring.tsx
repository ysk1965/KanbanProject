import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, type SetURLSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../../contexts/AuthContext';
import { SnOverlay } from '../SnOverlay';
import { SnSheetBar } from '../SnSheetBar';
import type { SermonStore } from '../sermonStore';
import { newNote, todayString, type NoteGroupLink, type SermonNote } from '../sermonTypes';
import type { SessionDetail } from './groupApi';
import type { SermonGroupCtx } from './GroupContext';
import { GroupCreate } from './GroupCreate';
import { GroupHome } from './GroupHome';
import { GroupNav } from './GroupNav';
import { removeShare, syncNoteShares, useGroupStore } from './groupStore';
import { SessionBand } from './SessionBand';
import { SessionView } from './SessionView';
import {
  autoMatches,
  slotKey,
  slotPhase,
  suggestMatches,
  weekSlots,
  weekStartOf,
  ymdLocal,
  type Suggestion,
} from './sessionMatch';
import './group.css';

/**
 * SermonTab 에 모임 기능을 붙이는 배선. SermonTab 은 돌려받은 조각을 제자리에 꽂기만 한다.
 *  - URL: ?group=<id> 모임 홈, ?session=<id>&group=<id> 설교 자리, ?adopt=<id> 참여 직후 지난 노트 데려오기
 *  - 노트를 열 때 예배 시간이면 자동 연결, 아니면 맞는 자리 제안
 *  - 연결된 노트가 저장될 때마다 공개 사본 동기화
 */
interface Args {
  store: SermonStore;
  userId: string;
  anonymous: boolean;
  notes: SermonNote[];
  openNote: SermonNote | undefined;
  setOpenId: (id: string | null) => void;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  onLogin?: () => void;
  displayName?: string;
}

export interface GroupWiring {
  ctx: SermonGroupCtx;
  groupNav: ReactNode;
  main: ReactNode;
  band: ReactNode;
  overlays: ReactNode;
  leaveMain: () => void;
}

const DAY = 86400000;

export function useGroupWiring({
  store,
  userId,
  anonymous,
  notes,
  openNote,
  setOpenId,
  searchParams,
  setSearchParams,
  onLogin,
  displayName,
}: Args): GroupWiring {
  const { currentUser } = useAuth();
  const myName = displayName || (currentUser?.name ? String(currentUser.name).slice(0, 20) : '');
  const gstore = useGroupStore(userId);
  const groupView = searchParams.get('group');
  const sessionView = searchParams.get('session');
  const adoptId = searchParams.get('adopt');
  const [createOpen, setCreateOpen] = useState(false);
  const [adopt, setAdopt] = useState<{
    groupId: string;
    items: Array<{ note: SermonNote; link: NoteGroupLink }>;
  } | null>(null);

  /* ── 이동 ── */
  const setView = useCallback(
    (patch: Record<string, string | null>, push = true) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(patch).forEach(([k, v]) => (v == null ? next.delete(k) : next.set(k, v)));
      setSearchParams(next, { replace: !push });
    },
    [searchParams, setSearchParams],
  );
  const openGroup = useCallback(
    (id: string) => {
      setOpenId(null);
      setView({ group: id, session: null });
    },
    [setOpenId, setView],
  );
  /** 여기서 연 설교 자리 — 닫을 때 기록을 한 칸 되돌린다 (시스템 뒤로와 같은 곳으로) */
  const pushedSession = useRef<string | null>(null);
  const navigate = useNavigate();
  const openSession = useCallback(
    (sid: string, gid: string) => {
      setOpenId(null);
      setView({ group: gid, session: sid });
      pushedSession.current = sid;
    },
    [setOpenId, setView],
  );
  const closeSession = useCallback(() => {
    if (pushedSession.current && pushedSession.current === searchParams.get('session')) {
      pushedSession.current = null;
      navigate(-1);
    } else setView({ session: null }, false);
  }, [navigate, searchParams, setView]);
  const leaveMain = useCallback(() => {
    if (searchParams.get('group') || searchParams.get('session'))
      setView({ group: null, session: null });
  }, [searchParams, setView]);

  /* ── 새 노트를 자리에 붙여서 열기 ── */
  const createLinked = useCallback(
    (fields: Partial<SermonNote>, link: NoteGroupLink) => {
      const base = newNote(store.all()[0]);
      const n = store.save({ ...base, ...fields, groups: [link] });
      setView({ group: null, session: null }, false);
      setOpenId(n.id);
    },
    [store, setOpenId, setView],
  );

  const startInSlot = useCallback(
    (groupId: string, serviceId: string, date: string) => {
      const g = gstore.get(groupId);
      if (!g) return;
      const svc = g.services.find((s) => s.id === serviceId);
      const sess = gstore
        .weekCached(groupId, weekStartOf(date))
        ?.sessions.find((s) => s.service_id === serviceId && s.date === date);
      const sl = weekSlots(g, weekStartOf(date)).find(
        (x) => x.service.id === serviceId && x.date === date,
      );
      const live = sl ? slotPhase(date, sl.start, sl.end, new Date()) === 'live' : false;
      createLinked(
        {
          date,
          service: svc?.name || '',
          ...(sess?.preacher ? { preacher: sess.preacher } : {}),
          ...(sess?.refs?.length ? { refs: sess.refs } : {}),
        },
        {
          group_id: groupId,
          service_id: serviceId,
          date,
          how: live ? 'auto' : 'manual',
          ...(sess ? { session_id: sess.id } : {}),
        },
      );
    },
    [gstore, createLinked],
  );

  const writeHere = useCallback(
    (groupId: string, d: SessionDetail) => {
      const g = gstore.get(groupId);
      const s = d.session;
      createLinked(
        {
          date: s.date,
          service: s.name || g?.services.find((x) => x.id === s.service_id)?.name || '',
          ...(s.preacher ? { preacher: s.preacher } : {}),
          ...(s.refs?.length ? { refs: s.refs } : {}),
        },
        {
          group_id: groupId,
          service_id: s.service_id ?? null,
          date: s.date,
          how: 'manual',
          session_id: s.id,
        },
      );
    },
    [gstore, createLinked],
  );

  /* ── 노트를 열 때 자동 연결 ── */
  const autoTried = useRef<string | null>(null);
  useEffect(() => {
    if (!openNote || anonymous || autoTried.current === openNote.id) return;
    autoTried.current = openNote.id;
    const hits = autoMatches(openNote, gstore.active(), new Date());
    if (!hits.length) return;
    const links: NoteGroupLink[] = [
      ...(openNote.groups || []),
      ...hits.map((h) => ({
        group_id: h.group_id,
        service_id: h.service_id,
        date: h.date,
        how: 'auto' as const,
      })),
    ];
    store.saveLinks(openNote.id, { groups: links, group_dismissed: openNote.group_dismissed });
    try {
      if (!localStorage.getItem('sermon-group-auto-told')) {
        localStorage.setItem('sermon-group-auto-told', '1');
        toast('예배 시간이라 모임과 같이 보는 노트가 됐어요 · 상관없으면 맨 위에서 뺄 수 있어요');
      }
    } catch {
      /* ignore */
    }
  }, [openNote, anonymous, gstore, store, gstore.groups.length]);

  /* ── 제안용 주간 자리 ── */
  const today = todayString();
  const thisWeek = weekStartOf(today);
  const lastWeek = useMemo(() => {
    const [y, m, d] = thisWeek.split('-').map(Number);
    return ymdLocal(new Date(y, m - 1, d - 7));
  }, [thisWeek]);
  useEffect(() => {
    if (anonymous) return;
    gstore.active().forEach((g) => {
      gstore.ensureWeek(g.id, thisWeek);
      if (openNote) gstore.ensureWeek(g.id, weekStartOf(openNote.date || today));
    });
  }, [anonymous, gstore, gstore.groups.length, thisWeek, openNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions: Suggestion[] = useMemo(() => {
    if (!openNote || anonymous) return [];
    const byGroup: Record<string, ReturnType<typeof gstore.sessionsFor>> = {};
    gstore.active().forEach((g) => (byGroup[g.id] = gstore.sessionsFor(g.id)));
    return suggestMatches(openNote, gstore.active(), byGroup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNote, anonymous, gstore, gstore.snapshot(), lastWeek]);

  /* ── 공개 사본 동기화 ── */
  const onLinked = useCallback(
    (noteId: string, links: NoteGroupLink[]) => {
      const cur = store.get(noteId);
      if (cur) store.saveLinks(noteId, { groups: links, group_dismissed: cur.group_dismissed });
    },
    [store],
  );
  useEffect(() => {
    if (anonymous) return;
    notes.forEach((n) => {
      if ((n.groups || []).length) syncNoteShares(gstore, n, onLinked);
    });
  }, [notes, anonymous, gstore, onLinked]);

  /* ── 참여 직후: 지난 노트 데려오기 ── */
  useEffect(() => {
    if (!adoptId || anonymous || store.status.loading || !gstore.loaded) return;
    const g = gstore.get(adoptId);
    setView({ adopt: null }, false);
    if (!g || g.me.status !== 'active') return;
    const since = Date.now() - 35 * DAY;
    const items = store
      .all()
      .filter(
        (n) => (n.created_at || 0) > since && !(n.groups || []).some((l) => l.group_id === g.id),
      )
      .flatMap((n) => {
        const hit = autoMatches(n, [g], new Date(n.created_at))[0];
        return hit
          ? [
              {
                note: n,
                link: {
                  group_id: g.id,
                  service_id: hit.service_id,
                  date: hit.date,
                  how: 'auto' as const,
                },
              },
            ]
          : [];
      });
    if (items.length) setAdopt({ groupId: g.id, items });
    else toast(`${g.name} 자리가 한 주 동안에 놓였어요`);
  }, [adoptId, anonymous, store, store.status.loading, gstore, gstore.loaded, setView]);

  /* ── 편집기 띠 동작 ── */
  const setNoteLink = useCallback(
    (noteId: string, groupId: string, patch: Partial<NoteGroupLink>) => {
      const cur = store.get(noteId);
      if (!cur) return;
      const groups = (cur.groups || []).map((l) =>
        l.group_id === groupId ? { ...l, ...patch } : l,
      );
      store.saveLinks(cur.id, { groups, group_dismissed: cur.group_dismissed });
      if (patch.off === true) toast('모임에서 뺐어요 · 다시 같이 볼 수 있어요');
      else if (patch.off === false) toast('다시 모임과 같이 봐요');
      else if (patch.private === false) toast('모임에 공개했어요');
    },
    [store],
  );
  const setLink = useCallback(
    (groupId: string, patch: Partial<NoteGroupLink>) => {
      if (openNote) setNoteLink(openNote.id, groupId, patch);
    },
    [openNote, setNoteLink],
  );
  const accept = useCallback(
    (s: Suggestion) => {
      if (!openNote) return;
      const cur = store.get(openNote.id);
      if (!cur) return;
      const old = (cur.groups || []).find((l) => l.group_id === s.group_id);
      if (old) void removeShare(old);
      const groups = [
        ...(cur.groups || []).filter((l) => l.group_id !== s.group_id),
        {
          group_id: s.group_id,
          service_id: s.session.service_id ?? null,
          date: s.session.date,
          how: 'suggest' as const,
          session_id: s.session.id,
        },
      ];
      store.saveLinks(cur.id, { groups, group_dismissed: cur.group_dismissed });
      toast('같은 설교 자리에 붙였어요');
    },
    [openNote, store],
  );
  const dismiss = useCallback(
    (s: Suggestion) => {
      if (!openNote) return;
      const cur = store.get(openNote.id);
      if (!cur) return;
      store.saveLinks(cur.id, {
        groups: cur.groups,
        group_dismissed: [
          ...new Set([
            ...(cur.group_dismissed || []),
            slotKey(s.group_id, s.session.service_id, s.session.date),
          ]),
        ],
      });
    },
    [openNote, store],
  );

  const ctx: SermonGroupCtx = useMemo(
    () => ({
      store: gstore,
      userId,
      anonymous,
      openGroup,
      openSession,
      openCreate: () => setCreateOpen(true),
      startInSlot,
      setNoteLink,
      onLogin,
    }),
    [gstore, userId, anonymous, openGroup, openSession, startInSlot, setNoteLink, onLogin],
  );

  const groupNav = (
    <GroupNav
      store={gstore}
      current={groupView}
      onOpen={openGroup}
      onCreate={() => setCreateOpen(true)}
      onLogin={onLogin}
    />
  );

  const main =
    !anonymous && groupView && sessionView ? (
      <SessionView
        key={sessionView}
        store={gstore}
        groupId={groupView}
        sessionId={sessionView}
        notes={notes}
        onBack={closeSession}
        onOpenNote={(id) => setOpenId(id)}
        onWriteHere={(d) => writeHere(groupView, d)}
      />
    ) : !anonymous && groupView ? (
      <GroupHome
        key={groupView}
        store={gstore}
        groupId={groupView}
        notes={notes}
        onOpenSession={(sid) => openSession(sid, groupView)}
        onStartInSlot={(svc, date) => startInSlot(groupView, svc, date)}
        onLeft={() => setView({ group: null, session: null })}
      />
    ) : null;

  const band = openNote ? (
    <SessionBand
      note={openNote}
      store={gstore}
      suggestions={suggestions}
      onOpenSession={openSession}
      onSetLink={setLink}
      onAccept={accept}
      onDismiss={dismiss}
    />
  ) : null;

  const overlays = (
    <>
      {!anonymous && (
        <GroupCreate
          open={createOpen}
          store={gstore}
          defaultName={myName}
          onClose={() => setCreateOpen(false)}
          onCreated={(g) => openGroup(g.id)}
        />
      )}
      <SnOverlay
        open={!!adopt}
        onClose={() => setAdopt(null)}
        className="sg-dialog"
        aria-labelledby="sg-adopt-title"
      >
        {adopt && (
          <>
            <div className="sn-shead">
              <h2 id="sg-adopt-title">이미 쓴 노트 {adopt.items.length}개</h2>
            </div>
            <div className="sg-form">
              <p className="sg-note">
                {gstore.get(adopt.groupId)?.name}의 예배 시간에 쓴 노트예요. 모임 설교에 붙이면 모임
                사람들과 같이 볼 수 있어요.
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
                {adopt.items.slice(0, 6).map(({ note }) => (
                  <li key={note.id}>
                    {note.date} · {note.title || '제목 없음'}
                  </li>
                ))}
              </ul>
            </div>
            <SnSheetBar onClose={() => setAdopt(null)} closeLabel="나중에">
              <button
                type="button"
                className="sn-btn sn-primary"
                onClick={() => {
                  adopt.items.forEach(({ note, link }) => {
                    const cur = store.get(note.id);
                    if (cur)
                      store.saveLinks(cur.id, {
                        groups: [...(cur.groups || []), link],
                        group_dismissed: cur.group_dismissed,
                      });
                  });
                  toast(`노트 ${adopt.items.length}개를 모임 설교에 붙였어요`);
                  setAdopt(null);
                }}
              >
                붙이기
              </button>
            </SnSheetBar>
          </>
        )}
      </SnOverlay>
    </>
  );

  return { ctx, groupNav, main, band, overlays, leaveMain };
}
