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
  onMouseDown: (e: React.MouseEvent, item: AssigneeItemResponse) => void;
  onDetailClick?: (item: AssigneeItemResponse) => void;
}

/**
 * Drag source item in ChecklistItemPanel.
 *
 * Layout:
 * ┌─ Feature color bar (4px) ──────────────────────┐
 * │  ⠿  ChecklistItem title                   😀   │
 * │      Feature > Task                             │
 * │      📅 03/15 ~ 03/20  (if dates present)       │
 * └─────────────────────────────────────────────────┘
 */
export function ChecklistDragItem({
  item,
  assignee,
  isDragging = false,
  onMouseDown,
  onDetailClick,
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
      className={`relative flex items-stretch rounded-lg border border-foreground/[0.08]
        bg-bridge-dark overflow-hidden cursor-grab select-none
        hover:border-foreground/[0.12] transition-colors group
        ${isDragging ? 'opacity-50' : 'opacity-100'}`}
      onMouseDown={(e) => onMouseDown(e, item)}
    >
      {/* Feature color bar (4px left accent) */}
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: featureColor }}
        aria-hidden="true"
      />

      {/* Content area */}
      <div className="flex items-start gap-2 px-2 py-2 flex-1 min-w-0">
        {/* Drag handle */}
        <GripVertical
          size={14}
          className="shrink-0 text-slate-500 mt-0.5 cursor-grab"
          aria-hidden="true"
        />

        {/* Text content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <p
            className={`text-xs font-medium text-foreground truncate leading-snug
              ${item.completed ? 'line-through text-slate-500' : ''}`}
          >
            {item.title}
          </p>

          {/* Feature > Task subtitle */}
          {subtitle && (
            <p className="text-xs text-slate-500 truncate mt-0.5 leading-snug">
              {subtitle}
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

        {/* Right side: detail button + assignee avatar */}
        <div className="shrink-0 flex items-center gap-1 self-start">
          {/* Detail view button */}
          {onDetailClick && item.task && (
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
          )}

          {/* Assignee avatar */}
          {assignee && (
            <div title={assignee.name}>
              {assignee.profile_image ? (
                <img
                  src={resolveFileUrl(assignee.profile_image)}
                  alt={assignee.name}
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center
                    text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: getAssigneeHex(assignee.name) }}
                  aria-label={assignee.name}
                >
                  {getInitials(assignee.name)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

ChecklistDragItem.displayName = 'ChecklistDragItem';
