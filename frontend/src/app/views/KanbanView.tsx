import {
  memo,
  useState,
  useMemo,
  Dispatch,
  SetStateAction,
  RefObject,
} from "react";
import { motion } from "framer-motion";
import { Eye, Plus, GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { Feature, Task, Tag, Block, ChecklistItem } from "../types";
import { KanbanBlock } from "../components/KanbanBlock";
import { SprintBoard } from "../components/SprintBoard";
import { KanbanFilterToolbar } from "../components/KanbanFilterToolbar";
import { EmptyBoardGuide } from "../components/EmptyBoardGuide";
import JoinRequestBanner from "../components/JoinRequestBanner";
import { FilterOptions } from "../components/FilterModal";
import { BoardMember as ShareBoardMember } from "../components/ShareBoardModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { blockService } from "../utils/services";

interface KanbanViewProps {
  boardId: string;
  searchInputRef: RefObject<HTMLInputElement>;
  // 데이터
  features: Feature[];
  filteredFeatures: Feature[];
  tasks: Task[];
  filteredTasks: Task[];
  tags: Tag[];
  boardMembersData: ShareBoardMember[];
  blocks: Block[];
  setBlocks: Dispatch<SetStateAction<Block[]>>;
  sortedBlocks: Block[];
  hiddenBlocks: Block[];
  checklistDataMap: { [taskId: string]: ChecklistItem[] };
  memberColorMap: Record<string, string | null>;
  expandedChecklistTaskIds: Set<string>;
  scheduledTaskIds: Set<string>;
  recentlyCompletedTaskIds: Set<string>;
  cascadeFeatureId: string | null;
  selectedFeatureIds: string[] | null;
  selectedMilestoneId: string;
  milestones: { id: string; title: string }[];
  isAdminOrOwner: boolean;
  filterOptions: FilterOptions;
  canEdit: boolean;
  isOrgMemberViewer: boolean;
  hasPendingJoinRequest: boolean;
  // 콜백
  onFilterChange: (options: FilterOptions) => void;
  onToggleFeatureChip: (featureId: string) => void;
  onSelectAllFeatureChips: () => void;
  onFeatureClick: (feature: Feature) => void;
  onOpenAddFeature: () => void;
  /** 스프린트 좌측 업무 리스트 "+" → 새 피쳐 생성(제목만) 후 상세 모달로 이어짐 */
  onCreateFeature?: (data: { title: string }) => Promise<Feature | null>;
  onOpenAddBlock: () => void;
  onTaskClick: (task: Task) => void;
  /** 스프린트 좌측 트리에서 체크리스트 행 클릭 → 태스크 모달(+ 해당 항목 하이라이트) */
  onOpenChecklistItem: (taskId: string, checklistItemId?: string) => void;
  onMoveTask: (taskId: string, targetBlock: string, newOrder: number) => void;
  onReorderTask: (taskId: string, blockId: string, newPosition: number) => void;
  onEditBlock: (block: Block) => void;
  onDeleteBlock: (blockId: string) => void;
  onToggleProgressBar: (blockId: string, enabled: boolean) => void;
  onHideBlock: (blockId: string) => void;
  onShowBlock: (blockId: string) => void;
  onToggleChecklistExpand: (taskId: string) => void;
  onQuickAddTask: (blockId: string) => void;
  onJoinRequestSent: () => void;
}

// 칸반 보드 뷰 — 블록 드래그(@dnd-kit) 상태와 블록별 태스크 맵을 자체 소유
export const KanbanView = memo(function KanbanView({
  boardId,
  searchInputRef,
  features,
  filteredFeatures,
  tasks,
  filteredTasks,
  tags,
  boardMembersData,
  blocks,
  setBlocks,
  sortedBlocks,
  hiddenBlocks,
  checklistDataMap,
  memberColorMap,
  expandedChecklistTaskIds,
  scheduledTaskIds,
  recentlyCompletedTaskIds,
  cascadeFeatureId,
  selectedFeatureIds,
  selectedMilestoneId,
  milestones,
  isAdminOrOwner,
  filterOptions,
  canEdit,
  isOrgMemberViewer,
  hasPendingJoinRequest,
  onFilterChange,
  onToggleFeatureChip,
  onSelectAllFeatureChips,
  onFeatureClick,
  onCreateFeature,
  onOpenAddFeature,
  onOpenAddBlock,
  onTaskClick,
  onOpenChecklistItem,
  onMoveTask,
  onReorderTask,
  onEditBlock,
  onDeleteBlock,
  onToggleProgressBar,
  onHideBlock,
  onShowBlock,
  onToggleChecklistExpand,
  onQuickAddTask,
  onJoinRequestSent,
}: KanbanViewProps) {
  const { t } = useTranslation();

  // 보드 모드: 블록 보드 ↔ 스프린트 (칸반 탭 내 토글, 보드별 유지)
  const [boardMode, setBoardModeState] = useState<"blocks" | "sprint">(() => {
    if (typeof window === "undefined") return "blocks";
    return (
      (localStorage.getItem(`kanbanBoardMode:${boardId}`) as
        "blocks" | "sprint" | null) ?? "blocks"
    );
  });
  const setBoardMode = (mode: "blocks" | "sprint") => {
    setBoardModeState(mode);
    try {
      localStorage.setItem(`kanbanBoardMode:${boardId}`, mode);
    } catch {
      /* noop */
    }
  };

  // @dnd-kit 블록 드래그 상태
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  const blockSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // SortableContext 대상 블록 (FEATURE/TASK 고정 블록 제외)
  const sortableBlocks = useMemo(
    () =>
      sortedBlocks.filter(
        (b) => b.fixed_type !== "FEATURE" && b.fixed_type !== "TASK",
      ),
    [sortedBlocks],
  );

  // Feature 칩 선택에 따른 태스크 필터링 여부
  const showFeatureLabel =
    selectedFeatureIds === null || selectedFeatureIds.length !== 1;

  // 블록별 태스크 맵 캐시 (KanbanBlock 메모이제이션용)
  const blockTasksMap = useMemo(() => {
    const map: Record<string, Task[]> = {};
    sortedBlocks.forEach((block) => {
      if (block.fixed_type === "FEATURE") return;
      let blockTasks = filteredTasks.filter(
        (task) => task.block_id === block.id,
      );
      if (selectedFeatureIds !== null) {
        blockTasks = blockTasks.filter((task) =>
          selectedFeatureIds.includes(task.feature_id),
        );
      }
      if (block.fixed_type === "TASK" && scheduledTaskIds.size > 0) {
        blockTasks = [...blockTasks].sort((a, b) => {
          const aScheduled = scheduledTaskIds.has(a.id) ? 0 : 1;
          const bScheduled = scheduledTaskIds.has(b.id) ? 0 : 1;
          if (aScheduled !== bScheduled) return aScheduled - bScheduled;
          return a.position - b.position;
        });
      } else {
        blockTasks = [...blockTasks].sort((a, b) => a.position - b.position);
      }
      map[block.id] = blockTasks;
    });
    return map;
  }, [filteredTasks, sortedBlocks, selectedFeatureIds, scheduledTaskIds]);

  // 스프린트 뷰 라벨(태그) 필터 판정용 맵 — SprintItemCard/JiraTask엔 태그가 없어 부모가 주입.
  const featureTagsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    features.forEach((f) => {
      if (f.tags?.length) map[f.id] = f.tags.map((t) => t.id);
    });
    return map;
  }, [features]);
  const taskTagsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    tasks.forEach((t) => {
      if (t.tags?.length) map[t.id] = t.tags.map((tag) => tag.id);
    });
    return map;
  }, [tasks]);

  // 숨긴 블록의 원래 상대 위치를 유지하면서 보이는 블록의 새 순서를 백엔드에 저장
  const persistBlockReorder = (newVisibleOrder: Block[]) => {
    if (!boardId) return;
    const visibleOrder = newVisibleOrder.map((b) => b.id);
    const visibleSet = new Set(visibleOrder);

    blockService
      .getBlocks(boardId)
      .then((allBlocks) => {
        const reorderIds: string[] = [];
        let visibleIdx = 0;
        for (const block of allBlocks) {
          if (visibleSet.has(block.id)) {
            reorderIds.push(visibleOrder[visibleIdx++]);
          } else {
            reorderIds.push(block.id);
          }
        }
        blockService.reorderBlocks(boardId, reorderIds).catch((error) => {
          console.error("Failed to reorder blocks:", error);
        });
      })
      .catch((error) => {
        console.error("Failed to load all blocks for reorder:", error);
      });
  };

  const handleBlockDragStart = (event: DragStartEvent) => {
    setActiveBlockId(event.active.id as string);
  };

  const handleBlockDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBlockId(null);

    if (!over || active.id === over.id) return;

    // SortableContext에 포함된 블록만 (FEATURE, TASK 제외)
    const oldIndex = sortableBlocks.findIndex((b) => b.id === active.id);
    const newIndex = sortableBlocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(sortableBlocks, oldIndex, newIndex);
    // FEATURE + TASK 블록을 앞에 유지
    const fixedBlocks = sortedBlocks.filter(
      (b) => b.fixed_type === "FEATURE" || b.fixed_type === "TASK",
    );
    const fullOrder = [...fixedBlocks, ...newOrder];

    const updatedBlocks = blocks.map((b) => {
      const newPos = fullOrder.findIndex((nb) => nb.id === b.id);
      return { ...b, position: newPos };
    });

    setBlocks(updatedBlocks);

    persistBlockReorder(fullOrder);
  };

  const activeBlock = activeBlockId
    ? sortedBlocks.find((b) => b.id === activeBlockId)
    : null;

  const taskBlock = sortedBlocks.find((b) => b.fixed_type === "TASK");

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-bridge-dark">
      {features.length === 0 ? (
        isOrgMemberViewer ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center max-w-md text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-bridge-accent/10 border border-bridge-accent/20 flex items-center justify-center mb-6">
                  <Eye className="h-7 w-7 text-bridge-accent" />
                </div>
                <h2 className="font-jakarta text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-3">
                  {t(
                    "board.joinRequest.emptyBoardTitle",
                    "아직 콘텐츠가 없는 보드입니다",
                  )}
                </h2>
                <p className="text-slate-400 font-normal text-sm md:text-base leading-relaxed mb-8">
                  {t(
                    "board.joinRequest.emptyBoardDesc",
                    "이 보드에 참가하면 Feature를 만들고 편집할 수 있습니다. 상단 배너에서 참가 신청을 해보세요.",
                  )}
                </p>
                {boardId && (
                  <JoinRequestBanner
                    boardId={boardId}
                    hasPendingRequest={hasPendingJoinRequest}
                    onRequestSent={onJoinRequestSent}
                  />
                )}
              </motion.div>
            </div>
          </div>
        ) : (
          <EmptyBoardGuide onCreateFeature={onOpenAddFeature} />
        )
      ) : (
        <>
          {/* 검색 + 필터 툴바 */}
          <KanbanFilterToolbar
            ref={searchInputRef}
            filterOptions={filterOptions}
            onFilterChange={onFilterChange}
            features={features}
            tags={tags}
            boardMembersData={boardMembersData}
            tasks={tasks}
            boardId={boardId}
            canEdit={canEdit}
          />
          {/* 블록 보드 ↔ 스프린트 모드 토글 */}
          <div className="shrink-0 flex items-center gap-1 px-4 md:px-6 pt-1 pb-2">
            <button
              onClick={() => setBoardMode("blocks")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                boardMode === "blocks"
                  ? "bg-bridge-accent/15 text-bridge-accent"
                  : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              블록 보드
            </button>
            <button
              onClick={() => setBoardMode("sprint")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                boardMode === "sprint"
                  ? "bg-bridge-accent/15 text-bridge-accent"
                  : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              스프린트
            </button>
          </div>

          {boardMode === "sprint" ? (
            <div className="flex-1 min-h-0">
              <SprintBoard
                boardId={boardId}
                milestones={milestones}
                canEdit={canEdit}
                isAdminOrOwner={isAdminOrOwner}
                onOpenChecklistItem={onOpenChecklistItem}
                onOpenFeature={(featureId) => {
                  const feature = features.find((f) => f.id === featureId);
                  if (feature) onFeatureClick(feature);
                }}
                onCreateFeature={onCreateFeature}
                milestoneId={
                  selectedMilestoneId !== "all" &&
                  selectedMilestoneId !== "none"
                    ? selectedMilestoneId
                    : undefined
                }
                filterOptions={filterOptions}
                featureTagsMap={featureTagsMap}
                taskTagsMap={taskTagsMap}
                memberOrder={boardMembersData.map((m) => m.userId)}
              />
            </div>
          ) : (
            /* 칸반 보드 */
            <div className="flex-1 p-3 md:p-6 overflow-x-auto overflow-y-hidden min-h-0 custom-scrollbar">
              <DndContext
                sensors={blockSensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToHorizontalAxis]}
                onDragStart={handleBlockDragStart}
                onDragEnd={handleBlockDragEnd}
              >
                <div className="flex gap-3 md:gap-4 min-w-max h-full">
                  {/* TASK 블록 (고정, SortableContext 밖) */}
                  {taskBlock && (
                    <div className="flex items-stretch gap-4">
                      <KanbanBlock
                        block={taskBlock}
                        tasks={blockTasksMap[taskBlock.id] || []}
                        onTaskClick={onTaskClick}
                        features={features}
                        onMoveTask={onMoveTask}
                        onReorderTask={onReorderTask}
                        boardId={boardId}
                        expandedChecklistTaskIds={expandedChecklistTaskIds}
                        onToggleChecklistExpand={onToggleChecklistExpand}
                        checklistDataMap={checklistDataMap}
                        memberColorMap={memberColorMap}
                        showFeatureLabel={showFeatureLabel}
                        scheduledTaskIds={scheduledTaskIds}
                        onQuickAddTask={canEdit ? onQuickAddTask : undefined}
                        recentlyCompletedTaskIds={recentlyCompletedTaskIds}
                        assigneeFilter={filterOptions.members}
                      />
                      <div className="flex flex-col gap-2 mt-4 self-start">
                        <button
                          onClick={onOpenAddBlock}
                          className="h-10 w-10 flex items-center justify-center rounded-xl border border-dashed border-bridge-border text-zinc-500 hover:text-foreground hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                        {hiddenBlocks.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-10 w-10 flex items-center justify-center rounded-xl border border-dashed border-bridge-border text-slate-400 hover:text-foreground hover:border-bridge-secondary/50 hover:bg-bridge-secondary/10 transition-all relative">
                                <Eye className="h-4 w-4" />
                                <span className="absolute -top-1 -right-1 text-xs font-bold bg-bridge-secondary text-white rounded-full w-4 h-4 flex items-center justify-center">
                                  {hiddenBlocks.length}
                                </span>
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              className="bg-bridge-surface border-bridge-border"
                            >
                              {hiddenBlocks.map((hb) => (
                                <DropdownMenuItem
                                  key={hb.id}
                                  onClick={() => onShowBlock(hb.id)}
                                  className="text-muted-foreground hover:bg-bridge-surface-hover hover:text-foreground text-xs"
                                >
                                  <Eye className="h-3 w-3 mr-2" />
                                  {hb.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 커스텀 블록 + Done (SortableContext 내부) */}
                  <SortableContext
                    items={sortableBlocks.map((b) => b.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {sortableBlocks.map((block) => (
                      <KanbanBlock
                        key={block.id}
                        block={block}
                        tasks={blockTasksMap[block.id] || []}
                        onTaskClick={onTaskClick}
                        features={features}
                        onMoveTask={onMoveTask}
                        onReorderTask={onReorderTask}
                        onEditBlock={onEditBlock}
                        onDeleteBlock={onDeleteBlock}
                        onToggleProgressBar={onToggleProgressBar}
                        onHideBlock={onHideBlock}
                        selectedMilestoneId={
                          selectedMilestoneId !== "all" &&
                          selectedMilestoneId !== "none"
                            ? selectedMilestoneId
                            : undefined
                        }
                        boardId={boardId}
                        expandedChecklistTaskIds={expandedChecklistTaskIds}
                        onToggleChecklistExpand={onToggleChecklistExpand}
                        checklistDataMap={checklistDataMap}
                        memberColorMap={memberColorMap}
                        showFeatureLabel={showFeatureLabel}
                        scheduledTaskIds={scheduledTaskIds}
                        onQuickAddTask={canEdit ? onQuickAddTask : undefined}
                        recentlyCompletedTaskIds={recentlyCompletedTaskIds}
                        assigneeFilter={filterOptions.members}
                      />
                    ))}
                  </SortableContext>
                </div>
                <DragOverlay>
                  {activeBlock && (
                    <div className="bg-bridge-surface rounded-2xl border border-bridge-accent/50 shadow-2xl shadow-bridge-accent/20 min-w-[260px] max-w-[280px] px-4 py-3 opacity-90">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-bridge-accent" />
                        {activeBlock.color && (
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: activeBlock.color }}
                          />
                        )}
                        <h3 className="font-bold text-sm text-foreground">
                          {activeBlock.name}
                        </h3>
                        <span className="text-xs font-medium text-zinc-400 bg-bridge-surface-hover px-2 py-0.5 rounded-md">
                          {(blockTasksMap[activeBlock.id] || []).length}
                        </span>
                      </div>
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            </div>
          )}
        </>
      )}
    </main>
  );
});
