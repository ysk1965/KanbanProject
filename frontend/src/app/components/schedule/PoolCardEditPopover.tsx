import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Clock, Palette, User } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { getAssigneeHex, getInitials } from '../../utils/assigneeColor';
import { FEATURE_COLORS } from '../../constants';
import type {
  PlanningCard,
  PlanningCardUpdateRequest,
  PlanningCardMoveRequest,
} from '../../types';
import type { MemberLite } from './SchedulePlanningView';

const HOURS_PRESETS = [1, 2, 4, 8, 16];

interface PoolCardEditPopoverProps {
  card: PlanningCard;
  members: MemberLite[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (card: PlanningCard, patch: PlanningCardUpdateRequest) => void;
  onMove: (card: PlanningCard, moveReq: PlanningCardMoveRequest) => void;
  children: React.ReactNode;
}

export function PoolCardEditPopover({
  card,
  members,
  open,
  onOpenChange,
  onUpdate,
  onMove,
  children,
}: PoolCardEditPopoverProps) {
  const { t } = useTranslation();
  const [draftTitle, setDraftTitle] = useState(card.title);

  useEffect(() => {
    if (open) setDraftTitle(card.title);
  }, [open, card.title]);

  const commitTitle = () => {
    const next = draftTitle.trim();
    if (next && next !== card.title) {
      onUpdate(card, { title: next });
    } else {
      setDraftTitle(card.title);
    }
  };

  const handleHoursChange = (h: number | null) => {
    if (h !== card.estimated_hours) {
      onUpdate(card, { estimated_hours: h });
    }
  };

  const handleAssigneeChange = (assigneeId: string | null) => {
    const currentAssigneeId = card.assignee?.id ?? null;
    if (assigneeId === currentAssigneeId) return;
    onMove(card, {
      week_start_date: card.week_start_date,
      assignee_id: assigneeId,
      position: card.position,
    });
  };

  const handleColorChange = (color: string) => {
    if (color !== card.color) {
      onUpdate(card, { color });
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-64 p-0 bg-bridge-obsidian border-foreground/[0.08] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="px-3 pt-3 pb-2 border-b border-foreground/[0.08]">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
            {t('schedule.planning.edit.title', '제목')}
          </label>
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value.slice(0, 200))}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTitle();
              }
            }}
            maxLength={200}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>

        {/* Hours */}
        <div className="px-3 py-2 border-b border-foreground/[0.08]">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
            <Clock size={10} aria-hidden="true" />
            {t('schedule.planning.edit.hours', '예상 시간')}
          </label>
          <div className="flex items-center gap-1 flex-wrap">
            {HOURS_PRESETS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => handleHoursChange(h)}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                  card.estimated_hours === h
                    ? 'bg-bridge-accent text-white'
                    : 'bg-foreground/5 text-foreground hover:bg-foreground/10'
                }`}
              >
                {h}h
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleHoursChange(null)}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                card.estimated_hours == null
                  ? 'bg-bridge-accent text-white'
                  : 'bg-foreground/5 text-slate-500 hover:bg-foreground/10'
              }`}
            >
              —
            </button>
          </div>
        </div>

        {/* Assignee */}
        <div className="px-3 py-2 border-b border-foreground/[0.08]">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
            <User size={10} aria-hidden="true" />
            {t('schedule.planning.edit.assignee', '담당자')}
          </label>
          <div className="max-h-[140px] overflow-y-auto custom-scrollbar space-y-0.5">
            <button
              type="button"
              onClick={() => handleAssigneeChange(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                card.assignee == null
                  ? 'bg-bridge-accent/15 text-bridge-accent font-bold'
                  : 'text-slate-500 hover:bg-foreground/5'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-foreground/10 flex items-center justify-center text-xs text-slate-500">
                —
              </span>
              {t('schedule.planning.edit.unassigned', '미배정')}
              {card.assignee == null && <Check size={12} className="ml-auto" />}
            </button>
            {members.map((m) => {
              const isSelected = card.assignee?.id === m.id;
              const hex = getAssigneeHex(m.name, m.color);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleAssigneeChange(m.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? 'bg-bridge-accent/15 text-foreground font-bold'
                      : 'text-foreground hover:bg-foreground/5'
                  }`}
                >
                  {m.profile_image ? (
                    <img
                      src={m.profile_image}
                      alt={m.name}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: hex }}
                    >
                      {getInitials(m.name)}
                    </span>
                  )}
                  <span className="truncate">{m.name}</span>
                  {isSelected && <Check size={12} className="ml-auto shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color */}
        <div className="px-3 py-2.5">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1">
            <Palette size={10} aria-hidden="true" />
            {t('schedule.planning.edit.color', '색상')}
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FEATURE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleColorChange(c)}
                className="relative w-5 h-5 rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
                aria-label={c}
              >
                {card.color === c && (
                  <Check
                    size={10}
                    className="absolute inset-0 m-auto text-white"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
