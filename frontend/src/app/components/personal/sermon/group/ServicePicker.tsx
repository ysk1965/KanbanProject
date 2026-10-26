import { useEffect, useState } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import type { GroupService, ServiceSlot } from './groupApi';
import { DOW_KO, newServiceId, timesSummary } from './servicePresets';

/** 끝 시각은 묻지 않는다 — 자동 연결 범위(시작 −30분 ~ 끝 +3시간)용으로 시작 + 90분을 넣어 둔다 */
const DEFAULT_LEN = 90;
/** 예배에 흔한 시각 — 고르기 판 첫 줄 */
const COMMON = ['05:30', '07:00', '09:00', '11:00', '13:30', '15:00', '19:30', '21:00'];

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toT = (m: number) => {
  const v = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
const short = (t: string) => t.replace(/^0/, '');
/** 시작을 옮기면 끝도 같은 만큼 — 자정을 넘기지 않게 23:59 에서 멈춘다 */
const endFor = (start: string, len = DEFAULT_LEN) => toT(Math.min(toMin(start) + len, 1439));
const lenOf = (sl: ServiceSlot) => Math.max(30, toMin(sl.end) - toMin(sl.start)) || DEFAULT_LEN;

const dowsOf = (s: GroupService) => [...new Set(s.slots.map((x) => x.dow))].sort((a, b) => a - b);
const startsOn = (s: GroupService, dow: number) =>
  s.slots
    .filter((x) => x.dow === dow)
    .map((x) => x.start)
    .sort();
/** 켠 요일이 모두 같은 시각들이면 시각 알약을 한 번만 보여 주고 같이 고친다 */
const isUniform = (s: GroupService) => {
  const ds = dowsOf(s);
  const base = JSON.stringify(startsOn(s, ds[0]));
  return ds.every((d) => JSON.stringify(startsOn(s, d)) === base);
};
/** 같은 요일·같은 시각이 둘이 되면 하나만 남긴다 */
const dedupe = (slots: ServiceSlot[]) =>
  slots.filter((x, i) => slots.findIndex((y) => y.dow === x.dow && y.start === x.start) === i);

/** 고치고 있는 시각 — 켠 요일 모두(all) 또는 슬롯 하나(one) */
type Pick = { mode: 'all'; start: string } | { mode: 'one'; idx: number };

/**
 * 「같이 드리는 예배」 고르기 — 예배 스티커를 눌러 켜고, 켜진 스티커를 한 번 더 누르면
 * 바로 아래에 그 예배의 시간 카드(이름·요일·시각)가 열린다. 열린 스티커를 또 누르면 꺼진다.
 * 시각 알약을 누르면 그 시각 하나만 고치는 판이 뜬다. 끝 시각·부는 묻지 않는다.
 * 모임 만들기 2단계와 모임 설정이 같이 쓴다.
 */
export function ServicePicker({
  services,
  onChange,
  editing,
  onEditing,
  onPoke,
}: {
  services: GroupService[];
  onChange: (next: GroupService[]) => void;
  editing: string | null;
  onEditing: (id: string | null) => void;
  onPoke?: () => void;
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [focusName, setFocusName] = useState(false);
  useEffect(() => setPick(null), [editing]);

  const svcTone = (id: string) => (services.findIndex((s) => s.id === id) % 2 === 0 ? 1 : 2);
  const update = (id: string, patch: Partial<GroupService>) =>
    onChange(services.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const open = services.find((s) => s.id === editing && s.active) || null;

  return (
    <>
      <div className="sg-svstk" role="group" aria-label="같이 드리는 예배">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            className="sg-sv"
            data-tone={svcTone(s.id)}
            data-open={(s.active && editing === s.id) || undefined}
            aria-pressed={s.active}
            aria-expanded={s.active ? editing === s.id : undefined}
            onClick={() => {
              if (!s.active) {
                update(s.id, { active: true });
                onEditing(s.id);
              } else if (editing === s.id) {
                update(s.id, { active: false });
                onEditing(null);
              } else {
                onEditing(s.id);
              }
              onPoke?.();
            }}
          >
            <span className="sg-sv-bx" aria-hidden>
              <Check size={12} strokeWidth={3} />
            </span>
            <span className="sg-sv-tx">
              {s.name}
              <small>{timesSummary(s) || '시간 없음'}</small>
            </span>
          </button>
        ))}
        <button
          type="button"
          className="sg-sv sg-sv-add"
          onClick={() => {
            const id = newServiceId(services);
            onChange([
              ...services,
              {
                id,
                name: '새 예배',
                active: true,
                slots: [{ dow: 0, start: '11:00', end: endFor('11:00'), part: null }],
              },
            ]);
            onEditing(id);
            setFocusName(true);
            onPoke?.();
          }}
        >
          <Plus size={14} aria-hidden />
          예배 추가
        </button>
      </div>
      <div className="sg-unfold" data-open={!!open || undefined}>
        <div>
          {open ? (
            <ServiceCard
              key={open.id}
              service={open}
              pick={pick}
              onPick={setPick}
              autoFocusName={focusName}
              onFocused={() => setFocusName(false)}
              onChange={(patch) => update(open.id, patch)}
            />
          ) : (
            <span />
          )}
        </div>
      </div>
      {!open && (
        <p className="sg-hand sg-sv-hint">
          켜진 스티커를 한 번 더 누르면 요일·시각을 고칠 수 있어요
        </p>
      )}
    </>
  );
}

/** 열린 예배 하나 — 이름 · 요일 · 시각 알약 (+ 고르기 판) */
function ServiceCard({
  service: s,
  pick,
  onPick,
  autoFocusName,
  onFocused,
  onChange,
}: {
  service: GroupService;
  pick: Pick | null;
  onPick: (p: Pick | null) => void;
  autoFocusName: boolean;
  onFocused: () => void;
  onChange: (patch: Partial<GroupService>) => void;
}) {
  const dows = dowsOf(s);
  const uniform = isUniform(s);
  const setSlots = (slots: ServiceSlot[]) => onChange({ slots: dedupe(slots) });

  const toggleDow = (d: number) => {
    if (dows.includes(d)) {
      if (dows.length <= 1) return;
      setSlots(s.slots.filter((x) => x.dow !== d));
    } else {
      const base = s.slots.filter((x) => x.dow === dows[0]);
      setSlots([...s.slots, ...base.map((x) => ({ ...x, dow: d, part: null }))]);
    }
    onPick(null);
  };

  const addTime = () => {
    const used = new Set(startsOn(s, dows[0]));
    const last = [...used].sort().pop() || '09:00';
    let m = Math.min(toMin(last) + 120, 22 * 60);
    while (used.has(toT(m)) && m > 0) m -= 30;
    const t = toT(m);
    const targets = uniform ? dows : [dows[0]];
    const added = targets.map((dow) => ({ dow, start: t, end: endFor(t), part: null }));
    setSlots([...s.slots, ...added]);
    onPick(uniform ? { mode: 'all', start: t } : { mode: 'one', idx: s.slots.length });
  };

  const removeTime = (p: Pick) => {
    if (p.mode === 'all') setSlots(s.slots.filter((x) => x.start !== p.start));
    else setSlots(s.slots.filter((_, i) => i !== p.idx));
    onPick(null);
  };

  const pickedStart =
    pick?.mode === 'all' ? pick.start : pick?.mode === 'one' ? s.slots[pick.idx]?.start : undefined;

  const setStart = (t: string) => {
    if (!pick) return;
    const hit = (x: ServiceSlot, i: number) =>
      pick.mode === 'all' ? x.start === pick.start : i === pick.idx;
    const next = s.slots.map((x, i) =>
      hit(x, i) ? { ...x, start: t, end: endFor(t, lenOf(x)) } : x,
    );
    const clean = dedupe(next);
    onChange({ slots: clean });
    if (pick.mode === 'all') onPick({ mode: 'all', start: t });
    else {
      const old = s.slots[pick.idx];
      onPick({ mode: 'one', idx: clean.findIndex((x) => x.dow === old.dow && x.start === t) });
    }
  };

  /** 알약 목록 — 같은 시각이면 한 번, 아니면 요일마다 */
  const pills: Array<{ key: string; label: string | null; start: string; p: Pick; canX: boolean }> =
    uniform
      ? startsOn(s, dows[0]).map((t) => ({
          key: `all-${t}`,
          label: null,
          start: t,
          p: { mode: 'all', start: t },
          canX: startsOn(s, dows[0]).length > 1,
        }))
      : s.slots
          .map((x, i) => ({ x, i }))
          .sort((a, b) => a.x.dow - b.x.dow || a.x.start.localeCompare(b.x.start))
          .map(({ x, i }) => ({
            key: `one-${i}`,
            label: DOW_KO[x.dow],
            start: x.start,
            p: { mode: 'one', idx: i },
            canX: s.slots.length > 1,
          }));
  const isPicked = (p: Pick) =>
    !!pick &&
    (p.mode === 'all' && pick.mode === 'all'
      ? p.start === pick.start
      : p.mode === 'one' && pick.mode === 'one' && p.idx === pick.idx);

  return (
    <div className="sg-svc">
      <div className="sg-svc-row">
        <label className="sg-svc-lb" htmlFor={`sg-svc-${s.id}`}>
          이름
        </label>
        <input
          id={`sg-svc-${s.id}`}
          className="sg-svc-name"
          value={s.name}
          maxLength={20}
          ref={(el) => {
            if (el && autoFocusName) {
              el.focus();
              el.select();
              onFocused();
            }
          }}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>
      <div className="sg-svc-row">
        <span className="sg-svc-lb">요일</span>
        <div className="sg-dows" role="group" aria-label="요일">
          {[...DOW_KO].map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={dows.includes(i)}
              aria-label={`${d}요일`}
              data-sun={i === 0 || undefined}
              onClick={() => toggleDow(i)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="sg-svc-row">
        <span className="sg-svc-lb">시각</span>
        <div className="sg-times">
          {pills.map((x) => (
            <span key={x.key} className="sg-tpill" data-on={isPicked(x.p) || undefined}>
              <button
                type="button"
                aria-expanded={isPicked(x.p)}
                aria-label={`${x.label ? `${x.label}요일 ` : ''}${short(x.start)} 고치기`}
                onClick={() => onPick(isPicked(x.p) ? null : x.p)}
              >
                {x.label && <small>{x.label}</small>}
                {short(x.start)}
              </button>
              {x.canX && (
                <button
                  type="button"
                  className="sg-tpill-x"
                  aria-label={`${short(x.start)} 지우기`}
                  onClick={() => removeTime(x.p)}
                >
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
          {s.slots.length < 20 && (
            <button type="button" className="sg-tpill-add" onClick={addTime}>
              <Plus size={13} aria-hidden />
              시각 더하기
            </button>
          )}
        </div>
      </div>
      {pickedStart && (
        <TimePick
          value={pickedStart}
          note={pick?.mode === 'all' && dows.length > 1 ? '켠 요일 모두 같이 바뀌어요' : null}
          onChange={setStart}
          onDone={() => onPick(null)}
        />
      )}
    </div>
  );
}

/** 시각 고르기 판 — 큰 시각 ±10분 · 자주 쓰는 시각 · 오전/오후 · 시 · 분 */
function TimePick({
  value,
  note,
  onChange,
  onDone,
}: {
  value: string;
  note: string | null;
  onChange: (t: string) => void;
  onDone: () => void;
}) {
  const m = toMin(value);
  const h = Math.floor(m / 60);
  const mi = m % 60;
  const pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return (
    <div className="sg-tpk" role="group" aria-label="시각 고르기">
      <div className="sg-tpk-top">
        <b aria-live="polite">
          {pm ? '오후' : '오전'} {h12}:{String(mi).padStart(2, '0')}
        </b>
        <div className="sg-tpk-step">
          <button type="button" aria-label="10분 이르게" onClick={() => onChange(toT(m - 10))}>
            <Minus size={13} aria-hidden />
            10분
          </button>
          <button type="button" aria-label="10분 늦게" onClick={() => onChange(toT(m + 10))}>
            <Plus size={13} aria-hidden />
            10분
          </button>
        </div>
      </div>
      <span className="sg-tpk-lb">자주 쓰는 시각</span>
      <div className="sg-tpk-common">
        {COMMON.map((c) => (
          <button key={c} type="button" aria-pressed={c === value} onClick={() => onChange(c)}>
            {short(c)}
          </button>
        ))}
      </div>
      <div className="sg-tpk-ampm">
        <button type="button" aria-pressed={!pm} onClick={() => pm && onChange(toT(m - 720))}>
          오전
        </button>
        <button type="button" aria-pressed={pm} onClick={() => !pm && onChange(toT(m + 720))}>
          오후
        </button>
      </div>
      <div className="sg-tpk-grid">
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((x) => (
          <button
            key={x}
            type="button"
            aria-pressed={x === h12}
            onClick={() => onChange(toT(((x % 12) + (pm ? 12 : 0)) * 60 + mi))}
          >
            {x}시
          </button>
        ))}
      </div>
      <div className="sg-tpk-grid sg-tpk-min">
        {[0, 10, 20, 30, 40, 50].map((x) => (
          <button
            key={x}
            type="button"
            aria-pressed={x === mi}
            onClick={() => onChange(toT(h * 60 + x))}
          >
            {String(x).padStart(2, '0')}분
          </button>
        ))}
      </div>
      <div className="sg-tpk-ft">
        <span>{note}</span>
        <button type="button" className="sn-btn sn-primary" onClick={onDone}>
          다 됐어요
        </button>
      </div>
    </div>
  );
}
