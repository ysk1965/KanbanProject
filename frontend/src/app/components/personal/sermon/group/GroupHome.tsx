import { useMemo, useState } from 'react';
import { Check, Copy, Link2Off, Loader2, Plus, Share2, Trash2, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { decRef, refLong } from '../bibleRefs';
import { fmtDate, todayString, type SermonNote } from '../sermonTypes';
import {
  groupErrorMessage,
  sermonGroupAPI,
  type GroupService,
  type SermonGroup,
  type SessionSummary,
} from './groupApi';
import { Faces } from './Faces';
import { ServiceEditor } from './GroupCreate';
import { inviteUrl, shareInvite } from './inviteLink';
import { josa, useWeek, type GroupStore } from './groupStore';
import {
  DOW_KO,
  kindName,
  meetLabel,
  newServiceId,
  servicesLabel,
  slotsLabel,
} from './servicePresets';
import { slotPhase, weekSlots, weekStartOf, ymdLocal } from './sessionMatch';
import './group.css';

/**
 * 모임 홈 — 「우리 모임의 한 주」. 이번 주 설교 자리를 시간순으로, 자리마다 기록한 멤버 얼굴.
 * 탭: 이번 주 · 지난 주 · 멤버 · 설정
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

function addDays(ds: string, n: number): string {
  const [y, m, d] = ds.split('-').map(Number);
  return ymdLocal(new Date(y, m - 1, d + n));
}

export function GroupHome({ store, groupId, notes, onOpenSession, onStartInSlot, onLeft }: Props) {
  const group = store.get(groupId);
  const [tab, setTab] = useState<Tab>('week');
  const thisWeek = weekStartOf(todayString());
  const start = tab === 'last' ? addDays(thisWeek, -7) : thisWeek;
  const week = useWeek(store, group && group.me.status === 'active' ? groupId : null, start);

  if (!group) {
    return (
      <div className="sg-page">
        <div className="sg-empty">모임을 찾을 수 없어요. 나갔거나 삭제된 모임일 수 있어요.</div>
      </div>
    );
  }

  const isLeader = group.me.role === 'leader' || group.me.role === 'co_leader';
  const active = group.members.filter((m) => m.status === 'active');
  const pending = group.members.filter((m) => m.status === 'pending');
  const total = (week?.sessions || []).reduce((n, s) => n + (s.members || []).length, 0);

  return (
    <div className="sg-page">
      <div className="sg-hero">
        <div style={{ minWidth: 0 }}>
          <small>
            {kindName(group.kind)} · {servicesLabel(group.services) || '예배표 없음'}
            {group.meet_dow != null ? ` · ${meetLabel(group.meet_dow, group.meet_time)} 모임` : ''}
          </small>
          <h2>{group.name}</h2>
          <p>
            멤버 {active.length}명
            {group.me.status === 'active' && (
              <>
                {' '}
                · <b>이번 주 노트 {total}개</b>
              </>
            )}
            {isLeader && pending.length > 0 && (
              <>
                {' '}
                · <b>참여 요청 {pending.length}</b>
              </>
            )}
          </p>
        </div>
        <Faces people={active} max={5} size={34} />
      </div>

      {group.me.status === 'pending' ? (
        <div className="sg-empty">
          리더 승인을 기다리는 중이에요.
          <span className="sg-note">
            노트는 지금처럼 써 두세요. 승인되면 이번 주 노트가 자동으로 모임에 보여요.
          </span>
        </div>
      ) : (
        <>
          <div className="sg-tabs" role="tablist" aria-label="모임 보기">
            {(
              [
                ['week', '이번 주'],
                ['last', '지난 주'],
                ['members', isLeader && pending.length ? `멤버 · 요청 ${pending.length}` : '멤버'],
                ['settings', '설정'],
              ] as Array<[Tab, string]>
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
              >
                {l}
              </button>
            ))}
          </div>

          {(tab === 'week' || tab === 'last') && (
            <WeekList
              group={group}
              start={start}
              sessions={week?.sessions}
              notes={notes}
              onOpenSession={onOpenSession}
              onStartInSlot={onStartInSlot}
              onOpened={(s) => {
                store.patchSession(groupId, s);
                void store.loadWeek(groupId, start);
                onOpenSession(s.id);
              }}
            />
          )}
          {tab === 'week' && (week?.pokes_for_me || []).length > 0 && (
            <p className="sg-note">
              {(week?.pokes_for_me || []).map((p) => p.from_name).join(', ')} 님이 이번 주 설교를
              같이 쓰자고 했어요.
            </p>
          )}
          {tab === 'members' && <Members store={store} group={group} onLeft={onLeft} />}
          {tab === 'settings' && <Settings store={store} group={group} onLeft={onLeft} />}
        </>
      )}
    </div>
  );
}

function WeekList({
  group,
  start,
  sessions,
  notes,
  onOpenSession,
  onStartInSlot,
  onOpened,
}: {
  group: SermonGroup;
  start: string;
  sessions?: SessionSummary[];
  notes: SermonNote[];
  onOpenSession: (id: string) => void;
  onStartInSlot: (serviceId: string, date: string) => void;
  onOpened: (s: SessionSummary) => void;
}) {
  const [opening, setOpening] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayString());
  const now = new Date();
  const slots = useMemo(() => weekSlots(group, start), [group, start]);
  const memberName = new Map(group.members.map((m) => [m.user_id, m.display_name]));
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

  return (
    <div className="sg-list">
      {!sessions && (
        <div className="sg-empty" role="status" aria-label="불러오는 중">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--sn-accent)' }} />
        </div>
      )}
      {rows.map((r) => {
        const s = r.session;
        const phase =
          r.start && r.end
            ? slotPhase(r.date, r.start, r.end, now)
            : r.date > ymdLocal(now)
              ? 'before'
              : 'after';
        const ref = (s?.refs || []).map(decRef).find(Boolean);
        const writers = (s?.members || []).map((m) => ({
          user_id: m.user_id,
          display_name: memberName.get(m.user_id) || '?',
        }));
        const galpi = notes.some(
          (n) => galpiByNote.has(n.id) && (n.groups || []).some((l) => l.session_id === s?.id),
        );
        const [, mm, dd] = r.date.split('-').map(Number);
        const dow = DOW_KO[new Date(Number(r.date.slice(0, 4)), mm - 1, dd).getDay()];
        const click = () => {
          if (s) onOpenSession(s.id);
          else if (r.serviceId && phase !== 'after') onStartInSlot(r.serviceId, r.date);
          else if (r.serviceId) onStartInSlot(r.serviceId, r.date);
        };
        return (
          <button
            key={r.key}
            type="button"
            className="sg-card"
            data-phase={phase}
            data-galpi={galpi || undefined}
            data-empty={!s && phase === 'before' ? true : undefined}
            onClick={click}
          >
            <span className="sg-dt">
              <b>{dd}</b>
              <small>
                {dow}
                {r.date === ymdLocal(now) ? ' · 오늘' : ''}
              </small>
            </span>
            <span className="sg-ti">
              <small>
                {r.label}
                {r.start ? ` · ${r.start}` : ''}
                {galpi && <span className="sg-badge">내 갈피</span>}
              </small>
              <b>
                {s?.title ||
                  (ref
                    ? refLong(ref)
                    : phase === 'before'
                      ? '예배 시간에 노트를 열면 여기에 모여요'
                      : phase === 'live'
                        ? '지금 예배 시간이에요 · 눌러서 같이 쓰기'
                        : writers.length
                          ? '설교 정보를 아는 사람이 채워 주세요'
                          : '아무도 기록하지 않았어요')}
              </b>
              <span>
                {[
                  ref && s?.title ? refLong(ref) : '',
                  s?.preacher || '',
                  s?.updated_by_name ? `${josa(s.updated_by_name, '이', '가')} 채움` : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || (writers.length ? `${writers.length}명 기록` : '')}
              </span>
            </span>
            <Faces people={writers} max={5} size={24} />
          </button>
        );
      })}
      {!opening ? (
        <button
          type="button"
          className="sg-chip"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setOpening(true)}
        >
          + 예배표에 없는 설교 자리 열기 (특별집회 등)
        </button>
      ) : (
        <div className="sg-share">
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
      )}
    </div>
  );
}

function Members({
  store,
  group,
  onLeft,
}: {
  store: GroupStore;
  group: SermonGroup;
  onLeft: () => void;
}) {
  const isLeader = group.me.role === 'leader' || group.me.role === 'co_leader';
  const roleName = { leader: '리더', co_leader: '함께 리더', member: '' } as const;
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
  return (
    <div className="sg-list">
      {group.members.map((m) => (
        <div
          key={m.user_id}
          className="sg-card"
          style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}
        >
          <Faces people={[m]} max={1} size={34} />
          <span className="sg-ti">
            <b>
              {m.display_name}
              {m.user_id === group.me.user_id ? ' (나)' : ''}
            </b>
            <span>{m.status === 'pending' ? '참여 요청' : roleName[m.role]}</span>
          </span>
          <span className="sg-row">
            {isLeader && m.status === 'pending' && (
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
                승인
              </button>
            )}
            {group.me.role === 'leader' &&
              m.status === 'active' &&
              m.user_id !== group.me.user_id && (
                <button
                  type="button"
                  className="sn-btn"
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
            {isLeader && m.role !== 'leader' && m.user_id !== group.me.user_id && (
              <button
                type="button"
                className="sn-btn"
                aria-label={`${m.display_name} 내보내기`}
                onClick={() =>
                  void run(
                    () => sermonGroupAPI.kick(group.id, m.user_id),
                    m.status === 'pending' ? '요청을 거절했어요' : '내보냈어요',
                  )
                }
              >
                <UserMinus className="sn-icon" />
              </button>
            )}
          </span>
        </div>
      ))}
      <LeaveButton store={store} group={group} onLeft={onLeft} />
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
    <div className="sg-share">
      <p className="sg-note">
        모임을 나가면 이 모임에 올린 내 노트 조각과 반응이 함께 지워져요. 내 노트 원본은 그대로
        남아요.
      </p>
      <div className="sg-row">
        <button
          type="button"
          className="sn-btn sn-primary"
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
    <button
      type="button"
      className="sg-chip"
      style={{ alignSelf: 'flex-start' }}
      onClick={() => setConfirm(true)}
    >
      모임 나가기
    </button>
  );
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
  const isLeader = group.me.role === 'leader' || group.me.role === 'co_leader';
  const [services, setServices] = useState<GroupService[]>(group.services);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState(group.name);
  const [myName, setMyName] = useState(group.me.display_name);
  const [muted, setMuted] = useState<string[]>(group.me.muted_service_ids || []);
  const [busy, setBusy] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);

  const save = async (fn: () => Promise<SermonGroup>, ok: string) => {
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

  return (
    <div className="sg-list">
      <section className="sg-share">
        <b>나</b>
        <label className="sg-field" htmlFor="sg-set-myname">
          모임에서 쓸 내 이름
          <input
            id="sg-set-myname"
            value={myName}
            maxLength={20}
            onChange={(e) => setMyName(e.target.value)}
          />
        </label>
        <div className="sg-field">
          내가 드리는 예배{' '}
          <span style={{ fontWeight: 500 }}>· 끈 예배 시간의 노트는 모임에 붙지 않아요</span>
          <div className="sg-chips">
            {group.services
              .filter((s) => s.active)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={!muted.includes(s.id)}
                  onClick={() =>
                    setMuted((m) => (m.includes(s.id) ? m.filter((x) => x !== s.id) : [...m, s.id]))
                  }
                >
                  {s.name}
                </button>
              ))}
          </div>
        </div>
        <button
          type="button"
          className="sn-btn sn-primary"
          style={{ alignSelf: 'flex-start' }}
          disabled={busy || !myName.trim()}
          onClick={() =>
            void save(
              () =>
                sermonGroupAPI.updateMe(group.id, {
                  display_name: myName.trim(),
                  muted_service_ids: muted,
                }),
              '저장했어요',
            )
          }
        >
          저장
        </button>
      </section>

      {isLeader && (
        <section className="sg-share">
          <b>초대 링크</b>
          {group.invite_code ? (
            <>
              <div className="sg-link">{inviteUrl(group.invite_code)}</div>
              <p className="sg-note">
                {group.invite_expires_at
                  ? `${fmtDate(group.invite_expires_at.slice(0, 10))}까지 유효`
                  : '기한 없음'}{' '}
                · {group.join_approval ? '리더가 승인' : '링크만 있으면 참여'}
              </p>
            </>
          ) : (
            <p className="sg-note">초대 링크가 꺼져 있어요.</p>
          )}
          <div className="sg-row">
            {group.invite_code && (
              <>
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
                  className="sn-btn"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteUrl(group.invite_code as string));
                      toast('복사했어요');
                    } catch {
                      toast('복사하지 못했어요');
                    }
                  }}
                >
                  <Copy className="sn-icon" />
                  복사
                </button>
              </>
            )}
            <button
              type="button"
              className="sn-btn"
              onClick={() =>
                void save(
                  () => sermonGroupAPI.renewInvite(group.id, 30),
                  '새 링크를 만들었어요 (30일)',
                )
              }
            >
              새 링크
            </button>
            {group.invite_code && (
              <button
                type="button"
                className="sn-btn"
                onClick={() =>
                  void save(() => sermonGroupAPI.disableInvite(group.id), '링크를 껐어요')
                }
              >
                <Link2Off className="sn-icon" />
                끄기
              </button>
            )}
            <button
              type="button"
              className="sn-btn"
              onClick={() =>
                void save(
                  () => sermonGroupAPI.update(group.id, { join_approval: !group.join_approval }),
                  '바꿨어요',
                )
              }
            >
              {group.join_approval ? '승인 없이 참여' : '리더 승인 켜기'}
            </button>
          </div>
        </section>
      )}

      {isLeader && (
        <section className="sg-share">
          <b>모임 · 같이 드리는 예배</b>
          <label className="sg-field" htmlFor="sg-set-name">
            모임 이름
            <input
              id="sg-set-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="sg-svcs">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                className="sg-svc"
                aria-pressed={s.active}
                onClick={() =>
                  setServices((ss) =>
                    ss.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)),
                  )
                }
              >
                <span className="sg-bx" aria-hidden>
                  {s.active && <Check size={13} />}
                </span>
                <span>
                  <b>{s.name}</b>
                  <small>{slotsLabel(s)}</small>
                </span>
              </button>
            ))}
            <button
              type="button"
              className="sg-svc"
              style={{ borderStyle: 'dashed' }}
              onClick={() => {
                const id = newServiceId(services);
                setServices((ss) => [
                  ...ss,
                  {
                    id,
                    name: '새 예배',
                    active: true,
                    slots: [{ dow: 0, start: '11:00', end: '12:20' }],
                  },
                ]);
                setEditing(id);
              }}
            >
              <Plus size={16} aria-hidden />
              <b>예배 추가</b>
            </button>
          </div>
          <div className="sg-row">
            <span className="sg-note">시간 고치기</span>
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                className="sg-chip"
                aria-pressed={editing === s.id}
                onClick={() => setEditing(editing === s.id ? null : s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
          {editing && services.some((s) => s.id === editing) && (
            <ServiceEditor
              service={services.find((s) => s.id === editing)!}
              onChange={(next) =>
                setServices((ss) => ss.map((x) => (x.id === editing ? { ...x, ...next } : x)))
              }
            />
          )}
          <button
            type="button"
            className="sn-btn sn-primary"
            style={{ alignSelf: 'flex-start' }}
            disabled={busy || !name.trim() || !services.some((s) => s.active)}
            onClick={() =>
              void save(
                () => sermonGroupAPI.update(group.id, { name: name.trim(), services }),
                '예배표를 저장했어요 · 한 주 동안에 바로 반영돼요',
              )
            }
          >
            저장
          </button>
          <p className="sg-note">
            예배를 끄거나 시간을 바꾸면 이번 주 「한 주 동안」 자리가 바로 바뀌어요.
          </p>
        </section>
      )}

      {group.me.role === 'leader' && (
        <section className="sg-share">
          <b>모임 삭제</b>
          {delConfirm ? (
            <>
              <p className="sg-note">
                모임과 멤버들이 올린 조각이 모두 지워져요(30일 보관 뒤 완전 삭제). 각자의 노트
                원본은 남아요.
              </p>
              <div className="sg-row">
                <button
                  type="button"
                  className="sn-btn sn-primary"
                  onClick={async () => {
                    try {
                      await sermonGroupAPI.remove(group.id);
                      store.remove(group.id);
                      toast('모임을 삭제했어요');
                      onLeft();
                    } catch (e) {
                      toast(groupErrorMessage(e, '삭제하지 못했어요'));
                    }
                  }}
                >
                  <Trash2 className="sn-icon" />
                  삭제
                </button>
                <button type="button" className="sn-btn" onClick={() => setDelConfirm(false)}>
                  취소
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="sg-chip"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setDelConfirm(true)}
            >
              모임 삭제하기
            </button>
          )}
        </section>
      )}
    </div>
  );
}
