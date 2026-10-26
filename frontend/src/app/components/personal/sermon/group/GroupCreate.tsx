import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Loader2, Plus, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { SnOverlay } from '../SnOverlay';
import { Mascot, type MascotState } from '../Mascot';
import { loadLook, mascotName } from '../sermonLook';
import { todayString } from '../sermonTypes';
import {
  sermonGroupAPI,
  groupErrorMessage,
  type GroupKind,
  type GroupService,
  type SermonGroup,
} from './groupApi';
import {
  DOW_KO,
  GROUP_KINDS,
  SERVICE_PRESETS,
  kindName,
  newServiceId,
  slotsLabel,
} from './servicePresets';
import { weekSlots, weekStartOf } from './sessionMatch';
import { faceColor, initial, type GroupStore } from './groupStore';
import { inviteUrl, shareInvite } from './inviteLink';
import './group.css';

/**
 * 모임 만들기 = 「모임 스티커」 한 장 만들기.
 * 1 이름·종류 · 2 같이 드리는 예배(예배표) · 3 완성·초대.
 * 입력할 때마다 옆의 스티커가 바뀌고, 다 만들면 그 스티커가 한 주 동안에 붙는다.
 * 예배표가 이후 모든 노트를 같은 설교로 자동으로 묶는 열쇠라서 2단계가 핵심이다.
 * 움직임은 모두 group.css 에 있고 prefers-reduced-motion 이면 멈춘다.
 */
interface Props {
  open: boolean;
  store: GroupStore;
  defaultName?: string;
  onClose: () => void;
  onCreated: (g: SermonGroup) => void;
}

const STEPS = ['이름·종류', '같이 드리는 예배', '초대'] as const;
const TITLES = ['어떤 모임이에요?', '언제 같이 들어요?', '모임 스티커 완성!'] as const;

/**
 * 종류 그림 — 잉크 두 색으로만 그린다 (잉크 조합을 바꾸면 같이 바뀐다).
 * className 은 group.css 「종류 그림 움직임」의 부품 이름 — 고르거나 올려 보면 종류마다 다르게 움직인다.
 */
const KIND_ART: Record<GroupKind, ReactNode> = {
  church: (
    <>
      <circle className="k-a" cx="14" cy="17" r="6" fill="var(--sn-g1)" />
      <circle className="k-b" cx="26" cy="13" r="6" fill="var(--sn-g2)" />
      <circle className="k-c" cx="20" cy="25" r="6" fill="var(--sn-g1)" opacity=".8" />
    </>
  ),
  study: (
    <>
      <path className="k-l" d="M6 11c5-2 10-2 14 1v18c-4-3-9-3-14-1z" fill="var(--sn-g1)" />
      <path className="k-r" d="M34 11c-5-2-10-2-14 1v18c4-3 9-3 14-1z" fill="var(--sn-g2)" />
      <path className="k-mark" d="M24 12v14l2-2 2 2V11" fill="var(--sn-t2)" />
    </>
  ),
  family: (
    <>
      <path className="k-house" d="M7 19L20 8l13 11v13H7z" fill="var(--sn-g2)" />
      <rect className="k-door" x="16" y="22" width="8" height="10" rx="3" fill="var(--sn-g1)" />
      <path
        className="k-heart"
        d="M20 15.5c-1.6-2-4.4-.6-3.3 1.6L20 20l3.3-2.9c1.1-2.2-1.7-3.6-3.3-1.6z"
        fill="var(--sn-t2)"
      />
    </>
  ),
  friend: (
    <>
      <circle className="k-l" cx="15" cy="20" r="9" fill="var(--sn-g1)" />
      <circle className="k-r" cx="25" cy="20" r="9" fill="var(--sn-g2)" opacity=".85" />
    </>
  ),
  team: (
    <>
      <path
        className="k-stem"
        d="M16 28V11l14-3v16"
        stroke="var(--sn-t1)"
        strokeWidth="2.6"
        fill="none"
        strokeLinejoin="round"
      />
      <ellipse className="k-n1" cx="12.5" cy="28" rx="5" ry="4" fill="var(--sn-g2)" />
      <ellipse className="k-n2" cx="26.5" cy="25" rx="5" ry="4" fill="var(--sn-g1)" />
    </>
  ),
};

/** 한 주 시간표 줄 — 시작 시각으로 나눈다 */
const BANDS = [
  { id: 'dawn', name: '새벽', test: (t: string) => t < '07:00' },
  { id: 'am', name: '오전', test: (t: string) => t >= '07:00' && t < '12:00' },
  { id: 'pm', name: '오후', test: (t: string) => t >= '12:00' && t < '18:00' },
  { id: 'eve', name: '저녁', test: (t: string) => t >= '18:00' },
] as const;

export function GroupCreate({ open, store, defaultName = '', onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('church');
  const [myName, setMyName] = useState(defaultName);
  const [meetDow, setMeetDow] = useState<number | null>(null);
  const [meetTime, setMeetTime] = useState('19:00');
  const [services, setServices] = useState<GroupService[]>(() =>
    SERVICE_PRESETS.map((s) => ({ ...s })),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [approval, setApproval] = useState(true);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<SermonGroup | null>(null);
  const [typing, setTyping] = useState(false);
  const [bump, setBump] = useState(0);
  const [copied, setCopied] = useState(false);
  const copiedT = useRef<number>();
  const [mascot, setMascot] = useState(() => loadLook().mascot);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setDir('fwd');
    setName('');
    setKind('church');
    setMyName(defaultName);
    setMeetDow(null);
    setServices(SERVICE_PRESETS.map((s) => ({ ...s, slots: s.slots.map((x) => ({ ...x })) })));
    setEditing(null);
    setApproval(true);
    setCreated(null);
    setCopied(false);
    setMascot(loadLook().mascot);
  }, [open, defaultName]);

  useEffect(() => () => window.clearTimeout(copiedT.current), []);

  const preview = useMemo(() => {
    const fake = {
      services,
      me: { muted_service_ids: [] },
    } as unknown as SermonGroup;
    const ws = weekStartOf(todayString());
    return weekSlots(fake, ws);
  }, [services]);

  /** 한 주 시간표 칸: band × 요일 → 그 칸에 놓인 예배들 */
  const grid = useMemo(() => {
    const cells = new Map<string, GroupService[]>();
    services.forEach((s) => {
      if (!s.active) return;
      s.slots.forEach((sl) => {
        const band = BANDS.find((b) => b.test(sl.start));
        if (!band) return;
        const key = `${band.id}-${sl.dow}`;
        const arr = cells.get(key) || [];
        if (!arr.includes(s)) arr.push(s);
        cells.set(key, arr);
      });
    });
    const used = BANDS.filter((b) => [...cells.keys()].some((k) => k.startsWith(`${b.id}-`)));
    return { cells, bands: used.length ? used : BANDS.filter((b) => b.id !== 'dawn') };
  }, [services]);

  const canNext1 = name.trim().length > 0 && myName.trim().length > 0;
  const activeCount = services.filter((s) => s.active).length;
  const svcTone = (id: string) => (services.findIndex((s) => s.id === id) % 2 === 0 ? 1 : 2);

  const go = (to: number) => {
    setDir(to > step ? 'fwd' : 'back');
    setStep(to);
  };
  const poke = () => setBump((b) => b + 1);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const g = await sermonGroupAPI.create({
        name: name.trim().slice(0, 60),
        kind,
        meet_dow: meetDow,
        meet_time: meetDow == null ? null : meetTime,
        services: services.map((s) => ({ ...s, name: s.name.trim().slice(0, 20) || '예배' })),
        join_approval: approval,
        display_name: myName.trim().slice(0, 20),
        invite_expires_days: 30,
      });
      store.upsert(g);
      setCreated(g);
      go(3);
    } catch (e) {
      toast(groupErrorMessage(e, '모임을 만들지 못했어요'));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!created?.invite_code) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(created.invite_code));
      setCopied(true);
      window.clearTimeout(copiedT.current);
      copiedT.current = window.setTimeout(() => setCopied(false), 1800);
      toast('초대 링크를 복사했어요');
    } catch {
      toast('복사하지 못했어요');
    }
  };

  const updateService = (id: string, patch: Partial<GroupService>) =>
    setServices((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const stickerName = (created?.name ?? name).trim();
  const stickerSub =
    step === 1
      ? meetDow == null
        ? `${myName.trim() || '나'} · 1명`
        : `매주 ${DOW_KO[meetDow]} ${meetTime}`
      : activeCount
        ? services
            .filter((s) => s.active)
            .map((s) => s.name)
            .slice(0, 2)
            .join(' · ') + (activeCount > 2 ? ` 외 ${activeCount - 2}` : '')
        : '예배를 골라 주세요';
  const mascotState: MascotState = step === 3 ? 'done' : typing ? 'think' : 'idle';
  const hint =
    step === 1
      ? !name.trim()
        ? ['', '모임 이름', '을 적으면 넘어갈 수 있어요']
        : !myName.trim()
          ? ['', '불릴 이름', '을 적어 주세요']
          : ['다음은 ', '같이 드리는 예배', '를 골라요']
      : step === 2
        ? activeCount
          ? ['이번 주 자리 ', `${preview.length}개`, '가 한 주 동안에 놓여요']
          : ['예배를 ', '하나 이상', ' 골라 주세요']
        : [`${mascotName(mascot)}가 `, '한 주 동안', '에 붙여 뒀어요'];

  const sticker = (
    <div className="sg-stk" data-bump={bump % 2} data-drop={step === 3 || undefined}>
      <span className="sg-die" aria-hidden />
      <span className="sg-stk-face" aria-hidden />
      <div className="sg-stk-in">
        <span className="sg-stk-kind">{kindName(created?.kind ?? kind)}</span>
        <span className="sg-stk-name" data-ph={!stickerName || undefined}>
          {stickerName || '모임 이름'}
        </span>
        <span className="sg-stk-sub">{stickerSub}</span>
      </div>
      <Mascot kind={mascot} state={mascotState} size={60} className="sg-stk-m" />
      {step === 3 && (
        <span className="sg-burst" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ ['--a' as string]: `${i * 45 + 10}deg` }} />
          ))}
        </span>
      )}
    </div>
  );

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sg-dialog sg-make"
      aria-labelledby="sg-create-title"
      initialFocus="#sg-name"
    >
      <span className="sg-tape" aria-hidden />
      <div className="sg-mhead">
        <div className="sg-mttl">
          <small>모임 스티커 만들기</small>
          <h2 id="sg-create-title" key={step}>
            {TITLES[step - 1]}
          </h2>
        </div>
        <button
          type="button"
          className="sn-btn sn-icon-only sn-ghost"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="sn-icon" />
        </button>
      </div>
      <ol className="sg-pills" aria-label={`3단계 중 ${step}단계`}>
        {STEPS.map((label, i) => (
          <li
            key={label}
            data-state={step === i + 1 ? 'on' : step > i + 1 ? 'done' : undefined}
            aria-current={step === i + 1 ? 'step' : undefined}
          >
            <i>{step > i + 1 ? <Check size={12} strokeWidth={3} /> : i + 1}</i>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <div
        className="sg-mbody"
        data-step={step}
        onFocus={(e) => setTyping(e.target instanceof HTMLInputElement)}
        onBlur={() => setTyping(false)}
      >
        <div className="sg-maside" aria-live="polite">
          {sticker}
          {step < 3 && (
            <div className="sg-wk">
              <small>다 만들면 「한 주 동안」에 이렇게 놓여요</small>
              {preview.slice(0, 3).map((p) => (
                <span key={`${p.service.id}${p.date}`} className="sg-wk-slot">
                  <i />
                  {DOW_KO[new Date(`${p.date}T00:00:00`).getDay()]} {p.start.replace(/^0/, '')} ·{' '}
                  {p.service.name}
                </span>
              ))}
              {preview.length > 3 && <span className="sg-wk-more">+{preview.length - 3}</span>}
            </div>
          )}
        </div>

        <div className="sg-mform" key={step} data-dir={dir}>
          {step === 1 && (
            <>
              <label className="sg-mf" htmlFor="sg-name">
                <span className="sg-lb">모임 이름</span>
                <input
                  id="sg-name"
                  value={name}
                  maxLength={60}
                  placeholder="예: 청년부 2모임, 우리 가족"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="sg-mf">
                <span className="sg-lb" id="sg-kind-l">
                  종류<small>종류에 따라 참여 승인 기본값이 달라요</small>
                </span>
                <div className="sg-kinds" role="radiogroup" aria-labelledby="sg-kind-l">
                  {GROUP_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      role="radio"
                      className="sg-kind"
                      aria-checked={kind === k.id}
                      onClick={() => {
                        if (kind !== k.id) poke();
                        setKind(k.id);
                        setApproval(k.approval);
                      }}
                    >
                      {/* key 가 바뀌면 다시 그려져서, 고를 때마다 움직임이 처음부터 다시 나온다 */}
                      <svg
                        key={kind === k.id ? 'on' : 'off'}
                        viewBox="0 0 40 40"
                        data-kind={k.id}
                        aria-hidden
                      >
                        {KIND_ART[k.id]}
                      </svg>
                      <b>{k.name}</b>
                      <small>{k.hint}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="sg-who">
                <span
                  key={initial(myName)}
                  className="sg-me"
                  aria-hidden
                  style={{ background: faceColor(store.userId) }}
                >
                  {myName.trim() ? initial(myName) : '?'}
                </span>
                <label className="sg-mf" htmlFor="sg-myname">
                  <span className="sg-lb">
                    모임에서 불릴 이름<small>멤버들에게 이렇게 보여요</small>
                  </span>
                  <input
                    id="sg-myname"
                    value={myName}
                    maxLength={20}
                    onChange={(e) => setMyName(e.target.value)}
                  />
                </label>
              </div>
              <div className="sg-mf">
                <span className="sg-lb" id="sg-day-l">
                  정해진 모임 요일이 있나요?<small>없으면 비워 두세요</small>
                </span>
                <div className="sg-days" role="group" aria-labelledby="sg-day-l">
                  {[...DOW_KO].map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      className="sg-day"
                      data-sun={i === 0 || undefined}
                      aria-pressed={meetDow === i}
                      aria-label={`${d}요일`}
                      onClick={() => {
                        setMeetDow(meetDow === i ? null : i);
                        poke();
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="sg-dayrow" data-open={meetDow != null || undefined}>
                  <div>
                    <span>매주 {meetDow != null ? DOW_KO[meetDow] : ''}요일</span>
                    <input
                      type="time"
                      aria-label="모이는 시간"
                      value={meetTime}
                      tabIndex={meetDow == null ? -1 : undefined}
                      onChange={(e) => setMeetTime(e.target.value)}
                    />
                    <button
                      type="button"
                      className="sg-link-btn"
                      tabIndex={meetDow == null ? -1 : undefined}
                      onClick={() => {
                        setMeetDow(null);
                        poke();
                      }}
                    >
                      요일 지우기
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="sg-note">
                이 시간에 쓴 노트는 모임과 같은 설교로 자동으로 모여요. 나중에 바꿀 수 있어요.
              </p>
              <div className="sg-svstk" role="group" aria-label="같이 드리는 예배">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="sg-sv"
                    data-tone={svcTone(s.id)}
                    aria-pressed={s.active}
                    title={slotsLabel(s) || '시간 없음'}
                    onClick={() => {
                      updateService(s.id, { active: !s.active });
                      if (s.active && editing === s.id) setEditing(null);
                      poke();
                    }}
                  >
                    <span className="sg-sv-bx" aria-hidden>
                      <Check size={12} strokeWidth={3} />
                    </span>
                    {s.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="sg-sv sg-sv-add"
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
                    poke();
                  }}
                >
                  <Plus size={14} aria-hidden />
                  예배 추가
                </button>
              </div>
              <div className="sg-tt-wrap">
                <div
                  className="sg-tt"
                  style={{ gridTemplateRows: `auto repeat(${grid.bands.length}, 38px)` }}
                >
                  <span />
                  {[...DOW_KO].map((d, i) => (
                    <span key={d} className="sg-tt-h" data-sun={i === 0 || undefined}>
                      {d}
                    </span>
                  ))}
                  {grid.bands.map((b) => (
                    <Band key={b.id} name={b.name}>
                      {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
                        const list = grid.cells.get(`${b.id}-${dow}`) || [];
                        const s = list[0];
                        if (!s) return <span key={dow} className="sg-tt-c" />;
                        return (
                          <button
                            key={`${dow}-${s.id}`}
                            type="button"
                            className="sg-tt-c"
                            data-tone={svcTone(s.id)}
                            data-on
                            aria-pressed={editing === s.id}
                            aria-label={`${DOW_KO[dow]}요일 ${b.name} ${list.map((x) => x.name).join(', ')} — 시간 고치기`}
                            onClick={() => setEditing(editing === s.id ? null : s.id)}
                          >
                            {s.name.slice(0, 2)}
                            {list.length > 1 && <sup>+{list.length - 1}</sup>}
                          </button>
                        );
                      })}
                    </Band>
                  ))}
                </div>
              </div>
              <p className="sg-note sg-tt-hint">
                칸을 누르면 그 예배의 이름·시간을 고칠 수 있어요.
              </p>
              <div className="sg-unfold" data-open={!!editing || undefined}>
                <div>
                  {editing && services.some((s) => s.id === editing) && (
                    <ServiceEditor
                      service={services.find((s) => s.id === editing)!}
                      onChange={(next) => updateService(editing, next)}
                    />
                  )}
                </div>
              </div>
              <div className="sg-mf">
                <span className="sg-lb">참여 승인</span>
                <div className="sg-chips">
                  <button type="button" aria-pressed={approval} onClick={() => setApproval(true)}>
                    리더가 승인
                  </button>
                  <button type="button" aria-pressed={!approval} onClick={() => setApproval(false)}>
                    링크만 있으면 참여
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 3 && created && (
            <>
              <p className="sg-done-msg">
                <b>{created.name}</b> ·{' '}
                {created.services
                  .filter((s) => s.active)
                  .map((s) => s.name)
                  .join(' · ')}
                을 같이 기록해요. 이번 주 자리가 한 주 동안에 놓였어요.
              </p>
              {created.invite_code && (
                <div className="sg-ticket">
                  <small>초대 링크 · 30일 동안</small>
                  <code>{inviteUrl(created.invite_code)}</code>
                  <div className="sg-row">
                    <button
                      type="button"
                      className="sn-btn sn-primary"
                      onClick={() => void shareInvite(created)}
                    >
                      <Share2 className="sn-icon" />
                      초대 링크 보내기
                    </button>
                    <button
                      type="button"
                      className="sn-btn sg-copy"
                      data-done={copied || undefined}
                      onClick={() => void copyLink()}
                    >
                      {copied ? (
                        <Check key="ok" className="sn-icon" />
                      ) : (
                        <Copy key="cp" className="sn-icon" />
                      )}
                      {copied ? '복사했어요' : '복사'}
                    </button>
                  </div>
                </div>
              )}
              <p className="sg-note">
                {created.join_approval ? '참여 요청은 모임 홈에서 승인해요. ' : ''}링크는 모임
                설정에서 끄거나 새로 만들 수 있어요.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="sg-mfoot">
        <span className="sg-hint" key={hint.join('')}>
          {hint.map((h, i) => (i % 2 ? <b key={i}>{h}</b> : <span key={i}>{h}</span>))}
        </span>
        <div className="sg-row">
          {step === 2 && (
            <button type="button" className="sn-btn sn-ghost" onClick={() => go(1)}>
              이전
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              className="sn-btn sn-primary sg-go"
              data-ready={canNext1 || undefined}
              disabled={!canNext1}
              onClick={() => go(2)}
            >
              다음
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              className="sn-btn sn-primary sg-go"
              data-ready={activeCount > 0 || undefined}
              disabled={busy || activeCount === 0}
              onClick={() => void create()}
            >
              {busy && <Loader2 className="sn-icon animate-spin" />}
              모임 만들기
            </button>
          )}
          {step === 3 && created && (
            <button
              type="button"
              className="sn-btn sn-primary sg-go"
              data-ready
              onClick={() => {
                onCreated(created);
                onClose();
              }}
            >
              모임 홈으로
            </button>
          )}
        </div>
      </div>
    </SnOverlay>
  );
}

/** 시간표 한 줄 — 줄 이름 + 7칸 (grid 의 display:contents) */
function Band({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <span className="sg-tt-r">{name}</span>
      {children}
    </>
  );
}

/** 예배 하나의 이름·시간 고치기 */
export function ServiceEditor({
  service,
  onChange,
}: {
  service: GroupService;
  onChange: (next: Partial<GroupService>) => void;
}) {
  const setSlot = (i: number, patch: Partial<GroupService['slots'][number]>) =>
    onChange({ slots: service.slots.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <div
      className="sg-form"
      style={{ padding: 12, borderRadius: 14, background: 'var(--sn-surface-2)' }}
    >
      <label className="sg-field" htmlFor={`sg-svc-${service.id}`}>
        예배 이름
        <input
          id={`sg-svc-${service.id}`}
          value={service.name}
          maxLength={20}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      {service.slots.map((sl, i) => (
        <div key={i} className="sg-svc-edit">
          <select
            aria-label="요일"
            value={sl.dow}
            onChange={(e) => setSlot(i, { dow: Number(e.target.value) })}
          >
            {[...DOW_KO].map((d, k) => (
              <option key={d} value={k}>
                {d}요일
              </option>
            ))}
          </select>
          <input
            type="time"
            aria-label="시작"
            value={sl.start}
            onChange={(e) => setSlot(i, { start: e.target.value })}
          />
          <input
            type="time"
            aria-label="끝"
            value={sl.end}
            onChange={(e) => setSlot(i, { end: e.target.value })}
          />
          <input
            aria-label="부"
            placeholder="2부"
            maxLength={10}
            value={sl.part || ''}
            onChange={(e) => setSlot(i, { part: e.target.value || null })}
          />
          <button
            type="button"
            className="sn-btn sn-icon-only sn-ghost"
            aria-label="이 시간 지우기"
            disabled={service.slots.length <= 1}
            onClick={() => onChange({ slots: service.slots.filter((_, j) => j !== i) })}
          >
            <X className="sn-icon" />
          </button>
        </div>
      ))}
      {service.slots.length < 10 && (
        <button
          type="button"
          className="sg-chip"
          style={{ alignSelf: 'flex-start' }}
          onClick={() =>
            onChange({ slots: [...service.slots, { ...service.slots[service.slots.length - 1] }] })
          }
        >
          + 시간 추가 (1부·2부처럼)
        </button>
      )}
    </div>
  );
}
