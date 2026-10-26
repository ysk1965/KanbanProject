import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Plus, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { SnOverlay } from '../SnOverlay';
import { todayString } from '../sermonTypes';
import {
  sermonGroupAPI,
  groupErrorMessage,
  type GroupKind,
  type GroupService,
  type SermonGroup,
} from './groupApi';
import { DOW_KO, GROUP_KINDS, SERVICE_PRESETS, newServiceId, slotsLabel } from './servicePresets';
import { weekSlots, weekStartOf } from './sessionMatch';
import type { GroupStore } from './groupStore';
import { inviteUrl, shareInvite } from './inviteLink';
import './group.css';

/**
 * 모임 만들기 — 1 이름·종류 · 2 같이 드리는 예배(예배표) · 3 초대.
 * 예배표가 이후 모든 노트를 같은 설교로 자동으로 묶는 열쇠라서 2단계가 핵심이다.
 */
interface Props {
  open: boolean;
  store: GroupStore;
  defaultName?: string;
  onClose: () => void;
  onCreated: (g: SermonGroup) => void;
}

export function GroupCreate({ open, store, defaultName = '', onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
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

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName('');
    setKind('church');
    setMyName(defaultName);
    setMeetDow(null);
    setServices(SERVICE_PRESETS.map((s) => ({ ...s, slots: s.slots.map((x) => ({ ...x })) })));
    setEditing(null);
    setApproval(true);
    setCreated(null);
  }, [open, defaultName]);

  const preview = useMemo(() => {
    const fake = {
      services,
      me: { muted_service_ids: [] },
    } as unknown as SermonGroup;
    const ws = weekStartOf(todayString());
    return weekSlots(fake, ws);
  }, [services]);

  const canNext1 = name.trim().length > 0 && myName.trim().length > 0;
  const activeCount = services.filter((s) => s.active).length;

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
      setStep(3);
    } catch (e) {
      toast(groupErrorMessage(e, '모임을 만들지 못했어요'));
    } finally {
      setBusy(false);
    }
  };

  const updateService = (id: string, patch: Partial<GroupService>) =>
    setServices((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sg-dialog"
      aria-labelledby="sg-create-title"
    >
      <div className="sn-shead">
        <h2 id="sg-create-title">
          {step === 1 ? '새 모임' : step === 2 ? '같이 드리는 예배' : '모임이 만들어졌어요'}
        </h2>
        <button
          type="button"
          className="sn-btn sn-icon-only sn-ghost"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="sn-icon" />
        </button>
      </div>
      <div className="sg-steps" aria-hidden>
        {[1, 2, 3].map((i) => (
          <i key={i} data-on={step >= i || undefined} />
        ))}
      </div>

      {step === 1 && (
        <div className="sg-form">
          <label className="sg-field" htmlFor="sg-name">
            모임 이름
            <input
              id="sg-name"
              value={name}
              maxLength={60}
              placeholder="예: 청년부 2모임, 우리 가족"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="sg-field">
            종류
            <div className="sg-chips" role="radiogroup" aria-label="모임 종류">
              {GROUP_KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.id}
                  aria-pressed={kind === k.id}
                  onClick={() => {
                    setKind(k.id);
                    setApproval(k.approval);
                  }}
                >
                  {k.name}
                  <small>{k.hint}</small>
                </button>
              ))}
            </div>
          </div>
          <label className="sg-field" htmlFor="sg-myname">
            모임에서 쓸 내 이름
            <input
              id="sg-myname"
              value={myName}
              maxLength={20}
              onChange={(e) => setMyName(e.target.value)}
            />
          </label>
          <div className="sg-field">
            모이는 날 (선택)
            <div className="sg-chips">
              <button type="button" aria-pressed={meetDow == null} onClick={() => setMeetDow(null)}>
                없음
              </button>
              {[...DOW_KO].map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={meetDow === i}
                  onClick={() => setMeetDow(i)}
                >
                  {d}
                </button>
              ))}
            </div>
            {meetDow != null && (
              <input
                type="time"
                aria-label="모이는 시간"
                value={meetTime}
                onChange={(e) => setMeetTime(e.target.value)}
              />
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="sg-form">
          <p className="sg-note">
            이 시간에 쓴 노트는 모임과 같은 설교로 자동으로 모여요. 나중에 바꿀 수 있어요.
          </p>
          <div className="sg-svcs">
            {services.map((s) => (
              <button
                key={s.id}
                type="button"
                className="sg-svc"
                aria-pressed={s.active}
                onClick={() => updateService(s.id, { active: !s.active })}
              >
                <span className="sg-bx" aria-hidden>
                  {s.active && <Check size={13} />}
                </span>
                <span>
                  <b>{s.name}</b>
                  <small>{slotsLabel(s) || '시간 없음'}</small>
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
            {services
              .filter((s) => s.active)
              .map((s) => (
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
          {editing && (
            <ServiceEditor
              service={services.find((s) => s.id === editing)!}
              onChange={(next) => updateService(editing, next)}
            />
          )}
          <div className="sg-preview">
            이번 주 자리 미리보기 ·{' '}
            {preview.length ? (
              preview.map((p, i) => (
                <span key={`${p.service.id}${p.date}`}>
                  {i > 0 && ', '}
                  <b>
                    {Number(p.date.slice(8))}일 {p.service.name}
                  </b>
                </span>
              ))
            ) : (
              <b>예배를 하나 이상 골라 주세요</b>
            )}
            {preview.length > 0 && ' 가 한 주 동안에 놓여요'}
          </div>
          <div className="sg-field">
            참여 승인
            <div className="sg-chips">
              <button type="button" aria-pressed={approval} onClick={() => setApproval(true)}>
                리더가 승인
              </button>
              <button type="button" aria-pressed={!approval} onClick={() => setApproval(false)}>
                링크만 있으면 참여
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && created && (
        <div className="sg-form">
          <div className="sg-preview">
            <b>{created.name}</b> ·{' '}
            {created.services
              .filter((s) => s.active)
              .map((s) => s.name)
              .join(' · ')}
            을 같이 기록해요. 이번 주 자리가 한 주 동안에 놓였어요.
          </div>
          {created.invite_code && (
            <div className="sg-link">
              <span style={{ flex: 1 }}>{inviteUrl(created.invite_code)}</span>
            </div>
          )}
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
              className="sn-btn"
              onClick={async () => {
                if (!created.invite_code) return;
                try {
                  await navigator.clipboard.writeText(inviteUrl(created.invite_code));
                  toast('초대 링크를 복사했어요');
                } catch {
                  toast('복사하지 못했어요');
                }
              }}
            >
              <Copy className="sn-icon" />
              복사
            </button>
          </div>
          <p className="sg-note">
            30일 동안 유효해요. {created.join_approval ? '참여 요청은 모임 홈에서 승인해요.' : ''}{' '}
            링크는 모임 설정에서 끄거나 새로 만들 수 있어요.
          </p>
        </div>
      )}

      <div className="sg-foot">
        {step === 1 && (
          <>
            <span />
            <button
              type="button"
              className="sn-btn sn-primary"
              disabled={!canNext1}
              onClick={() => setStep(2)}
            >
              다음
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <button type="button" className="sn-btn sn-ghost" onClick={() => setStep(1)}>
              이전
            </button>
            <button
              type="button"
              className="sn-btn sn-primary"
              disabled={busy || activeCount === 0}
              onClick={() => void create()}
            >
              {busy && <Loader2 className="sn-icon animate-spin" />}
              모임 만들기
            </button>
          </>
        )}
        {step === 3 && created && (
          <>
            <span />
            <button
              type="button"
              className="sn-btn sn-primary"
              onClick={() => {
                onCreated(created);
                onClose();
              }}
            >
              모임 홈으로
            </button>
          </>
        )}
      </div>
    </SnOverlay>
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
