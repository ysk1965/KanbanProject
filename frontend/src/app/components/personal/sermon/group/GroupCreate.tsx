import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { SnOverlay, afterSheetClose } from '../SnOverlay';
import { SnSheetBar } from '../SnSheetBar';
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
import { DOW_KO, GROUP_KINDS, SERVICE_PRESETS, kindName } from './servicePresets';
import { weekSlots, weekStartOf } from './sessionMatch';
import { faceColor, initial, type GroupStore } from './groupStore';
import { inviteUrl, shareInvite } from './inviteLink';
import { GroupSticker } from './GroupSticker';
import { ServicePicker } from './ServicePicker';
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

export function GroupCreate({ open, store, defaultName = '', onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('church');
  const [myName, setMyName] = useState(defaultName);
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

  /** 오른쪽 「한 주 동안」 — 요일·예배마다 한 줄, 시각은 모두 ("일 9:00 · 11:00 · 주일 설교") */
  const weekRows = useMemo(() => {
    const rows: Array<{ key: string; label: string; tone: 1 | 2 }> = [];
    for (let d = 0; d < 7; d++) {
      services.forEach((s, i) => {
        if (!s.active) return;
        const times = [...new Set(s.slots.filter((x) => x.dow === d).map((x) => x.start))].sort();
        if (!times.length) return;
        rows.push({
          key: `${d}-${s.id}`,
          label: `${DOW_KO[d]} ${times.map((t) => t.replace(/^0/, '')).join(' · ')} · ${s.name}`,
          tone: i % 2 === 0 ? 1 : 2,
        });
      });
    }
    return rows;
  }, [services]);

  const canNext1 = name.trim().length > 0 && myName.trim().length > 0;
  const activeCount = services.filter((s) => s.active).length;

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

  const stickerName = (created?.name ?? name).trim();
  const stickerSub =
    step === 1
      ? `${myName.trim() || '나'} · 1명`
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
    <GroupSticker
      name={stickerName}
      kind={kindName(created?.kind ?? kind)}
      sub={stickerSub}
      data-bump={bump % 2}
      data-drop={step === 3 || undefined}
    >
      <Mascot kind={mascot} state={mascotState} size={60} className="sg-stk-m" />
      {step === 3 && (
        <span className="sg-burst" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ ['--a' as string]: `${i * 45 + 10}deg` }} />
          ))}
        </span>
      )}
    </GroupSticker>
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
              {weekRows.slice(0, 4).map((r) => (
                <span key={r.key} className="sg-wk-slot" data-tone={r.tone}>
                  <i />
                  {r.label}
                </span>
              ))}
              {weekRows.length > 4 && <span className="sg-wk-more">+{weekRows.length - 4}</span>}
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
            </>
          )}

          {step === 2 && (
            <>
              <p className="sg-note">
                이 시간에 쓴 노트는 모임과 같은 설교로 자동으로 모여요. 나중에 바꿀 수 있어요.
              </p>
              <ServicePicker
                services={services}
                onChange={setServices}
                editing={editing}
                onEditing={setEditing}
                onPoke={poke}
              />
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
                      data-tapfx="share"
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

      <SnSheetBar
        onClose={step === 2 ? () => go(1) : onClose}
        closeLabel={step === 2 ? '이전' : '닫기'}
        back={step === 2}
        note={
          <span className="sg-hint" key={hint.join('')}>
            {hint.map((h, i) => (i % 2 ? <b key={i}>{h}</b> : <span key={i}>{h}</span>))}
          </span>
        }
      >
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
              onClose();
              afterSheetClose(() => onCreated(created));
            }}
          >
            모임 홈으로
          </button>
        )}
      </SnSheetBar>
    </SnOverlay>
  );
}
