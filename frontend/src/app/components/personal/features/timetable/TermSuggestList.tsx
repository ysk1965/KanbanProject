import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { PersonalFeatureTerm } from '../types';
import { usePopoverPosition } from './TimeRangePicker';

/**
 * 이전 입력 추천 목록. 기획서 04절 「이전 입력 추천」.
 * mousedown 을 막아 셀 포커스를 유지한다. 키보드(↑↓ Enter Esc)는 셀의 onKeyDown 이 다룬다.
 */
export interface TermSuggestListProps {
  anchorEl: HTMLElement;
  fieldLabel: string;
  query: string;
  items: PersonalFeatureTerm[];
  highlightIndex: number;
  onPick: (index: number) => void;
  onForget: (index: number) => void;
}

function highlight(value: string, q: string) {
  const ql = q.toLowerCase();
  if (!ql) return value;
  const at = value.toLowerCase().indexOf(ql);
  if (at < 0) return value;
  return (
    <>
      {value.slice(0, at)}
      <mark>{value.slice(at, at + q.length)}</mark>
      {value.slice(at + q.length)}
    </>
  );
}

export function TermSuggestList({ anchorEl, fieldLabel, query, items, highlightIndex, onPick, onForget }: TermSuggestListProps) {
  const { ref, style } = usePopoverPosition(anchorEl, [items.length]);
  const q = query.trim();

  return createPortal(
    <div
      ref={ref}
      style={style}
      className="tt-pop w-[280px] bg-bridge-obsidian rounded-xl border border-foreground/10 shadow-2xl py-1.5 overflow-hidden"
      role="listbox"
      aria-label={`${fieldLabel} 추천`}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-3 pb-1 text-xs font-bold uppercase tracking-widest text-slate-400">
        {q ? '이전에 쓴 값' : '최근 쓴 값'} · {fieldLabel}
      </div>
      {items.map((it, i) => (
        <div
          key={`${it.field}\u0000${it.value}`}
          role="option"
          aria-selected={i === highlightIndex}
          onClick={() => onPick(i)}
          className={`tt-sugg-item flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs text-foreground transition-colors ${
            i === highlightIndex ? 'bg-bridge-accent/15' : 'hover:bg-foreground/5'
          }`}
        >
          <span className={`tt-sugg-dot${it.color ? ` c-${it.color}` : ''}`} aria-hidden="true" />
          <span className="flex-1 min-w-0 truncate whitespace-pre">{highlight(it.value, q)}</span>
          <span className="text-xs text-slate-500 shrink-0">×{it.use_count}</span>
          <button
            type="button"
            tabIndex={-1}
            aria-label="기억에서 지우기"
            title="기억에서 지우기"
            onClick={(e) => {
              e.stopPropagation();
              onForget(i);
            }}
            className="w-5 h-5 inline-flex items-center justify-center rounded-md text-slate-500 hover:text-rose-500 hover:bg-foreground/10 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export default TermSuggestList;
