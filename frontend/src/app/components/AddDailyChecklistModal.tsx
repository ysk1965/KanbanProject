import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Loader2,
  CheckSquare,
  Plus,
  Search,
  Check,
} from 'lucide-react';
import {
  featureAPI,
  taskAPI,
  dailyChecklistAPI,
  boardAPI,
  milestoneAPI,
  boardChecklistAPI,
  FeatureResponse,
  BoardChecklistItemResponse,
  MilestoneSimpleResponse,
} from '../utils/api';

interface AddDailyChecklistModalProps {
  boardId: string;
  assigneeId: string;
  assignedDate: string;
  onAdd: () => void;
  onClose: () => void;
}

// 그룹핑된 데이터 구조
interface GroupedFeatureData {
  feature: {
    id: string;
    title: string;
    color: string;
  };
  tasks: GroupedTaskData[];
}

interface GroupedTaskData {
  task: {
    id: string;
    title: string;
  };
  checklistItems: BoardChecklistItemResponse[];
}

export function AddDailyChecklistModal({
  boardId,
  assigneeId,
  assignedDate,
  onAdd,
  onClose,
}: AddDailyChecklistModalProps) {
  const { t } = useTranslation();
  // 그룹핑된 체크리스트 데이터
  const [groupedData, setGroupedData] = useState<GroupedFeatureData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 마일스톤 필터 상태
  const [milestones, setMilestones] = useState<MilestoneSimpleResponse[]>([]);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);

  // Task별 인라인 체크리스트 추가 상태
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');

  // 임시로 추가된 새 체크리스트 (아직 서버에 저장 안 됨)
  const [pendingNewItems, setPendingNewItems] = useState<
    Map<string, { tempId: string; title: string }[]>
  >(new Map());

  // 이미 데일리 체크리스트에 추가된 항목 ID 목록
  const [addedChecklistItemIds, setAddedChecklistItemIds] = useState<Set<string>>(new Set());

  // 모든 데이터 로드 (최적화: 5회 API 호출로 통합)
  useEffect(() => {
    const loadAllData = async () => {
      setIsLoading(true);
      try {
        // 1단계: 초기 데이터 병렬 로드 (보드, 마일스톤, 이미 추가된 항목)
        const [boardResponse, milestonesResponse, dailyChecklistResponse] = await Promise.all([
          boardAPI.getBoard(boardId),
          milestoneAPI.getMilestones(boardId),
          dailyChecklistAPI.getDailyChecklist(boardId, assignedDate),
        ]);

        setMilestones(milestonesResponse.milestones);

        // 이미 추가된 항목 ID 수집
        const addedIds = new Set<string>();
        dailyChecklistResponse.columns.forEach((column) => {
          column.items.forEach((item) => {
            if (item.checklist_item_id) {
              addedIds.add(item.checklist_item_id);
            }
          });
        });
        setAddedChecklistItemIds(addedIds);

        // 초기 마일스톤 설정
        const initialMilestoneId = boardResponse.selected_milestone_id || null;
        if (selectedMilestoneId === null && initialMilestoneId) {
          setSelectedMilestoneId(initialMilestoneId);
        }

        // 2단계: Feature + Task + Checklist 병렬 로드
        const effectiveMilestoneId = selectedMilestoneId ?? initialMilestoneId;
        const [featuresResponse, tasksResponse, checklistsResponse] = await Promise.all([
          featureAPI.getFeatures(boardId, effectiveMilestoneId || undefined),
          taskAPI.getTasks(boardId, effectiveMilestoneId ? { milestone_id: effectiveMilestoneId } : undefined),
          boardChecklistAPI.getItems(boardId),
        ]);

        // 3단계: 프론트엔드에서 데이터 그룹핑
        const featureIds = new Set(featuresResponse.features.map(f => f.id));
        const featureMap = new Map(featuresResponse.features.map(f => [f.id, f]));

        // 마일스톤에 해당하는 Feature의 체크리스트만 필터링
        const filteredChecklists = checklistsResponse.items.filter(
          item => item.feature && featureIds.has(item.feature.id)
        );

        // Feature → Task → Checklist 그룹핑
        const grouped = new Map<string, Map<string, BoardChecklistItemResponse[]>>();

        filteredChecklists.forEach(item => {
          if (!item.feature || !item.task) return;

          if (!grouped.has(item.feature.id)) {
            grouped.set(item.feature.id, new Map());
          }

          const featureGroup = grouped.get(item.feature.id)!;
          if (!featureGroup.has(item.task.id)) {
            featureGroup.set(item.task.id, []);
          }

          featureGroup.get(item.task.id)!.push(item);
        });

        // 마일스톤의 모든 Task를 Feature별로 그룹핑 (체크리스트 없는 Task도 포함)
        const allTasks = tasksResponse.tasks.filter(t => featureIds.has(t.feature_id));
        allTasks.forEach(task => {
          if (!grouped.has(task.feature_id)) {
            grouped.set(task.feature_id, new Map());
          }
          const featureGroup = grouped.get(task.feature_id)!;
          if (!featureGroup.has(task.id)) {
            featureGroup.set(task.id, []);
          }
        });

        // GroupedFeatureData 배열로 변환 (모든 Feature/Task 포함)
        const result: GroupedFeatureData[] = [];

        // 마일스톤의 모든 Feature를 포함 (Task 유무 관계없이)
        featuresResponse.features.forEach(feature => {
          const taskMap = grouped.get(feature.id);
          const tasks: GroupedTaskData[] = [];

          if (taskMap) {
            // Task 정보를 allTasks에서 찾아 매핑
            const taskInfoMap = new Map(allTasks.filter(t => t.feature_id === feature.id).map(t => [t.id, t]));

            taskMap.forEach((checklistItems, taskId) => {
              const taskInfo = taskInfoMap.get(taskId);
              const firstItem = checklistItems[0];
              const taskTitle = taskInfo?.title || firstItem?.task?.title || '';

              if (taskTitle) {
                tasks.push({
                  task: { id: taskId, title: taskTitle },
                  checklistItems,
                });
              }
            });
          }

          result.push({
            feature: {
              id: feature.id,
              title: feature.title,
              color: feature.color,
            },
            tasks,
          });
        });

        setGroupedData(result);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError(t('dailyChecklist.loadFailed'));
      } finally {
        setIsLoading(false);
      }
    };
    loadAllData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, assignedDate, selectedMilestoneId]);

  // 모달 닫기 (부모 데이터 새로고침 포함)
  const handleClose = () => {
    onAdd(); // 부모 데이터 새로고침
    onClose();
  };

  // 체크리스트 아이템 선택/해제
  const toggleItem = (itemId: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // 선택된 항목 추가 (기존 항목 + 새 항목 구분)
  const handleAddSelected = async () => {
    if (selectedItems.size === 0) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // 선택된 항목들을 순차적으로 추가
      for (const itemId of selectedItems) {
        // temp_로 시작하면 새로 생성된 항목
        if (itemId.startsWith('temp_')) {
          // pendingNewItems에서 해당 항목 찾기
          for (const [taskId, items] of pendingNewItems.entries()) {
            const pendingItem = items.find((item) => item.tempId === itemId);
            if (pendingItem) {
              await dailyChecklistAPI.addWithNewItem(boardId, {
                task_id: taskId,
                title: pendingItem.title,
                assignee_id: assigneeId,
                assigned_date: assignedDate,
              });
              break;
            }
          }
        } else {
          // 기존 체크리스트 항목
          await dailyChecklistAPI.addItem(boardId, {
            checklist_item_id: itemId,
            assignee_id: assigneeId,
            assigned_date: assignedDate,
          });
        }
      }
      onAdd();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to add daily checklist items:', err);
      const errorMessage =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : t('dailyChecklist.addFailed');
      setError(errorMessage);
      setIsSubmitting(false);
    }
  };

  // 새 체크리스트 임시 추가 (UI에만 표시, 서버 저장 X)
  const handleAddPendingItem = (taskId: string) => {
    if (!taskId || !newItemTitle.trim()) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newItem = { tempId, title: newItemTitle.trim() };

    setPendingNewItems((prev) => {
      const newMap = new Map(prev);
      const existingItems = newMap.get(taskId) || [];
      newMap.set(taskId, [...existingItems, newItem]);
      return newMap;
    });

    // 자동으로 선택 상태로 추가
    setSelectedItems((prev) => new Set([...prev, tempId]));
    setNewItemTitle('');
  };

  // Task를 "내가 포함된 Task" vs "다른 Task"로 분류
  const { myTasksFeaturesData, othersTasksFeaturesData } = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    // 모든 Task를 필터링/변환
    const allProcessed = groupedData
      .map((featureData) => ({
        ...featureData,
        tasks: featureData.tasks.map((taskData) => {
          // 미완료 체크리스트만 필터링
          const uncompletedItems = taskData.checklistItems.filter(
            (item) => !item.completed
          );
          // 검색어 필터 적용
          const filteredItems = query
            ? uncompletedItems.filter((item) =>
                item.title.toLowerCase().includes(query)
              )
            : uncompletedItems;
          // 내가 담당자인 항목이 있는지 확인
          const hasMyItem = filteredItems.some(
            (item) => item.assignee?.id === assigneeId
          );
          // 체크리스트가 없는 Task도 표시 (검색 시 Task 제목 매칭)
          const hasNoChecklist = taskData.checklistItems.length === 0;
          const matchesSearch = !query || taskData.task.title.toLowerCase().includes(query);

          return {
            ...taskData,
            checklistItems: filteredItems,
            hasMyItem,
            hasNoChecklist,
            matchesSearch,
          };
        }),
      }));

    // "내가 포함된 Task" 분류
    const myTasksFeaturesData = allProcessed
      .map((featureData) => ({
        ...featureData,
        tasks: featureData.tasks.filter(
          (taskData) => taskData.checklistItems.length > 0 && taskData.hasMyItem
        ),
      }))
      .filter((featureData) => featureData.tasks.length > 0);

    // "다른 Task" 분류 (체크리스트 없는 Task 포함)
    const othersTasksFeaturesData = allProcessed
      .map((featureData) => ({
        ...featureData,
        tasks: featureData.tasks.filter(
          (taskData) =>
            (taskData.checklistItems.length > 0 && !taskData.hasMyItem) ||
            (taskData.hasNoChecklist && taskData.matchesSearch)
        ),
      }))
      .filter((featureData) => featureData.tasks.length > 0);

    return { myTasksFeaturesData, othersTasksFeaturesData };
  }, [groupedData, searchQuery, assigneeId]);


  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-kanban-bg rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">
              {t('dailyChecklist.addTitle')}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {t('dailyChecklist.selectPrompt')}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Milestone Filter & Search */}
        <div className="px-6 py-3 border-b border-white/10 flex gap-3">
          {/* 마일스톤 필터 */}
          <div className="w-48">
            <select
              value={selectedMilestoneId || ''}
              onChange={(e) => setSelectedMilestoneId(e.target.value || null)}
              disabled={isLoading}
              className="w-full px-3 py-2.5 bg-kanban-card border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all disabled:opacity-50"
            >
              <option value="">{t('dailyChecklist.allMilestones')}</option>
              {milestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('dailyChecklist.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 bg-kanban-card border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all text-sm"
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Content - Feature/Task/Checklist 그룹화 뷰 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-bridge-accent animate-spin" />
            </div>
          ) : myTasksFeaturesData.length === 0 && othersTasksFeaturesData.length === 0 ? (
            <div className="text-center py-12">
              <CheckSquare className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-400">
                {searchQuery
                  ? t('dailyChecklist.noSearchResults')
                  : t('dailyChecklist.noChecklists')}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {!searchQuery && t('dailyChecklist.noChecklistsHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 내가 포함된 Task 섹션 */}
              {myTasksFeaturesData.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-bridge-accent" />
                    <h3 className="text-sm font-bold text-white">{t('dailyChecklist.myTasks')}</h3>
                    <span className="text-xs text-slate-400">
                      ({myTasksFeaturesData.reduce((acc, f) => acc + f.tasks.length, 0)}개)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myTasksFeaturesData.map((featureData) => (
                      <div
                        key={featureData.feature.id}
                        className="bg-kanban-card border border-white/10 rounded-xl overflow-hidden"
                      >
                        {/* Feature Header */}
                        <div className="flex items-center gap-2 px-4 py-3">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: featureData.feature.color }}
                          />
                          <span className="font-medium text-white text-sm flex-1 truncate">
                            {featureData.feature.title}
                          </span>
                        </div>

                        {/* Feature Content */}
                        <div className="border-t border-white/10">
                          {featureData.tasks.map((taskData) => (
                            <div
                              key={taskData.task.id}
                              className="border-b border-white/10 last:border-b-0"
                            >
                              {/* Task Header */}
                              <div className="flex items-center gap-2 px-4 py-2.5">
                                <span className="text-sm text-slate-300 flex-1 truncate">
                                  {taskData.task.title}
                                </span>
                                <span className="text-xs text-bridge-accent font-medium">
                                  {taskData.checklistItems.length}
                                </span>
                                {/* + 버튼 */}
                                <button
                                  onClick={() => {
                                    setAddingTaskId(addingTaskId === taskData.task.id ? null : taskData.task.id);
                                    setNewItemTitle('');
                                  }}
                                  className={`p-1 rounded-md border transition-colors ${
                                    addingTaskId === taskData.task.id
                                      ? 'bg-bridge-accent text-white border-bridge-accent'
                                      : 'text-slate-300 border-white/10 bg-kanban-card hover:text-white hover:bg-kanban-card-hover hover:border-white/20'
                                  }`}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {/* 인라인 추가 폼 */}
                              {addingTaskId === taskData.task.id && (
                                <div className="px-4 pb-2">
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={newItemTitle}
                                      onChange={(e) => setNewItemTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.nativeEvent.isComposing) return;
                                        if (e.key === 'Enter' && newItemTitle.trim()) {
                                          handleAddPendingItem(taskData.task.id);
                                        } else if (e.key === 'Escape') {
                                          setAddingTaskId(null);
                                          setNewItemTitle('');
                                        }
                                      }}
                                      placeholder={t('dailyChecklist.newChecklistPlaceholder')}
                                      autoFocus
                                      className="flex-1 px-3 py-1.5 bg-kanban-card border border-white/10 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                                    />
                                    <button
                                      onClick={() => handleAddPendingItem(taskData.task.id)}
                                      disabled={!newItemTitle.trim()}
                                      className="p-1.5 bg-bridge-accent text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bridge-accent/90 transition-colors"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Checklist Items */}
                              <div className="bg-kanban-bg/50 px-2 py-1">
                                {/* 임시로 추가된 새 항목들 (pendingNewItems) */}
                                {(pendingNewItems.get(taskData.task.id) || []).map((pendingItem) => {
                                  const isSelected = selectedItems.has(pendingItem.tempId);
                                  return (
                                    <button
                                      key={pendingItem.tempId}
                                      onClick={() => toggleItem(pendingItem.tempId)}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left cursor-pointer ${
                                        isSelected
                                          ? 'bg-bridge-accent/20 ring-1 ring-bridge-accent/50'
                                          : 'hover:bg-white/5'
                                      }`}
                                    >
                                      <div
                                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                          isSelected
                                            ? 'bg-bridge-accent border-bridge-accent'
                                            : 'border-white/20 bg-white/5'
                                        }`}
                                      >
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                      </div>
                                      <span className={`text-sm flex-1 truncate ${isSelected ? 'text-white font-medium' : 'text-slate-300'}`}>
                                        {pendingItem.title}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bridge-secondary/20 text-bridge-secondary">
                                        {t('dailyChecklist.newItem')}
                                      </span>
                                    </button>
                                  );
                                })}
                                {/* 기존 체크리스트 항목들 */}
                                {taskData.checklistItems.map((item) => {
                                  const isSelected = selectedItems.has(item.id);
                                  const isAlreadyAdded = addedChecklistItemIds.has(item.id);
                                  const isMyItem = item.assignee?.id === assigneeId;
                                  const isDisabled = isAlreadyAdded || !isMyItem;
                                  return (
                                    <button
                                      key={item.id}
                                      onClick={() => !isDisabled && toggleItem(item.id)}
                                      disabled={isDisabled}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left ${
                                        isAlreadyAdded
                                          ? 'opacity-50 cursor-not-allowed'
                                          : !isMyItem
                                          ? 'opacity-60 cursor-not-allowed'
                                          : isSelected
                                          ? 'bg-bridge-accent/20 ring-1 ring-bridge-accent/50 cursor-pointer'
                                          : 'hover:bg-white/5 cursor-pointer'
                                      }`}
                                    >
                                      {/* 체크박스 */}
                                      <div
                                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                          isAlreadyAdded
                                            ? 'bg-slate-600 border-slate-600'
                                            : !isMyItem
                                            ? 'border-white/20 bg-white/5'
                                            : isSelected
                                            ? 'bg-bridge-accent border-bridge-accent'
                                            : 'border-white/20 bg-white/5'
                                        }`}
                                      >
                                        {(isSelected || isAlreadyAdded) && (
                                          <Check className="h-3 w-3 text-white" />
                                        )}
                                      </div>
                                      {/* 제목 */}
                                      <span
                                        className={`text-sm flex-1 truncate ${
                                          isAlreadyAdded
                                            ? 'text-slate-400 line-through'
                                            : !isMyItem
                                            ? 'text-slate-400'
                                            : isSelected
                                            ? 'text-white font-medium'
                                            : 'text-slate-300'
                                        }`}
                                      >
                                        {item.title}
                                      </span>
                                      {/* 담당자 표시 - 내 것은 인디고, 다른 사람은 회색 */}
                                      {item.assignee && (
                                        <span
                                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                                            isMyItem
                                              ? 'bg-bridge-accent/20 text-bridge-accent'
                                              : 'bg-white/5 text-slate-400'
                                          }`}
                                        >
                                          {item.assignee.name}
                                        </span>
                                      )}
                                      {/* 이미 추가됨 배지 */}
                                      {isAlreadyAdded && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded">
                                          {t('dailyChecklist.alreadyAdded')}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 내가 포함 안 된 Task 섹션 */}
              {othersTasksFeaturesData.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-slate-500" />
                    <h3 className="text-sm font-bold text-slate-400">{t('dailyChecklist.otherTasks')}</h3>
                    <span className="text-xs text-slate-400">
                      ({othersTasksFeaturesData.reduce((acc, f) => acc + f.tasks.length, 0)}개)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {othersTasksFeaturesData.map((featureData) => (
                      <div
                        key={featureData.feature.id}
                        className="bg-kanban-card border border-white/10 rounded-xl overflow-hidden"
                      >
                        {/* Feature Header */}
                        <div className="flex items-center gap-2 px-4 py-3">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0 opacity-60"
                            style={{ backgroundColor: featureData.feature.color }}
                          />
                          <span className="font-medium text-slate-400 text-sm flex-1 truncate">
                            {featureData.feature.title}
                          </span>
                        </div>

                        {/* Feature Content */}
                        <div className="border-t border-white/10">
                          {featureData.tasks.map((taskData) => (
                            <div
                              key={taskData.task.id}
                              className="border-b border-white/10 last:border-b-0"
                            >
                              {/* Task Header */}
                              <div className="flex items-center gap-2 px-4 py-2.5">
                                <span className="text-sm text-slate-400 flex-1 truncate">
                                  {taskData.task.title}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">
                                  {taskData.checklistItems.length}
                                </span>
                                {/* + 버튼 */}
                                <button
                                  onClick={() => {
                                    setAddingTaskId(addingTaskId === taskData.task.id ? null : taskData.task.id);
                                    setNewItemTitle('');
                                  }}
                                  className={`p-1 rounded-md border transition-colors ${
                                    addingTaskId === taskData.task.id
                                      ? 'bg-bridge-accent text-white border-bridge-accent'
                                      : 'text-slate-300 border-white/10 bg-kanban-card hover:text-white hover:bg-kanban-card-hover hover:border-white/20'
                                  }`}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {/* 인라인 추가 폼 */}
                              {addingTaskId === taskData.task.id && (
                                <div className="px-4 pb-2">
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      value={newItemTitle}
                                      onChange={(e) => setNewItemTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.nativeEvent.isComposing) return;
                                        if (e.key === 'Enter' && newItemTitle.trim()) {
                                          handleAddPendingItem(taskData.task.id);
                                        } else if (e.key === 'Escape') {
                                          setAddingTaskId(null);
                                          setNewItemTitle('');
                                        }
                                      }}
                                      placeholder={t('dailyChecklist.newChecklistPlaceholder')}
                                      autoFocus
                                      className="flex-1 px-3 py-1.5 bg-kanban-card border border-white/10 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                                    />
                                    <button
                                      onClick={() => handleAddPendingItem(taskData.task.id)}
                                      disabled={!newItemTitle.trim()}
                                      className="p-1.5 bg-bridge-accent text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bridge-accent/90 transition-colors"
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Checklist Items */}
                              <div className="bg-kanban-bg/50 px-2 py-1">
                                {/* 임시로 추가된 새 항목들 (pendingNewItems) */}
                                {(pendingNewItems.get(taskData.task.id) || []).map((pendingItem) => {
                                  const isSelected = selectedItems.has(pendingItem.tempId);
                                  return (
                                    <button
                                      key={pendingItem.tempId}
                                      onClick={() => toggleItem(pendingItem.tempId)}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left cursor-pointer ${
                                        isSelected
                                          ? 'bg-bridge-accent/20 ring-1 ring-bridge-accent/50'
                                          : 'hover:bg-white/5'
                                      }`}
                                    >
                                      <div
                                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                          isSelected
                                            ? 'bg-bridge-accent border-bridge-accent'
                                            : 'border-white/20 bg-white/5'
                                        }`}
                                      >
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                      </div>
                                      <span className={`text-sm flex-1 truncate ${isSelected ? 'text-white font-medium' : 'text-slate-300'}`}>
                                        {pendingItem.title}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bridge-secondary/20 text-bridge-secondary">
                                        {t('dailyChecklist.newItem')}
                                      </span>
                                    </button>
                                  );
                                })}
                                {/* 기존 체크리스트 - 모두 선택 불가 */}
                                {taskData.checklistItems.map((item) => {
                                  const isAlreadyAdded = addedChecklistItemIds.has(item.id);
                                  return (
                                    <div
                                      key={item.id}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left ${
                                        isAlreadyAdded ? 'opacity-40' : 'opacity-60'
                                      }`}
                                    >
                                      {/* 체크박스 (비활성) */}
                                      <div className="w-4 h-4 rounded border border-white/20 bg-white/5 flex-shrink-0 flex items-center justify-center">
                                        {isAlreadyAdded && (
                                          <Check className="h-3 w-3 text-slate-400" />
                                        )}
                                      </div>
                                      {/* 제목 */}
                                      <span
                                        className={`text-sm flex-1 truncate ${
                                          isAlreadyAdded
                                            ? 'text-slate-400 line-through'
                                            : 'text-slate-400'
                                        }`}
                                      >
                                        {item.title}
                                      </span>
                                      {/* 담당자 표시 */}
                                      {item.assignee && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-white/5 text-slate-400 rounded">
                                          {item.assignee.name}
                                        </span>
                                      )}
                                      {/* 이미 추가됨 배지 */}
                                      {isAlreadyAdded && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded">
                                          {t('dailyChecklist.alreadyAdded')}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            {selectedItems.size > 0 ? (
              <span>
                <span className="text-bridge-accent font-medium">
                  {t('dailyChecklist.selectedCount', { count: selectedItems.size })}
                </span>{' '}
                {t('dailyChecklist.selectedLabel')}
              </span>
            ) : (
              <span>{t('dailyChecklist.selectChecklist')}</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors border border-white/10 rounded-xl hover:bg-white/5"
            >
              {t('common.close')}
            </button>
            <button
              onClick={handleAddSelected}
              disabled={selectedItems.size === 0 || isSubmitting}
              className="px-5 py-2.5 bg-gradient-to-r from-bridge-accent to-purple-500 text-sm font-bold text-white rounded-xl shadow-lg shadow-bridge-accent/20 disabled:opacity-50 disabled:grayscale hover:shadow-bridge-accent/40 transition-all flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('dailyChecklist.adding')}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {t('dailyChecklist.addCount', { count: selectedItems.size })}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
