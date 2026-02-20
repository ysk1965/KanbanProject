'use client';

import * as React from 'react';
import { useState, useCallback, useRef, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { cn } from './utils';

type Period = 'AM' | 'PM';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minuteStep?: 5 | 10 | 15 | 30;
  disabled?: boolean;
}

const PERIODS: Period[] = ['AM', 'PM'];
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const PERIOD_LABELS: Record<Period, string> = { AM: '오전', PM: '오후' };

function parse24h(value: string): { period: Period; hour12: number; minute: number } {
  const parts = value.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const period: Period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { period, hour12, minute: m };
}

function to24h(period: Period, hour12: number, minute: number): string {
  let h = hour12;
  if (period === 'AM' && h === 12) h = 0;
  if (period === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatDisplay(value: string): string {
  const { period, hour12, minute } = parse24h(value);
  return `${PERIOD_LABELS[period]} ${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function snapMinute(minute: number, step: number): number {
  return Math.round(minute / step) * step % 60;
}

function scrollToSelected(container: HTMLDivElement | null) {
  if (!container) return;
  const selected = container.querySelector('[data-selected="true"]') as HTMLElement;
  if (!selected) return;
  requestAnimationFrame(() => {
    selected.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
}

export function TimePicker({
  value,
  onChange,
  placeholder = '시간 선택',
  className,
  minuteStep = 10,
  disabled,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);

  const periodRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  const minutes = useMemo(
    () => Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => i * minuteStep),
    [minuteStep],
  );

  const { period: selectedPeriod, hour12: selectedHour, minute: rawMinute } = useMemo(() => {
    if (!value) return { period: 'AM' as Period, hour12: 9, minute: 0 };
    return parse24h(value);
  }, [value]);

  const selectedMinute = snapMinute(rawMinute, minuteStep);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        requestAnimationFrame(() => {
          scrollToSelected(periodRef.current);
          scrollToSelected(hourRef.current);
          scrollToSelected(minuteRef.current);
        });
      }
    },
    [],
  );

  const handlePeriodChange = (p: Period) => {
    onChange(to24h(p, selectedHour, selectedMinute));
  };

  const handleHourChange = (h: number) => {
    onChange(to24h(selectedPeriod, h, selectedMinute));
  };

  const handleMinuteChange = (m: number) => {
    onChange(to24h(selectedPeriod, selectedHour, m));
    setOpen(false);
  };

  const itemClass = (isSelected: boolean) =>
    cn(
      'h-8 px-3 text-sm shrink-0 transition-colors cursor-pointer text-center',
      isSelected
        ? 'bg-bridge-accent/20 text-bridge-accent font-medium'
        : 'text-slate-400 hover:bg-white/5 hover:text-foreground',
    );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center justify-between',
            'bg-foreground/5 border border-foreground/10 rounded-xl',
            'py-2.5 px-4 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-bridge-accent/50',
            'transition-all hover:border-foreground/20',
            value ? 'text-foreground' : 'text-slate-500',
            disabled && 'opacity-50 cursor-not-allowed',
            className,
          )}
          disabled={disabled}
        >
          <span>{value ? formatDisplay(value) : placeholder}</span>
          <Clock className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-auto p-0 bg-bridge-obsidian border border-white/10 rounded-xl shadow-2xl z-[60]"
      >
        <div className="flex divide-x divide-white/5">
          {/* Period column */}
          <div
            ref={periodRef}
            className="flex flex-col py-1 w-[64px] max-h-[160px] overflow-y-auto overscroll-contain"
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                data-selected={p === selectedPeriod}
                onClick={() => handlePeriodChange(p)}
                className={itemClass(p === selectedPeriod)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Hour column */}
          <div
            ref={hourRef}
            className="flex flex-col py-1 w-[56px] max-h-[160px] overflow-y-auto overscroll-contain"
          >
            {HOURS.map((h) => (
              <button
                key={h}
                type="button"
                data-selected={h === selectedHour}
                onClick={() => handleHourChange(h)}
                className={itemClass(h === selectedHour)}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Minute column */}
          <div
            ref={minuteRef}
            className="flex flex-col py-1 w-[56px] max-h-[160px] overflow-y-auto overscroll-contain"
          >
            {minutes.map((m) => (
              <button
                key={m}
                type="button"
                data-selected={m === selectedMinute}
                onClick={() => handleMinuteChange(m)}
                className={itemClass(m === selectedMinute)}
              >
                {String(m).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
