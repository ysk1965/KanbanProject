import { useMemo, type ReactNode } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { GroupService } from './groupApi';
import { DOW_KO, newServiceId, slotsLabel } from './servicePresets';

/** 한 주 시간표 줄 — 시작 시각으로 나눈다 */
const BANDS = [
  { id: 'dawn', name: '새벽', test: (t: string) => t < '07:00' },
  { id: 'am', name: '오전', test: (t: string) => t >= '07:00' && t < '12:00' },
  { id: 'pm', name: '오후', test: (t: string) => t >= '12:00' && t < '18:00' },
  { id: 'eve', name: '저녁', test: (t: string) => t >= '18:00' },
] as const;

/**
 * 「같이 드리는 예배」 고르기 — 예배 스티커 켜고 끄기 + 한 주 시간표 + 칸을 눌러 이름·시간 고치기.
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

  const svcTone = (id: string) => (services.findIndex((s) => s.id === id) % 2 === 0 ? 1 : 2);
  const update = (id: string, patch: Partial<GroupService>) =>
    onChange(services.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <>
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
              update(s.id, { active: !s.active });
              if (s.active && editing === s.id) onEditing(null);
              onPoke?.();
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
            onChange([
              ...services,
              {
                id,
                name: '새 예배',
                active: true,
                slots: [{ dow: 0, start: '11:00', end: '12:20' }],
              },
            ]);
            onEditing(id);
            onPoke?.();
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
                    onClick={() => onEditing(editing === s.id ? null : s.id)}
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
      <p className="sg-note sg-tt-hint">칸을 누르면 그 예배의 이름·시간을 고칠 수 있어요.</p>
      <div className="sg-unfold" data-open={!!editing || undefined}>
        <div>
          {editing && services.some((s) => s.id === editing) && (
            <ServiceEditor
              service={services.find((s) => s.id === editing)!}
              onChange={(next) => update(editing, next)}
            />
          )}
        </div>
      </div>
    </>
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
