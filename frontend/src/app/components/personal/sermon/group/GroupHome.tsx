import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Loader2, Plus, Settings2, Share2, Trash2, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { decRef, refLong } from '../bibleRefs';
import { Mascot } from '../Mascot';
import { loadLook, type MascotId } from '../sermonLook';
import { fmtDate, todayString, type SermonNote } from '../sermonTypes';
import {
  groupErrorMessage,
  sermonGroupAPI,
  type GroupService,
  type SermonGroup,
  type SessionSummary,
} from './groupApi';
import { Faces } from './Faces';
import { GroupSticker, stickerTilt, stickerTone } from './GroupSticker';
import { ServicePicker } from './ServicePicker';
import { inviteUrl, shareInvite } from './inviteLink';
import { faceColor, initial, josa, useWeek, type GroupStore } from './groupStore';
import { DOW_KO, kindName, meetLabel } from './servicePresets';
import { slotPhase, weekSlots, weekStartOf, ymdLocal } from './sessionMatch';
import './group.css';

/**
 * 모임 홈 — 「같이 쓰는 한 권의 다이어리」.
 * 표지 카드(모임 스티커) + 인덱스 탭: 이번 주 · 지난 주들 · 멤버 · 설정
 * 이번 주는 설교 자리를 날짜 칸으로, 쓴 자리엔 노트 스티커가 붙고 아직인 자리는 점선.
 */
interface Props {
  store: GroupStore;
  groupId: string;
  notes: SermonNote[];
  onOpenSession: (sessionId: string) => void;
  onStartInSlot: (serviceId: string, date: string) => void;
  onLeft: () => void;
}

type Tab = 'week' | 'last' | 'members' | 'settings';

/** 지난 주들 — 몇 주까지 띠에 놓을지 */
const PAST_WEEKS = 12;

function addDays(ds: string, n: number): string {
  const [y, m, d] = ds.split('-').map(Number);
  return ymdLocal(new Date(y, m - 1, d + n));
}

function md(ds: string): string {
  const [, m, d] = ds.split('-').map(Number);
  return `${m}.${d}`;
}

/** "10월 넷째 주" — 그 주 수요일이 속한 달 기준 */
function weekTitle(start: string): string {
  const [, m, d] = addDays(start, 3).split('-').map(Number);
  const nth = ['첫째', '둘째', '셋째', '넷째', '다섯째'][Math.min(4, Math.floor((d - 1) / 7))];
  return `${m}월 ${nth} 주`;
}

function isLeaderOf(g: SermonGroup) {
  return g.me.role === 'leader' || g.me.role === 'co_leader';
}

export function GroupHome({ store, groupId, notes, onOpenSession, onStartInSlot, onLeft }: Props) {
  const group = store.get(groupId);
  const [tab, setTab] = useState<Tab>('week');
  const [mascot] = useState<MascotId>(() => loadLook().mascot);
  const thisWeek = weekStartOf(todayString());
  const [past, setPast] = useState(() => addDays(thisWeek, -7));
  const activeId = group && group.me.status === 'active' ? groupId : null;
  const start = tab === 'last' ? past : thisWeek;
  const week = useWeek(store, activeId, start);
  const nowWeek = useWeek(store, activeId, thisWeek);

  // 지난 주들 띠의 점을 그리려고 12주를 미리 받아 둔다 (60초 캐시·중복 요청 없음)
  useEffect(() => {
    if (tab !== 'last' || !activeId) return;
    for (let i = 1; i <= PAST_WEEKS; i++) store.ensureWeek(activeId, addDays(thisWeek, -7 * i));
  }, [tab, activeId, store, thisWeek]);

  if (!group) {
    return (
      <div className="sg-page">
        <div className="sg-empty">
          <Mascot kind={mascot} size={72} state="think" />
          모임을 찾을 수 없어요. 나갔거나 삭제된 모임일 수 있어요.
        </div>
      </div>
    );
  }

  const isLeader = isLeaderOf(group);
  const active = group.members.filter((m) => m.status === 'active');
  const pending = group.members.filter((m) => m.status === 'pending');
  const leader = group.members.find((m) => m.role === 'leader');
  const total = (nowWeek?.sessions || []).reduce((n, s) => n + (s.members || []).length, 0);
  const svcNames = group.services.filter((s) => s.active).map((s) => s.name);

  const tabs: Array<[Tab, string]> = [
    ['week', '이번 주'],
    ['last', '지난 주들'],
    ['members', `멤버 ${active.length}`],
  ];

  return (
    <div className="sg-page">
      <header className="sg-cover">
        <span className="sg-cover-tape" aria-hidden />
        <GroupSticker
          name={group.name}
          size={96}
          tone={stickerTone(group.id)}
          tilt={stickerTilt(group.id)}
        />
        <div className="sg-cover-in">
          <small>
            {kindName(group.kind)}
            {leader ? ` · 리더 ${leader.display_name}` : ''}
          </small>
          <h2>{group.name}</h2>
          <div className="sg-cover-chips">
            {svcNames.length ? (
              svcNames.map((n) => (
                <span key={n} className="sg-tagchip">
                  {n}
                </span>
              ))
            ) : (
              <span className="sg-tagchip" data-off>
                예배표 없음
              </span>
            )}
            {group.meet_dow != null && (
              <span className="sg-tagchip">{meetLabel(group.meet_dow, group.meet_time)} 모임</span>
            )}
            {group.me.status === 'active' && (
              <span className="sg-tagchip" data-tone="2">
                이번 주 노트 {total}편
              </span>
            )}
            {isLeader && pending.length > 0 && (
              <button
                type="button"
                className="sg-tagchip"
                data-tone="2"
                data-btn
                onClick={() => setTab('members')}
              >
                참여 요청 {pending.length}
              </button>
            )}
          </div>
        </div>
        <Faces people={active} max={5} size={30} className="sg-cover-faces" />
      </header>

      {group.me.status === 'pending' ? (
        <div className="sg-quiet">
          <Mascot kind={mascot} size={72} state="think" />
          <p className="sg-hand">리더 승인을 기다리는 중이에요</p>
          <p className="sg-note">
            노트는 지금처럼 써 두세요. 승인되면 이번 주 노트가 자동으로 모임에 보여요.
          </p>
        </div>
      ) : (
        <>
          <div className="sg-itabs" role="tablist" aria-label="모임 보기">
            {tabs.map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
              >
                {l}
                {k === 'members' && isLeader && pending.length > 0 && (
                  <i className="sg-itab-dot" aria-label={`참여 요청 ${pending.length}`} />
                )}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              className="sg-itab-gear"
              aria-selected={tab === 'settings'}
              onClick={() => setTab('settings')}
            >
              <Settings2 className="sn-icon" aria-hidden />
              설정
            </button>
          </div>

          <div className="sg-leaf" key={tab === 'last' ? `last-${past}` : tab}>
            {tab === 'week' && (week?.pokes_for_me || []).length > 0 && (
              <div className="sg-say">
                <Mascot kind={mascot} size={40} />
                <p>
                  <b>{(week?.pokes_for_me || []).map((p) => p.from_name).join(', ')}</b> 님이 이번
                  주 설교를 같이 쓰자고 했어요.
                </p>
              </div>
            )}
            {tab === 'last' && (
              <WeekStrip
                store={store}
                group={group}
                thisWeek={thisWeek}
                selected={past}
                onSelect={setPast}
              />
            )}
            {(tab === 'week' || tab === 'last') && (
              <WeekView
                group={group}
                start={start}
                past={tab === 'last'}
                sessions={week?.sessions}
                notes={notes}
                mascot={mascot}
                onOpenSession={onOpenSession}
                onStartInSlot={onStartInSlot}
                onOpened={(s) => {
                  store.patchSession(groupId, s);
                  void store.loadWeek(groupId, start);
                  onOpenSession(s.id);
                }}
              />
            )}
            {tab === 'members' && (
              <Members
                store={store}
                group={group}
                mascot={mascot}
                sessions={nowWeek?.sessions}
                onSettings={() => setTab('settings')}
              />
            )}
            {tab === 'settings' && <Settings store={store} group={group} onLeft={onLeft} />}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────── 지난 주들 띠 ───────── */

function WeekStrip({
  store,
  group,
  thisWeek,
  selected,
  onSelect,
}: {
  store: GroupStore;
  group: SermonGroup;
  thisWeek: string;
  selected: string;
  onSelect: (start: string) => void;
}) {
  const weeks = Array.from({ length: PAST_WEEKS }, (_, i) => addDays(thisWeek, -7 * (i + 1)));
  return (
    <div className="sg-wstrip" role="group" aria-label="지난 주 고르기">
      {weeks.map((w) => {
        const data = store.weekCached(group.id, w);
        const slots = weekSlots(group, w);
        const sessions = data?.sessions || [];
        const extra = sessions.filter(
          (s) => !slots.some((sl) => sl.service.id === s.service_id && sl.date === s.date),
        ).length;
        const n = Math.min(6, slots.length + extra);
        const filled = Math.min(n, sessions.filter((s) => (s.members || []).length > 0).length);
        return (
          <button
            key={w}
            type="button"
            className="sg-wpill"
            aria-pressed={selected === w}
            aria-label={`${md(w)} 주${data ? ` · 기록 ${filled}곳` : ''}`}
            onClick={() => onSelect(w)}
          >
            <b>{md(w)}</b>
            <span className="sg-wdots" aria-hidden data-loading={!data || undefined}>
              {Array.from({ length: Math.max(1, n) }, (_, i) => (
                <i key={i} data-on={i < filled || undefined} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────── 한 주 펼침면 ───────── */

function WeekView({
  group,
  start,
  past,
  sessions,
  notes,
  mascot,
  onOpenSession,
  onStartInSlot,
  onOpened,
}: {
  group: SermonGroup;
  start: string;
  past: boolean;
  sessions?: SessionSummary[];
  notes: SermonNote[];
  mascot: MascotId;
  onOpenSession: (id: string) => void;
  onStartInSlot: (serviceId: string, date: string) => void;
  onOpened: (s: SessionSummary) => void;
}) {
  const [opening, setOpening] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => (past ? start : todayString()));
  const now = new Date();
  const today = ymdLocal(now);
  const slots = useMemo(() => weekSlots(group, start), [group, start]);
  const memberName = new Map(group.members.map((m) => [m.user_id, m.display_name]));
  const activeMembers = group.members.filter((m) => m.status === 'active');
  const galpiByNote = new Set(notes.filter((n) => n.bookmarked_at).map((n) => n.id));

  type Row = {
    key: string;
    date: string;
    label: string;
    start?: string;
    end?: string;
    session?: SessionSummary;
    serviceId?: string;
  };
  const rows: Row[] = slots.map((sl) => ({
    key: `${sl.service.id}|${sl.date}`,
    date: sl.date,
    label: `${sl.service.name}${sl.part ? ` · ${sl.part}` : ''}`,
    start: sl.start,
    end: sl.end,
    serviceId: sl.service.id,
    session: (sessions || []).find((s) => s.service_id === sl.service.id && s.date === sl.date),
  }));
  (sessions || [])
    .filter((s) => !rows.some((r) => r.session?.id === s.id))
    .forEach((s) =>
      rows.push({
        key: s.id,
        date: s.date,
        label: s.name || group.services.find((x) => x.id === s.service_id)?.name || '설교',
        session: s,
      }),
    );
  rows.sort((a, b) => (a.date + (a.start || '99')).localeCompare(b.date + (b.start || '99')));

  const quiet =
    past && !!sessions && rows.every((r) => !(r.session?.members || []).length) && rows.length > 0;

  const openForm = !opening ? (
    <button type="button" className="sg-extra" onClick={() => setOpening(true)}>
      <span className="sg-extra-plus" aria-hidden>
        <Plus size={16} />
      </span>
      예배표에 없는 설교 자리 열기
      <small>특별집회 · 수련회</small>
    </button>
  ) : (
    <div className="sg-setcard">
      <label className="sg-field" htmlFor="sg-open-name">
        자리 이름
        <input
          id="sg-open-name"
          value={name}
          maxLength={60}
          placeholder="예: 가을 특별새벽기도 1일차"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="sg-field" htmlFor="sg-open-date">
        날짜
        <input
          id="sg-open-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <div className="sg-row">
        <button
          type="button"
          className="sn-btn sn-primary"
          disabled={!name.trim() || !date}
          onClick={async () => {
            try {
              const s = await sermonGroupAPI.openSession(group.id, { name: name.trim(), date });
              setOpening(false);
              setName('');
              onOpened(s);
            } catch (e) {
              toast(groupErrorMessage(e, '자리를 열지 못했어요'));
            }
          }}
        >
          열기
        </button>
        <button type="button" className="sn-btn" onClick={() => setOpening(false)}>
          취소
        </button>
      </div>
    </div>
  );

  return (
    <div className="sg-week">
      <div className="sg-wkh">
        <b>{weekTitle(start)}</b>
        <span className="sg-hand">
          {md(start)} 일 – {md(addDays(start, 6))} 토
        </span>
      </div>

      {!sessions && (
        <div className="sg-empty" role="status" aria-label="불러오는 중">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sn-accent)' }} />
        </div>
      )}

      {sessions && !rows.length && (
        <div className="sg-quiet">
          <Mascot kind={mascot} size={64} state="think" />
          <p className="sg-hand">이 주엔 같이 드리는 예배가 없어요</p>
          <p className="sg-note">설정에서 예배표를 켜거나, 아래에서 자리를 직접 열 수 있어요.</p>
        </div>
      )}

      {quiet ? (
        <div className="sg-quiet">
          <Mascot kind={mascot} size={68} state="sleep" />
          <p className="sg-hand">이 주는 조용히 지나갔어요</p>
          <p className="sg-note">지금 노트를 쓰면 그 주 자리에 붙어요.</p>
          <div className="sg-ghosts">
            {rows.map((r) => {
              const dd = Number(r.date.slice(8));
              return (
                <button
                  key={r.key}
                  type="button"
                  className="sg-ghost"
                  onClick={() =>
                    r.session
                      ? onOpenSession(r.session.id)
                      : r.serviceId && onStartInSlot(r.serviceId, r.date)
                  }
                >
                  <i>{dd}</i>
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        sessions &&
        rows.length > 0 && (
          <div className="sg-days">
            {rows.map((r, idx) => {
              const s = r.session;
              const phase =
                r.start && r.end
                  ? slotPhase(r.date, r.start, r.end, now)
                  : r.date > today
                    ? 'before'
                    : 'after';
              const ref = (s?.refs || []).map(decRef).find(Boolean);
              const writers = (s?.members || []).map((m) => ({
                user_id: m.user_id,
                display_name: memberName.get(m.user_id) || '?',
              }));
              const waiting =
                phase === 'before'
                  ? []
                  : activeMembers
                      .filter((m) => !writers.some((w) => w.user_id === m.user_id))
                      .map((m) => ({ ...m, off: true }));
              const galpi = notes.some(
                (n) =>
                  galpiByNote.has(n.id) && (n.groups || []).some((l) => l.session_id === s?.id),
              );
              const [y, mm, dd] = r.date.split('-').map(Number);
              const dow = DOW_KO[new Date(y, mm - 1, dd).getDay()];
              const title = s?.title || (ref ? refLong(ref) : '');
              const sub = [
                ref && s?.title ? refLong(ref) : '',
                s?.preacher || '',
                s?.updated_by_name ? `${josa(s.updated_by_name, '이', '가')} 채움` : '',
              ]
                .filter(Boolean)
                .join(' · ');
              const placeholder =
                phase === 'before'
                  ? '이 자리는 비어 있어요'
                  : phase === 'live'
                    ? '지금 예배 시간이에요'
                    : writers.length
                      ? '아직 제목 없는 설교'
                      : '아직 아무도 쓰지 않은 자리';
              const hand =
                phase === 'before'
                  ? '예배 시간에 노트를 열면 여기 붙어요'
                  : phase === 'live'
                    ? '눌러서 같이 쓰기'
                    : !title && writers.length
                      ? '✎ 제목·본문 아는 사람이 적어 주세요'
                      : !writers.length
                        ? '지금 써도 이 자리에 붙어요'
                        : '';
              const click = () => {
                if (s) onOpenSession(s.id);
                else if (r.serviceId) onStartInSlot(r.serviceId, r.date);
              };
              return (
                <button
                  key={r.key}
                  type="button"
                  className="sg-dcard"
                  data-phase={phase}
                  data-galpi={galpi || undefined}
                  data-empty={(!s && phase === 'before') || undefined}
                  style={{ ['--i' as string]: idx }}
                  onClick={click}
                >
                  <span className="sg-dnum">
                    <b>{dd}</b>
                    <small>{dow}</small>
                    {r.date === today && <em>오늘</em>}
                  </span>
                  <span className="sg-dbody">
                    <small className="sg-dsvc">
                      {r.label}
                      {r.start ? ` · ${r.start}` : ''}
                      {galpi && <span className="sg-badge">내 갈피</span>}
                    </small>
                    <b className="sg-dttl" data-ph={!title || undefined}>
                      {title || placeholder}
                    </b>
                    {sub && <span className="sg-dref">{sub}</span>}
                    {hand && (
                      <span className="sg-hand sg-dhand" data-live={phase === 'live' || undefined}>
                        {hand}
                      </span>
                    )}
                    {(writers.length > 0 || waiting.length > 0) && (
                      <span className="sg-drow">
                        <Faces people={[...writers, ...waiting]} max={6} size={24} />
                        {writers.length > 0 && <small>{writers.length}명 썼어요</small>}
                      </span>
                    )}
                  </span>
                  {writers.length > 0 && (
                    <span className="sg-pins" aria-hidden>
                      {writers.slice(0, 3).map((w, i) => (
                        <i key={w.user_id} data-tone={(i % 3) + 1}>
                          {initial(w.display_name)}
                        </i>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )
      )}

      {openForm}
    </div>
  );
}

/* ───────── 멤버 — 이름표 모음 ───────── */

function Members({
  store,
  group,
  mascot,
  sessions,
  onSettings,
}: {
  store: GroupStore;
  group: SermonGroup;
  mascot: MascotId;
  sessions?: SessionSummary[];
  onSettings: () => void;
}) {
  const isLeader = isLeaderOf(group);
  const [copied, setCopied] = useState(false);
  const roleName = { leader: '리더', co_leader: '함께 리더', member: '' } as const;
  const written = (uid: string) =>
    (sessions || []).filter((s) => (s.members || []).some((m) => m.user_id === uid)).length;
  const run = async (fn: () => Promise<SermonGroup | void>, ok?: string) => {
    try {
      const g = await fn();
      if (g) store.upsert(g);
      else void store.refresh();
      if (ok) toast(ok);
    } catch (e) {
      toast(groupErrorMessage(e));
    }
  };
  const members = [...group.members].sort(
    (a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'),
  );

  return (
    <div className="sg-week">
      <div className="sg-tags">
        {members.map((m, idx) => {
          const me = m.user_id === group.me.user_id;
          const n = written(m.user_id);
          return (
            <div
              key={m.user_id}
              className="sg-ntag"
              data-pending={m.status === 'pending' || undefined}
              style={{ ['--i' as string]: idx }}
            >
              <span className="sg-ntag-hole" aria-hidden />
              {me ? (
                <Mascot kind={mascot} size={52} />
              ) : (
                <span
                  className="sg-ntag-face"
                  aria-hidden
                  style={{ background: faceColor(m.user_id) }}
                >
                  {initial(m.display_name)}
                </span>
              )}
              <b>
                {m.display_name}
                {me && <small> 나</small>}
              </b>
              {m.status === 'active' && roleName[m.role] && (
                <span className="sg-ntag-role">{roleName[m.role]}</span>
              )}
              <span className="sg-ntag-wk" data-on={n > 0 || undefined}>
                {m.status === 'pending' ? '참여 요청' : n ? `이번 주 ${n}편 꽂음` : '이번 주 아직'}
              </span>
              {isLeader && !me && m.role !== 'leader' && (
                <span className="sg-ntag-acts">
                  {m.status === 'pending' && (
                    <button
                      type="button"
                      className="sn-btn sn-primary"
                      onClick={() =>
                        void run(
                          () => sermonGroupAPI.approve(group.id, m.user_id),
                          `${m.display_name} 님이 참여했어요`,
                        )
                      }
                    >
                      <Check className="sn-icon" />
                      받기
                    </button>
                  )}
                  {group.me.role === 'leader' && m.status === 'active' && (
                    <button
                      type="button"
                      className="sg-chip"
                      onClick={() =>
                        void run(() =>
                          sermonGroupAPI.setRole(
                            group.id,
                            m.user_id,
                            m.role === 'co_leader' ? 'member' : 'co_leader',
                          ),
                        )
                      }
                    >
                      {m.role === 'co_leader' ? '함께 리더 해제' : '함께 리더로'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="sn-btn sn-icon-only sn-ghost"
                    aria-label={
                      m.status === 'pending'
                        ? `${m.display_name} 요청 거절`
                        : `${m.display_name} 내보내기`
                    }
                    onClick={() =>
                      void run(
                        () => sermonGroupAPI.kick(group.id, m.user_id),
                        m.status === 'pending' ? '요청을 거절했어요' : '내보냈어요',
                      )
                    }
                  >
                    <UserMinus className="sn-icon" />
                  </button>
                </span>
              )}
            </div>
          );
        })}
        {isLeader && group.invite_code && (
          <button
            type="button"
            className="sg-ntag sg-ntag-seat"
            onClick={() => void shareInvite(group)}
          >
            <span className="sg-ntag-plus" aria-hidden>
              <Plus size={20} />
            </span>
            <b>빈 자리</b>
            <span className="sg-ntag-wk">초대 티켓 보내기</span>
          </button>
        )}
      </div>

      {isLeader &&
        (group.invite_code ? (
          <div className="sg-iticket">
            <div className="sg-iticket-l">
              <small>
                초대 티켓 ·{' '}
                {group.invite_expires_at
                  ? `${fmtDate(group.invite_expires_at.slice(0, 10))}까지`
                  : '기한 없음'}
              </small>
              <code>{inviteUrl(group.invite_code)}</code>
              <span className="sg-note">
                {group.join_approval ? '리더가 승인하면 들어와요' : '링크만 있으면 바로 들어와요'}
              </span>
            </div>
            <div className="sg-iticket-r">
              <button
                type="button"
                className="sn-btn sn-primary"
                onClick={() => void shareInvite(group)}
              >
                <Share2 className="sn-icon" />
                보내기
              </button>
              <button
                type="button"
                className="sn-btn sg-copy"
                data-done={copied || undefined}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl(group.invite_code as string));
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                    toast('복사했어요');
                  } catch {
                    toast('복사하지 못했어요');
                  }
                }}
              >
                {copied ? <Check className="sn-icon" /> : <Copy className="sn-icon" />}
                {copied ? '복사했어요' : '복사'}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="sg-extra" onClick={onSettings}>
            초대 링크가 꺼져 있어요 · 설정에서 새 링크 만들기
          </button>
        ))}
    </div>
  );
}

/* ───────── 설정 — 카드 세 장 + 접힌 위험 칸 ───────── */

type SaveState = 'idle' | 'saving' | 'saved';

function SavedMark({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <span className="sg-saved" data-state={state} role="status">
      {state === 'saving' ? '저장 중…' : '✓ 저장됨'}
    </span>
  );
}

/** 값이 바뀌고 0.7초 멈추면 저장 — 처음 값과 같으면 아무것도 안 한다 */
function useAutoSave(
  key: string,
  base: string,
  valid: boolean,
  save: () => Promise<void>,
): SaveState {
  const [state, setState] = useState<SaveState>('idle');
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (key === base || !valid) return;
    const t = window.setTimeout(async () => {
      setState('saving');
      try {
        await saveRef.current();
        setState('saved');
      } catch (e) {
        toast(groupErrorMessage(e, '저장하지 못했어요'));
        setState('idle');
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [key, base, valid]);
  return state;
}

function Settings({
  store,
  group,
  onLeft,
}: {
  store: GroupStore;
  group: SermonGroup;
  onLeft: () => void;
}) {
  const isLeader = isLeaderOf(group);
  const [myName, setMyName] = useState(group.me.display_name);
  const [muted, setMuted] = useState<string[]>(group.me.muted_service_ids || []);
  const [name, setName] = useState(group.name);
  const [services, setServices] = useState<GroupService[]>(group.services);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);

  const mutedKey = (xs: string[]) => [...xs].sort().join(',');
  const meState = useAutoSave(
    `${myName.trim()}|${mutedKey(muted)}`,
    `${group.me.display_name}|${mutedKey(group.me.muted_service_ids || [])}`,
    !!myName.trim(),
    async () => {
      store.upsert(
        await sermonGroupAPI.updateMe(group.id, {
          display_name: myName.trim(),
          muted_service_ids: muted,
        }),
      );
    },
  );
  const nameState = useAutoSave(name.trim(), group.name, isLeader && !!name.trim(), async () => {
    store.upsert(await sermonGroupAPI.update(group.id, { name: name.trim() }));
  });

  const svcDirty = JSON.stringify(services) !== JSON.stringify(group.services);

  const act = async (fn: () => Promise<SermonGroup>, ok: string) => {
    setBusy(true);
    try {
      store.upsert(await fn());
      toast(ok);
    } catch (e) {
      toast(groupErrorMessage(e, '저장하지 못했어요'));
    } finally {
      setBusy(false);
    }
  };

  const activeServices = group.services.filter((s) => s.active);

  return (
    <div className="sg-week">
      <section className="sg-setcard" aria-labelledby="sg-set-me">
        <h3 id="sg-set-me">
          <span className="sg-label-stk">나</span>이 모임에서의 나
          <SavedMark state={meState} />
        </h3>
        <label className="sg-field" htmlFor="sg-set-myname">
          불릴 이름
          <input
            id="sg-set-myname"
            value={myName}
            maxLength={20}
            onChange={(e) => setMyName(e.target.value)}
          />
        </label>
        {activeServices.length > 0 && (
          <div className="sg-field">
            <span>
              내가 드리는 예배{' '}
              <span style={{ fontWeight: 500 }}>· 끈 예배 시간의 노트는 모임에 붙지 않아요</span>
            </span>
            <div className="sg-svstk">
              {activeServices.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className="sg-sv"
                  data-tone={i % 2 ? 2 : 1}
                  aria-pressed={!muted.includes(s.id)}
                  onClick={() =>
                    setMuted((m) => (m.includes(s.id) ? m.filter((x) => x !== s.id) : [...m, s.id]))
                  }
                >
                  <span className="sg-sv-bx" aria-hidden>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {isLeader && (
        <section className="sg-setcard" aria-labelledby="sg-set-svc">
          <h3 id="sg-set-svc">
            <span className="sg-label-stk" data-tone="1">
              예배표
            </span>
            모임이 같이 드리는 예배
            <SavedMark state={nameState} />
          </h3>
          <label className="sg-field" htmlFor="sg-set-name">
            모임 이름
            <input
              id="sg-set-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <ServicePicker
            services={services}
            onChange={setServices}
            editing={editing}
            onEditing={setEditing}
          />
          <div className="sg-apply" data-open={svcDirty || undefined}>
            <div>
              <div className="sg-apply-in">
                <span className="sg-hand">적용하면 이번 주 자리가 바로 바뀌어요</span>
                <div className="sg-row">
                  <button
                    type="button"
                    className="sn-btn sn-ghost"
                    tabIndex={svcDirty ? undefined : -1}
                    onClick={() => {
                      setServices(group.services);
                      setEditing(null);
                    }}
                  >
                    되돌리기
                  </button>
                  <button
                    type="button"
                    className="sn-btn sn-primary"
                    tabIndex={svcDirty ? undefined : -1}
                    disabled={busy || !services.some((s) => s.active)}
                    onClick={() =>
                      void act(async () => {
                        const g = await sermonGroupAPI.update(group.id, { services });
                        setServices(g.services);
                        setEditing(null);
                        return g;
                      }, '예배표를 적용했어요 · 한 주 동안에 바로 반영돼요')
                    }
                  >
                    {busy && <Loader2 className="sn-icon animate-spin" />}
                    적용
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {isLeader && (
        <section className="sg-setcard" aria-labelledby="sg-set-inv">
          <h3 id="sg-set-inv">
            <span className="sg-label-stk" data-tone="3">
              초대
            </span>
            들어오는 방법
          </h3>
          <div className="sg-svstk" role="radiogroup" aria-label="참여 승인">
            {(
              [
                [true, '리더가 승인'],
                [false, '링크만 있으면 참여'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={l}
                type="button"
                role="radio"
                className="sg-sv"
                data-tone={v ? 1 : 2}
                aria-checked={group.join_approval === v}
                aria-pressed={group.join_approval === v}
                disabled={busy}
                onClick={() =>
                  group.join_approval !== v &&
                  void act(() => sermonGroupAPI.update(group.id, { join_approval: v }), '바꿨어요')
                }
              >
                <span className="sg-sv-bx" aria-hidden>
                  <Check size={12} strokeWidth={3} />
                </span>
                {l}
              </button>
            ))}
          </div>
          <p className="sg-note">
            {group.invite_code
              ? `초대 링크 ${
                  group.invite_expires_at
                    ? `${fmtDate(group.invite_expires_at.slice(0, 10))}까지 유효`
                    : '기한 없음'
                } · 보내기는 멤버 탭에서`
              : '초대 링크가 꺼져 있어요.'}
          </p>
          <div className="sg-row">
            <button
              type="button"
              className="sg-chip"
              disabled={busy}
              onClick={() =>
                void act(
                  () => sermonGroupAPI.renewInvite(group.id, 30),
                  '새 링크를 만들었어요 (30일)',
                )
              }
            >
              {group.invite_code ? '새 링크로 바꾸기' : '새 링크 만들기'}
            </button>
            {group.invite_code && (
              <button
                type="button"
                className="sg-chip"
                disabled={busy}
                onClick={() =>
                  void act(() => sermonGroupAPI.disableInvite(group.id), '링크를 껐어요')
                }
              >
                링크 끄기
              </button>
            )}
          </div>
        </section>
      )}

      <details className="sg-danger">
        <summary>
          {group.me.role === 'leader' ? '모임 나가기 · 모임 지우기' : '모임 나가기'}
        </summary>
        <div className="sg-danger-in">
          <LeaveButton store={store} group={group} onLeft={onLeft} />
          {group.me.role === 'leader' &&
            (delConfirm ? (
              <div className="sg-danger-confirm">
                <p className="sg-note">
                  모임과 멤버들이 올린 조각이 모두 지워져요(30일 보관 뒤 완전 삭제). 각자의 노트
                  원본은 남아요.
                </p>
                <div className="sg-row">
                  <button
                    type="button"
                    className="sn-btn sg-danger-btn"
                    onClick={async () => {
                      try {
                        await sermonGroupAPI.remove(group.id);
                        store.remove(group.id);
                        toast('모임을 지웠어요');
                        onLeft();
                      } catch (e) {
                        toast(groupErrorMessage(e, '지우지 못했어요'));
                      }
                    }}
                  >
                    <Trash2 className="sn-icon" />
                    {group.name} 지우기
                  </button>
                  <button type="button" className="sn-btn" onClick={() => setDelConfirm(false)}>
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="sg-chip" onClick={() => setDelConfirm(true)}>
                모임 지우기
              </button>
            ))}
        </div>
      </details>
    </div>
  );
}

function LeaveButton({
  store,
  group,
  onLeft,
}: {
  store: GroupStore;
  group: SermonGroup;
  onLeft: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="sg-danger-confirm">
      <p className="sg-note">
        모임을 나가면 이 모임에 올린 내 노트 조각과 반응이 함께 지워져요. 내 노트 원본은 그대로
        남아요.
      </p>
      <div className="sg-row">
        <button
          type="button"
          className="sn-btn sg-danger-btn"
          onClick={async () => {
            try {
              await sermonGroupAPI.leave(group.id);
              store.remove(group.id);
              toast('모임에서 나왔어요');
              onLeft();
            } catch (e) {
              toast(groupErrorMessage(e, '나가지 못했어요'));
            }
          }}
        >
          나가기
        </button>
        <button type="button" className="sn-btn" onClick={() => setConfirm(false)}>
          취소
        </button>
      </div>
    </div>
  ) : (
    <button type="button" className="sg-chip" onClick={() => setConfirm(true)}>
      모임 나가기
    </button>
  );
}
