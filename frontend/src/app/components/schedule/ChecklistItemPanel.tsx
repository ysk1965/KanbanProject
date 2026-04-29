import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelRightClose, Search, ChevronDown, ChevronRight, Loader2, Filter, X, Plus } from 'lucide-react';
import { AssigneeItemResponse, boardChecklistAPI } from '../../utils/api';
import { Milestone } from '../../types';
import { BoardMember } from '../ShareBoardModal';
import { ChecklistDragItem } from './ChecklistDragItem';
import { AddChecklistItemModal } from './AddChecklistItemModal';

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
  /** Called when a scheduled item is clicked (scroll-to in workload). */
  onScheduledItemClick?: (item: AssigneeItemResponse) => void;
  /** Board members for assignee selection in add modal. */
  boardMembers?: BoardMember[];
  /** Called after new items are added via modal (triggers parent refresh). */
  onItemAdded?: () => void;
  /** Board milestones (with their feature lists) for the milestone filter. */
  milestones?: Milestone[];
}

// ─── Feature group types ──────────────────────────────────────────────────────

const NO_FEATURE_KEY = '__no_feature__';

interface FeatureGroup {
  key: string;
  /** id is null for the "no feature" bucket. */
  featureId: string | null;
  title: string;
  color: string | null;
  items: AssigneeItemResponse[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupItemsByFeature(items: AssigneeItemResponse[], noFeatureLabel: string): FeatureGroup[] {
  const map = new Map<string, FeatureGroup>();
  for (const item of items) {
    const key = item.feature?.id ?? NO_FEATURE_KEY;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        featureId: item.feature?.id ?? null,
        title: item.feature?.title ?? noFeatureLabel,
        color: item.feature?.color ?? null,
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(item);
  }
  // Sort groups, then within each group sort: unscheduled first, scheduled last
  const groups = Array.from(map.values()).sort((a, b) => {
    if (a.featureId === null) return 1;
    if (b.featureId === null) return -1;
    return a.title.localeCompare(b.title);
  });
  for (const group of groups) {
    group.items.sort((a, b) => {
      const aScheduled = !!(a.start_date || a.due_date);
      const bScheduled = !!(b.start_date || b.due_date);
      if (aScheduled !== bScheduled) return aScheduled ? 1 : -1;
      return 0;
    });
  }
  return groups;
}

// ─── FeatureGroupSection sub-component ───────────────────────────────────────

interface FeatureGroupSectionProps {
  group: FeatureGroup;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FeatureGroupSection({
  group,
  isOpen,
  onToggle,
  children,
}: FeatureGroupSectionProps) {
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
        {group.color ? (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: group.color }}
            aria-hidden="true"
          />
        ) : (
          <span className="w-2 h-2 rounded-full shrink-0 bg-foreground/20" aria-hidden="true" />
        )}
        <span className="font-bold text-xs text-foreground truncate">{group.title}</span>
        <span className="ml-auto text-xs font-bold text-slate-500">{group.items.length}</span>
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
  onScheduledItemClick,
  boardMembers = [],
  onItemAdded,
  milestones = [],
}: ChecklistItemPanelProps) {
  const { t } = useTranslation();

  // ── Panel open/close ──
  const [isOpen, setIsOpen] = useState(true);

  // ── Add modal ──
  const [showAddModal, setShowAddModal] = useState(false);

  // ── Data ──
  const [items, setItems] = useState<AssigneeItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');

  // ── Milestone filter (narrows visible features to those in selected milestone) ──
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [showMilestoneDropdown, setShowMilestoneDropdown] = useState(false);
  const milestoneDropdownRef = useRef<HTMLDivElement>(null);

  // ── Feature group collapse state (collapsed feature ids) ──
  const [collapsedFeatureKeys, setCollapsedFeatureKeys] = useState<Set<string>>(new Set());

  // ── Scroll container ref (to preserve scroll position on item removal) ──
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Drag state ──
  const [dragState, setDragState] = useState<PanelDragState | null>(null);
  // Use refs for handlers that need the latest drag values inside document listeners
  const dragStateRef = useRef<PanelDragState | null>(null);

  // ── Load all items (both scheduled and unscheduled) ──
  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await boardChecklistAPI.getItems(boardId);
      setItems(response.items);
    } catch (err) {
      console.error('ChecklistItemPanel: failed to load items', err);
      setError(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    if (boardId) {
      loadItems();
    }
  }, [boardId, loadItems]);

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

  // ── Milestone options (only milestones that have features) ──
  const milestoneOptions = useMemo(() => {
    return milestones
      .filter((m) => (m.features?.length ?? 0) > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [milestones]);

  // ── Selected milestone's feature ids (used to filter items) ──
  const selectedMilestoneFeatureIds = useMemo(() => {
    if (!selectedMilestoneId) return null;
    const milestone = milestones.find((m) => m.id === selectedMilestoneId);
    if (!milestone?.features) return new Set<string>();
    return new Set(milestone.features.map((f) => f.id));
  }, [milestones, selectedMilestoneId]);

  // ── Reset milestone filter if its milestone disappears ──
  useEffect(() => {
    if (selectedMilestoneId && !milestones.some((m) => m.id === selectedMilestoneId)) {
      setSelectedMilestoneId(null);
    }
  }, [milestones, selectedMilestoneId]);

  // ── Close milestone dropdown on outside click ──
  useEffect(() => {
    if (!showMilestoneDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (milestoneDropdownRef.current && !milestoneDropdownRef.current.contains(e.target as Node)) {
        setShowMilestoneDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMilestoneDropdown]);

  // ── Toggle a feature group ──
  const toggleFeatureGroup = useCallback((key: string) => {
    setCollapsedFeatureKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
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
            // Save scroll position before removing item
            const savedScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
            // Optimistically remove from panel list
            setItems((prev) => prev.filter((i) => i.id !== finalState.item.id));
            // Restore scroll position after React re-render
            requestAnimationFrame(() => {
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = savedScrollTop;
              }
            });
          }
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onItemDropped],
  );

  // ── Filter items by search query + milestone (via feature ids) ──
  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedMilestoneFeatureIds) {
      result = result.filter(
        (item) => item.feature && selectedMilestoneFeatureIds.has(item.feature.id),
      );
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => item.title.toLowerCase().includes(q));
    }
    return result;
  }, [items, selectedMilestoneFeatureIds, searchQuery]);

  const noFeatureLabel = t('schedule.panel.noFeature', '피처 없음');
  const featureGroups = useMemo(
    () => groupItemsByFeature(filteredItems, noFeatureLabel),
    [filteredItems, noFeatureLabel],
  );

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
            className="text-xs font-bold uppercase tracking-widest"
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
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowAddModal(true)}
              aria-label={t('schedule.panel.addItem', 'Add checklist item')}
              className="p-1 rounded-lg text-slate-500 hover:text-foreground
                hover:bg-foreground/5 transition-colors"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              aria-label={t('common.close', 'Close')}
              className="p-1 rounded-lg text-slate-500 hover:text-foreground
                hover:bg-foreground/5 transition-colors"
            >
            <PanelRightClose size={16} aria-hidden="true" />
            </button>
          </div>
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

        {/* Milestone filter */}
        {milestoneOptions.length > 0 && (
          <div className="px-3 py-1.5 border-b border-foreground/[0.08]" ref={milestoneDropdownRef}>
            {selectedMilestoneId ? (
              // Active filter chip
              <button
                onClick={() => setSelectedMilestoneId(null)}
                className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-lg
                  bg-bridge-accent/10 text-bridge-accent text-xs font-medium
                  hover:bg-bridge-accent/15 transition-colors"
              >
                {(() => {
                  const ms = milestoneOptions.find((m) => m.id === selectedMilestoneId);
                  return ms ? <span className="truncate">{ms.title}</span> : null;
                })()}
                <X size={12} className="shrink-0 ml-0.5" />
              </button>
            ) : (
              // Filter toggle button
              <div className="relative">
                <button
                  onClick={() => setShowMilestoneDropdown((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg
                    text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                >
                  <Filter size={12} />
                  <span>{t('schedule.panel.filterMilestone', '마일스톤별 필터')}</span>
                  <ChevronDown size={10} className={`transition-transform ${showMilestoneDropdown ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown */}
                {showMilestoneDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-30
                    bg-bridge-obsidian border border-foreground/[0.08] rounded-lg shadow-xl
                    max-h-[200px] overflow-y-auto custom-scrollbar py-1">
                    {milestoneOptions.map((milestone) => (
                      <button
                        key={milestone.id}
                        onClick={() => {
                          setSelectedMilestoneId(milestone.id);
                          setShowMilestoneDropdown(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs
                          text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        <span className="truncate">{milestone.title}</span>
                        <span className="ml-auto text-xs text-slate-500 shrink-0">
                          {milestone.features?.length ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scrollable item list */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-3">
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
              {featureGroups.map((group) => (
                <FeatureGroupSection
                  key={group.key}
                  group={group}
                  isOpen={!collapsedFeatureKeys.has(group.key)}
                  onToggle={() => toggleFeatureGroup(group.key)}
                >
                  {group.items.map((item) => {
                    const scheduled = !!(item.start_date || item.due_date);
                    return (
                      <ChecklistDragItem
                        key={item.id}
                        item={item}
                        assignee={null}
                        isDragging={dragState?.item.id === item.id && dragState.isActive}
                        isScheduled={scheduled}
                        onMouseDown={handleItemMouseDown}
                        onDetailClick={onItemDetailClick}
                        onScheduledClick={() => onScheduledItemClick?.(item)}
                      />
                    );
                  })}
                </FeatureGroupSection>
              ))}
            </>
          )}
        </div>

        {/* Drag hint footer */}
        <div className="px-4 py-3 border-t border-foreground/[0.08]">
          <p className="text-xs text-slate-600 text-center leading-relaxed">
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
            <span className="text-xs text-slate-500 truncate block pl-1 mt-0.5">
              {[dragState.item.feature?.title, dragState.item.task?.title]
                .filter(Boolean)
                .join(' > ')}
            </span>
          )}
        </div>
      )}

      {/* Add checklist item modal */}
      {showAddModal && (
        <AddChecklistItemModal
          boardId={boardId}
          boardMembers={boardMembers}
          onAdd={() => {
            loadItems();
            onItemAdded?.();
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  );
}

ChecklistItemPanel.displayName = 'ChecklistItemPanel';
