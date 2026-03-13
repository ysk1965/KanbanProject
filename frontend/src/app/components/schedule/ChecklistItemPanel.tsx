import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelRightClose, Search, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { AssigneeItemResponse, boardChecklistAPI } from '../../utils/api';
import { ChecklistDragItem } from './ChecklistDragItem';

// ─── Public interface consumed by sibling views ──────────────────────────────

/** Drag state shared between ChecklistItemPanel and drop target views. */
export interface PanelDragState {
  /** The checklist item being dragged. */
  item: AssigneeItemResponse;
  /** Cursor X at drag start. */
  startX: number;
  /** Cursor Y at drag start. */
  startY: number;
  /** Current cursor X (updated on mousemove). */
  currentX: number;
  /** Current cursor Y (updated on mousemove). */
  currentY: number;
  /** True once cursor has moved ≥3px from start (prevents accidental drags). */
  isActive: boolean;
}

// ─── Component props ──────────────────────────────────────────────────────────

interface ChecklistItemPanelProps {
  boardId: string;
  /** Called when a drag ends successfully on a drop target. */
  onDragStateChange?: (state: PanelDragState | null) => void;
  /** Called when an item is dropped. Panel removes item from list. */
  onItemDropped?: (itemId: string) => void;
  /** Called when user clicks detail button on an item (opens task detail). */
  onItemDetailClick?: (item: AssigneeItemResponse) => void;
}

// ─── Status group types ───────────────────────────────────────────────────────

type StatusGroup = 'todo' | 'in_progress' | 'done';

interface GroupedItems {
  todo: AssigneeItemResponse[];
  in_progress: AssigneeItemResponse[];
  done: AssigneeItemResponse[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusGroup(item: AssigneeItemResponse): StatusGroup {
  if (item.completed) return 'done';
  if (item.start_date) return 'in_progress';
  return 'todo';
}

function groupItems(items: AssigneeItemResponse[]): GroupedItems {
  const groups: GroupedItems = { todo: [], in_progress: [], done: [] };
  for (const item of items) {
    groups[getStatusGroup(item)].push(item);
  }
  return groups;
}

// ─── StatusGroupSection sub-component ────────────────────────────────────────

interface StatusGroupSectionProps {
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function StatusGroupSection({
  label,
  count,
  isOpen,
  onToggle,
  children,
}: StatusGroupSectionProps) {
  return (
    <div>
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 py-1.5 px-1 rounded-lg
          text-left text-xs text-slate-400 hover:text-foreground
          hover:bg-foreground/5 transition-colors"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown size={12} className="shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
        )}
        <span className="font-bold uppercase tracking-widest text-[10px]">{label}</span>
        <span className="ml-auto text-[10px] font-bold text-slate-500">{count}</span>
      </button>

      {/* Items */}
      {isOpen && (
        <div className="space-y-1 mt-1">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Right-side panel showing unscheduled checklist items as drag sources.
 * Width: 280px (collapsed: hidden, only a toggle button remains).
 *
 * DnD uses custom mouse events to match the existing ScheduleBlock.tsx pattern.
 */
export function ChecklistItemPanel({
  boardId,
  onDragStateChange,
  onItemDropped,
  onItemDetailClick,
}: ChecklistItemPanelProps) {
  const { t } = useTranslation();

  // ── Panel open/close ──
  const [isOpen, setIsOpen] = useState(true);

  // ── Data ──
  const [items, setItems] = useState<AssigneeItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');

  // ── Status group collapse state (todo/in_progress open by default, done closed) ──
  const [openGroups, setOpenGroups] = useState<Record<StatusGroup, boolean>>({
    todo: true,
    in_progress: true,
    done: false,
  });

  // ── Drag state ──
  const [dragState, setDragState] = useState<PanelDragState | null>(null);
  // Use refs for handlers that need the latest drag values inside document listeners
  const dragStateRef = useRef<PanelDragState | null>(null);

  // ── Load unscheduled items ──
  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await boardChecklistAPI.getItems(boardId, { is_scheduled: false });
        setItems(response.items);
      } catch (err) {
        console.error('ChecklistItemPanel: failed to load items', err);
        setError(t('common.error'));
      } finally {
        setIsLoading(false);
      }
    };

    if (boardId) {
      loadItems();
    }
  }, [boardId, t]);

  // ── Notify parent of drag state changes ──
  useEffect(() => {
    onDragStateChange?.(dragState);
  }, [dragState, onDragStateChange]);

  // ── ESC to cancel drag ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragStateRef.current) {
        dragStateRef.current = null;
        setDragState(null);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Toggle a status group ──
  const toggleGroup = useCallback((group: StatusGroup) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  // ── Drag start handler (onMouseDown on each item) ──
  const handleItemMouseDown = useCallback(
    (e: React.MouseEvent, item: AssigneeItemResponse) => {
      // Only primary button
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const initialState: PanelDragState = {
        item,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        isActive: false,
      };

      dragStateRef.current = initialState;
      document.body.style.userSelect = 'none';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const current = dragStateRef.current;
        if (!current) return;

        const dx = moveEvent.clientX - current.startX;
        const dy = moveEvent.clientY - current.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isActive = dist >= 3;

        const updated: PanelDragState = {
          ...current,
          currentX: moveEvent.clientX,
          currentY: moveEvent.clientY,
          isActive,
        };
        dragStateRef.current = updated;
        setDragState({ ...updated });

        // Update cursor
        if (isActive) {
          document.body.style.cursor = 'grabbing';
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        const finalState = dragStateRef.current;
        dragStateRef.current = null;
        setDragState(null);

        // If drag was active, check for a drop target
        if (finalState?.isActive) {
          // Look for a registered drop target under the cursor
          const dropTarget = document.elementFromPoint(
            finalState.currentX,
            finalState.currentY,
          );
          const dropCell = dropTarget?.closest('[data-drop-target]');

          if (dropCell) {
            // Signal to parent; the parent handles API call and refresh
            onItemDropped?.(finalState.item.id);
            // Optimistically remove from panel list
            setItems((prev) => prev.filter((i) => i.id !== finalState.item.id));
          }
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onItemDropped],
  );

  // ── Filter items by search query ──
  const filteredItems = searchQuery
    ? items.filter((item) =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : items;

  const grouped = groupItems(filteredItems);

  const groupLabels: Record<StatusGroup, string> = {
    todo: t('kanban.status.todo', 'To-do'),
    in_progress: t('kanban.status.inProgress', 'In progress'),
    done: t('kanban.status.done', 'Done'),
  };

  // ── Collapsed state: render only a slim toggle strip ──
  if (!isOpen) {
    return (
      <div className="relative border-l border-foreground/[0.08] bg-bridge-obsidian">
        <button
          onClick={() => setIsOpen(true)}
          aria-label={t('schedule.panel.title', 'Checklist')}
          className="flex flex-col items-center justify-center w-8 h-full py-4 gap-2
            text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <Search size={14} aria-hidden="true" />
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {t('schedule.panel.title', 'Checklist')}
          </span>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Panel container */}
      <div
        className="w-[280px] border-l border-foreground/[0.08] bg-bridge-obsidian
          flex flex-col overflow-hidden shrink-0"
        role="complementary"
        aria-label={t('schedule.panel.title', 'Checklist')}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/[0.08]">
          <span className="text-[13px] font-bold text-foreground">
            {t('schedule.panel.title', 'Checklist')}
          </span>
          <button
            onClick={() => setIsOpen(false)}
            aria-label={t('common.close', 'Close')}
            className="p-1 rounded-lg text-slate-500 hover:text-foreground
              hover:bg-foreground/5 transition-colors"
          >
            <PanelRightClose size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Search input */}
        <div className="px-3 py-2 border-b border-foreground/[0.08]">
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('schedule.panel.search', 'Search...')}
              aria-label={t('schedule.panel.search', 'Search...')}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg
                py-1.5 pl-7 pr-3 text-xs text-foreground placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          </div>
        </div>

        {/* Scrollable item list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-3">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 size={18} className="animate-spin mr-2 text-bridge-accent" aria-hidden="true" />
              <span className="text-xs">{t('common.loading', 'Loading...')}</span>
            </div>
          )}

          {!isLoading && error && (
            <div
              role="alert"
              className="text-xs text-red-400 text-center py-4"
            >
              {error}
            </div>
          )}

          {!isLoading && !error && filteredItems.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-slate-500">
                {searchQuery
                  ? t('common.noData', 'No data available')
                  : t('schedule.panel.noUnscheduled', 'All items are scheduled')}
              </p>
            </div>
          )}

          {!isLoading && !error && filteredItems.length > 0 && (
            <>
              {/* To-do group */}
              {(grouped.todo.length > 0 || !searchQuery) && (
                <StatusGroupSection
                  label={groupLabels.todo}
                  count={grouped.todo.length}
                  isOpen={openGroups.todo}
                  onToggle={() => toggleGroup('todo')}
                >
                  {grouped.todo.map((item) => (
                    <ChecklistDragItem
                      key={item.id}
                      item={item}
                      assignee={null}
                      isDragging={dragState?.item.id === item.id && dragState.isActive}
                      onMouseDown={handleItemMouseDown}
                      onDetailClick={onItemDetailClick}
                    />
                  ))}
                </StatusGroupSection>
              )}

              {/* In Progress group */}
              {(grouped.in_progress.length > 0 || !searchQuery) && (
                <StatusGroupSection
                  label={groupLabels.in_progress}
                  count={grouped.in_progress.length}
                  isOpen={openGroups.in_progress}
                  onToggle={() => toggleGroup('in_progress')}
                >
                  {grouped.in_progress.map((item) => (
                    <ChecklistDragItem
                      key={item.id}
                      item={item}
                      assignee={null}
                      isDragging={dragState?.item.id === item.id && dragState.isActive}
                      onMouseDown={handleItemMouseDown}
                      onDetailClick={onItemDetailClick}
                    />
                  ))}
                </StatusGroupSection>
              )}

              {/* Done group */}
              {(grouped.done.length > 0 || !searchQuery) && (
                <StatusGroupSection
                  label={groupLabels.done}
                  count={grouped.done.length}
                  isOpen={openGroups.done}
                  onToggle={() => toggleGroup('done')}
                >
                  {grouped.done.map((item) => (
                    <ChecklistDragItem
                      key={item.id}
                      item={item}
                      assignee={null}
                      isDragging={dragState?.item.id === item.id && dragState.isActive}
                      onMouseDown={handleItemMouseDown}
                      onDetailClick={onItemDetailClick}
                    />
                  ))}
                </StatusGroupSection>
              )}
            </>
          )}
        </div>

        {/* Drag hint footer */}
        <div className="px-4 py-3 border-t border-foreground/[0.08]">
          <p className="text-[10px] text-slate-600 text-center leading-relaxed">
            💡 {t('schedule.panel.dragHint', 'Drag to place on calendar/resource')}
          </p>
        </div>
      </div>

      {/* Ghost element (rendered while dragging) */}
      {dragState?.isActive && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none z-50 w-[240px]
            bg-bridge-accent/20 border border-bridge-accent rounded-lg px-3 py-2
            shadow-lg shadow-bridge-accent/20"
          style={{
            left: dragState.currentX + 12,
            top: dragState.currentY - 16,
          }}
        >
          {/* Feature color accent */}
          {dragState.item.feature && (
            <div
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
              style={{ backgroundColor: dragState.item.feature.color }}
            />
          )}
          <span className="text-xs font-medium text-foreground truncate block pl-1">
            {dragState.item.title}
          </span>
          {(dragState.item.feature || dragState.item.task) && (
            <span className="text-[10px] text-slate-500 truncate block pl-1 mt-0.5">
              {[dragState.item.feature?.title, dragState.item.task?.title]
                .filter(Boolean)
                .join(' > ')}
            </span>
          )}
        </div>
      )}
    </>
  );
}

ChecklistItemPanel.displayName = 'ChecklistItemPanel';
