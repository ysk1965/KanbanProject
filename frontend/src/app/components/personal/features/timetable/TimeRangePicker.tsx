import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { pad2, type TimeRange } from './timetableModel';

/**
 * 시간 열 셀용 5분 단위 피커. 기획서 04절 「시간 피커」.
 * body 포털 + position:fixed 로 셀 아래에 붙는다. 셀 포커스를 빼앗지 않도록 칩은 mousedown 을 막는다.
 * <select> 는 포커스를 가져가지만, 셀 값은 이미 모델에 써 두므로 문제 없다 (셀 blur 시 commit 은 같은 값).
 */
export interface TimeRangePickerProps {
  anchorEl: HTMLElement;
  value: TimeRange;
  /** 시작·종료가 바뀔 때마다 (정규화된 값) */
  onChange: (r: TimeRange) => void;
  /** 힌트 문구 (기본값 채움 안내 등) */
  hint?: string;
  hintStrong?: boolean;
  onClose: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const QUICK: { label: string; min: number }[] = [
  { label: '+15분', min: 15 },
  { label: '+30분', min: 30 },
  { label: '+1시간', min: 60 },
  { label: '+1시간 30분', min: 90 },
];

const SELECT_CLS =
  'bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2 py-1.5 text-xs text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all';

export function usePopoverPosition(anchorEl: HTMLElement | null, deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: -9999, top: -9999 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r.left;
    let top = r.bottom + 4;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - w);
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - 4 - h);
    setStyle({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorEl, ...deps]);
  return { ref, style };
}

export function TimeRangePicker({ anchorEl, value, onChange, hint, hintStrong, onClose }: TimeRangePickerProps) {
  const { ref, style } = usePopoverPosition(anchorEl);
  const inverted = value.e <= value.s;

  const sh = Math.floor(value.s / 60) % 24;
  const sm = value.s % 60;
  const eh = Math.floor(value.e / 60) % 24;
  const em = value.e % 60;

  const set = (next: Partial<{ sh: number; sm: number; eh: number; em: number }>) => {
    const s = (next.sh ?? sh) * 60 + (next.sm ?? sm);
    const e = (next.eh ?? eh) * 60 + (next.em ?? em);
    onChange({ s, e });
  };

  const hintText = hint || (inverted ? '종료가 시작보다 앞섭니다 (자정 넘김이면 그대로 두세요)' : '5분 단위 · 직접 타이핑도 됩니다');

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="tt-pop w-[300px] bg-bridge-obsidian rounded-xl border border-foreground/10 shadow-2xl p-3 flex flex-col gap-2.5"
      role="dialog"
      aria-label="시간 선택"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">시작</span>
          <span className="flex items-center gap-1">
            <select className={SELECT_CLS} value={sh} onChange={(e) => set({ sh: +e.target.value })} aria-label="시작 시">
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {pad2(h)}
                </option>
              ))}
            </select>
            <span className="text-slate-500">:</span>
            <select className={SELECT_CLS} value={sm} onChange={(e) => set({ sm: +e.target.value })} aria-label="시작 분">
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {pad2(m)}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">종료</span>
          <span className="flex items-center gap-1">
            <select className={SELECT_CLS} value={eh} onChange={(e) => set({ eh: +e.target.value })} aria-label="종료 시">
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {pad2(h)}
                </option>
              ))}
            </select>
            <span className="text-slate-500">:</span>
            <select className={SELECT_CLS} value={em} onChange={(e) => set({ em: +e.target.value })} aria-label="종료 분">
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {pad2(m)}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.min}
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange({ s: value.s, e: value.s + q.min })}
            className="text-xs font-bold px-2 py-1 rounded-full bg-bridge-accent/15 text-bridge-accent hover:bg-bridge-accent/25 transition-colors"
          >
            {q.label}
          </button>
        ))}
      </div>
      <p className={`text-xs ${inverted ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
        {hintStrong ? <b className="font-bold text-foreground">{hintText}</b> : hintText}
      </p>
    </div>,
    document.body,
  );
}

export default TimeRangePicker;
