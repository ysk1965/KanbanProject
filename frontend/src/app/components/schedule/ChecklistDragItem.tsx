import { GripVertical, ExternalLink, Calendar } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { AssigneeItemResponse } from '../../utils/api';
import { getInitials, getAssigneeHex } from '../../utils/assigneeColor';
import { resolveFileUrl } from '../../utils/api';

interface ChecklistDragItemProps {
  item: AssigneeItemResponse;
  assignee?: {
    id: string;
    name: string;
    profile_image: string | null;
  } | null;
  isDragging?: boolean;
  isScheduled?: boolean;
  isHighlighted?: boolean;
  onMouseDown: (e: React.MouseEvent, item: AssigneeItemResponse) => void;
  onDetailClick?: (item: AssigneeItemResponse) => void;
  onScheduledClick?: () => void;
}

/**
 * Drag source item in ChecklistItemPanel.
 *
 * Layout:
 * ┌─ Feature color bar (4px) ──────────────────────┐
 * │  ⠿  ChecklistItem title                   [↗]  │
 * │      😀 Assignee · Feature > Task               │
 * │      📅 03/15 ~ 03/20  (if dates present)       │
 * └─────────────────────────────────────────────────┘
 */
export function ChecklistDragItem({
  item,
  assignee,
  isDragging = false,
  isScheduled = false,
  isHighlighted = false,
  onMouseDown,
  onDetailClick,
  onScheduledClick,
}: ChecklistDragItemProps) {
  const featureColor = item.feature?.color ?? '#6366F1';

  // Format date string: "2026-03-15" → "03/15"
  const formatShortDate = (dateStr: string | null): string | null => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length < 3) return null;
    return `${parts[1]}/${parts[2]}`;
  };

  const startDateStr = formatShortDate(item.start_date);
  const dueDateStr = formatShortDate(item.due_date);
  const hasDate = startDateStr || dueDateStr;

  const dateLabel = (() => {
    if (startDateStr && dueDateStr && startDateStr !== dueDateStr) {
      return `${startDateStr} ~ ${dueDateStr}`;
    }
    if (startDateStr) return startDateStr;
    if (dueDateStr) return dueDateStr;
    return null;
  })();

  const subtitleParts: string[] = [];
  if (item.feature?.title) subtitleParts.push(item.feature.title);
  if (item.task?.title) subtitleParts.push(item.task.title);
  const subtitle = subtitleParts.join(' > ');

  return (
    <div
      className={`relative flex items-stretch rounded-lg border
        bg-bridge-dark overflow-hidden select-none
        transition-all group
        ${isHighlighted
          ? 'border-bridge-accent/50 ring-2 ring-bridge-accent/70 bg-bridge-accent/5'
          : 'border-foreground/[0.08] hover:border-foreground/[0.12]'}
        ${isScheduled
          ? 'opacity-40 cursor-pointer hover:opacity-60'
          : `cursor-grab ${isDragging ? 'opacity-50' : 'opacity-100'}`}`}
      onMouseDown={(e) => { if (!isScheduled) onMouseDown(e, item); }}
      onClick={() => { if (isScheduled) onScheduledClick?.(); }}
    >
      {/* Feature color bar (4px left accent) */}
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: featureColor }}
        aria-hidden="true"
      />

      {/* Content area */}
      <div className="flex items-start gap-2 px-2 py-2 flex-1 min-w-0">
        {/* Drag handle (hidden for scheduled items) */}
        {!isScheduled && (
          <GripVertical
            size={14}
            className="shrink-0 text-slate-500 mt-0.5 cursor-grab"
            aria-hidden="true"
          />
        )}

        {/* Text content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <p
            className={`text-xs font-medium text-foreground truncate leading-snug
              ${item.completed ? 'line-through text-slate-500' : ''}`}
          >
            {item.title}
          </p>

          {/* Assignee (inline) + Feature > Task subtitle */}
          {(assignee || subtitle) && (
            <p className="flex items-center gap-1 text-xs text-slate-500 truncate mt-0.5 leading-snug">
              {assignee && (
                <span className="flex items-center gap-1 shrink-0 min-w-0 max-w-[120px]">
                  {assignee.profile_image ? (
                    <img
                      src={resolveFileUrl(assignee.profile_image)}
                      alt={assignee.name}
                      className="w-4 h-4 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center
                        text-xs font-bold text-white whitespace-nowrap overflow-hidden shrink-0"
                      style={{ backgroundColor: getAssigneeHex(assignee.name) }}
                      aria-label={assignee.name}
                    >
                      {getInitials(assignee.name)}
                    </span>
                  )}
                  <span className="text-slate-400 truncate">{assignee.name}</span>
                </span>
              )}
              {assignee && subtitle && (
                <span className="text-slate-600 shrink-0">·</span>
              )}
              {subtitle && <span className="truncate">{subtitle}</span>}
            </p>
          )}

          {/* Date range */}
          {hasDate && dateLabel && (
            <p className="flex items-center gap-1 text-xs text-slate-500 mt-0.5 leading-snug">
              <Calendar size={10} className="shrink-0" />
              {dateLabel}
            </p>
          )}
        </div>

        {/* Right side: detail button */}
        {onDetailClick && item.task && (
          <div className="shrink-0 flex items-center self-start">
            <IconButton
              aria-label="Detail"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDetailClick(item);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100"
              title="Detail"
            >
              <ExternalLink />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

ChecklistDragItem.displayName = 'ChecklistDragItem';
