import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Task, Tag, ChecklistItem, User, Block, Feature } from '../types';
import { checklistAPI, taskAPI, scheduleAPI, ScheduleBlockDetailResponse } from '../utils/api';
import { BoardMember } from './ShareBoardModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Badge } from './ui/badge';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { X, Plus, Trash2, Clock, CheckSquare, CalendarIcon, FileText, Tags, Users, Layers, Pencil, CheckCircle2, Undo2, ChevronDown, ChevronRight, Loader2, MessageSquare, Lightbulb, ArrowRightLeft } from 'lucide-react';
import { CommentPanel } from './CommentPanel';
import { TagPickerPopover } from './TagPickerPopover';
import { getAssigneeClasses, getInitials } from '../utils/assigneeColor';
import { Progress } from './ui/progress';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { getTodayDateString } from '../utils/dateUtils';

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
  onMoveToDone?: (taskId: string) => void;
  onMoveToBlock?: (taskId: string, blockId: string) => void;
  onMoveToFeature?: (taskId: string, featureId: string) => void;
  onMoveChecklistToTask?: (checklistItemId: string, sourceTaskId: string, targetTaskId: string) => void;
  blocks?: Block[];
  features?: Feature[];
  allTasks?: Task[];
  availableTags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (tagId: string, data: { name?: string; color?: string }) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  boardMembers: BoardMember[];
  currentUser: User | null;
  boardId: string | null;
  canEdit?: boolean;
  isAdminOrOwner?: boolean;
}

export function TaskDetailModal({
  task,
  open,
  onClose,
  onUpdate,
  onDelete,
  onMoveToDone,
  onMoveToBlock,
  onMoveToFeature,
  onMoveChecklistToTask,
  blocks = [],
  features = [],
  allTasks = [],
  availableTags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  boardMembers,
  currentUser,
  boardId,
  canEdit = true,
  isAdminOrOwner = false,
}: TaskDetailModalProps) {
  const { t } = useTranslation();

  // 변경사항 추적
  const [initialTask, setInitialTask] = useState<Task | null>(null);
  const [editedTask, setEditedTask] = useState<Task | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDoneDialog, setShowDoneDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showMoveFeatureDialog, setShowMoveFeatureDialog] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [showMoveChecklistDialog, setShowMoveChecklistDialog] = useState(false);
  const [moveChecklistItemId, setMoveChecklistItemId] = useState<string | null>(null);
  const [selectedTargetTaskId, setSelectedTargetTaskId] = useState<string | null>(null);
  const [checklistMoveSearch, setChecklistMoveSearch] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // 체크리스트 상태
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistItemToDelete, setChecklistItemToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (task && open) {
      setInitialTask(JSON.parse(JSON.stringify(task)));
      setEditedTask(JSON.parse(JSON.stringify(task)));
      setHasChanges(false);
      setIsEditingTitle(false);
      setChecklistItems([]); // 체크리스트 초기화

      // 체크리스트 API 로드
      if (boardId) {
        checklistAPI.getChecklist(boardId, task.id)
          .then((response) => {
            const items: ChecklistItem[] = response.items.map((item) => ({
              id: item.id,
              title: item.title,
              completed: item.completed,
              position: item.position,
              start_date: item.start_date,
              due_date: item.due_date,
              done_date: item.done_date,
              assignee: item.assignee ? { id: item.assignee.id, name: item.assignee.name, profile_image: item.assignee.profile_image } : null,
            }));
            setChecklistItems(items);
          })
          .catch((error) => {
            console.error('Failed to load checklist:', error);
          });
      }
    }
  }, [task, open, boardId]);

  useEffect(() => {
    if (initialTask && editedTask) {
      const changed = JSON.stringify(initialTask) !== JSON.stringify(editedTask);
      setHasChanges(changed);
    }
  }, [initialTask, editedTask]);

  if (!task || !editedTask) return null;

  const handleClose = () => {
    if (hasChanges) {
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    if (hasChanges && editedTask) {
      onUpdate(editedTask);
      setHasChanges(false);
    }
    onClose();
  };

  const handleDiscardAndClose = () => {
    setShowConfirmDialog(false);
    onClose();
  };

  const handleSaveAndClose = () => {
    if (editedTask) {
      onUpdate(editedTask);
    }
    setShowConfirmDialog(false);
    onClose();
  };

  const updateEditedTask = (updates: Partial<Task>) => {
    setEditedTask((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleAddTag = async (tagId: string) => {
    if (!boardId || !task) return;

    const currentTags = editedTask.tags || [];
    const tagToAdd = availableTags.find((t) => t.id === tagId);
    if (tagToAdd && !currentTags.some((t) => t.id === tagId)) {
      // 낙관적 업데이트
      updateEditedTask({ tags: [...currentTags, tagToAdd] });

      try {
        // API 호출: POST /boards/{boardId}/tasks/{taskId}/tags
        await taskAPI.addTag(boardId, task.id, tagId);
      } catch (error) {
        console.error('Failed to add tag:', error);
        // 롤백
        updateEditedTask({ tags: currentTags });
      }
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!boardId || !task) return;

    const currentTags = editedTask.tags || [];
    // 낙관적 업데이트
    updateEditedTask({ tags: currentTags.filter((t) => t.id !== tagId) });

    try {
      // API 호출: DELETE /boards/{boardId}/tasks/{taskId}/tags/{tagId}
      await taskAPI.removeTag(boardId, task.id, tagId);
    } catch (error) {
      console.error('Failed to remove tag:', error);
      // 롤백
      updateEditedTask({ tags: currentTags });
    }
  };

  const handleToggleTag = (tagId: string) => {
    const currentTags = editedTask.tags || [];
    const isSelected = currentTags.some((t) => t.id === tagId);
    if (isSelected) {
      handleRemoveTag(tagId);
    } else {
      handleAddTag(tagId);
    }
  };

  // 체크리스트 관련 함수
  const handleAddChecklistItem = async (data: {
    title: string;
    start_date?: string;
    due_date?: string;
    assignee_id?: string;
  }) => {
    if (!data.title.trim() || !boardId || !task) return;

    try {
      const response = await checklistAPI.addItem(boardId, task.id, {
        title: data.title.trim(),
        assignee_id: data.assignee_id,
        start_date: data.start_date,
        due_date: data.due_date,
      });

      const newItem: ChecklistItem = {
        id: response.id,
        title: response.title,
        completed: response.completed,
        position: response.position,
        start_date: response.start_date,
        due_date: response.due_date,
        done_date: response.done_date,
        assignee: response.assignee ? { id: response.assignee.id, name: response.assignee.name, profile_image: response.assignee.profile_image } : null,
      };

      const newItems = [...checklistItems, newItem];
      setChecklistItems(newItems);

      // 부모 상태 업데이트 (카드에 반영)
      const newTotal = newItems.length;
      const newCompleted = newItems.filter(item => item.completed).length;
      onUpdate({ checklist_total: newTotal, checklist_completed: newCompleted, checklist_version: Date.now() });
    } catch (error) {
      console.error('Failed to add checklist item:', error);
    }
  };

  const handleToggleChecklistItem = async (itemId: string) => {
    if (!boardId || !task) return;

    const prevItems = [...checklistItems];
    const targetItem = checklistItems.find((item) => item.id === itemId);
    if (!targetItem) return;

    const newCompleted = !targetItem.completed;
    const today = getTodayDateString();

    // 낙관적 업데이트 - done_date도 함께 업데이트
    const newItems = checklistItems.map((item) =>
      item.id === itemId
        ? {
            ...item,
            completed: newCompleted,
            done_date: newCompleted ? today : null, // 완료시 오늘 날짜, 미완료시 null
          }
        : item
    );
    setChecklistItems(newItems);

    try {
      await checklistAPI.toggleItem(boardId, task.id, itemId);
      // API 성공 후 부모 상태 업데이트 (카드 + 스케줄 뷰 반영)
      const completedCount = newItems.filter(item => item.completed).length;
      onUpdate({ checklist_total: newItems.length, checklist_completed: completedCount, checklist_version: Date.now() });
    } catch (error) {
      console.error('Failed to toggle checklist item:', error);
      // 롤백
      setChecklistItems(prevItems);
    }
  };

  const handleUpdateChecklistItem = async (itemId: string, updates: Partial<ChecklistItem>) => {
    if (!boardId || !task) return;

    // 낙관적 업데이트
    setChecklistItems(
      checklistItems.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      )
    );

    try {
      await checklistAPI.updateItem(boardId, task.id, itemId, {
        title: updates.title,
        assignee_id: updates.assignee?.id ?? null,
        start_date: updates.start_date ?? null,
        due_date: updates.due_date ?? null,
      });
      // 체크리스트 버전 업데이트하여 카드에 변경 알림
      onUpdate({ checklist_version: Date.now() });
    } catch (error) {
      console.error('Failed to update checklist item:', error);
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    if (!boardId || !task) return;

    const originalItems = [...checklistItems];
    // 낙관적 업데이트
    const newItems = checklistItems.filter((item) => item.id !== itemId);
    setChecklistItems(newItems);

    // 부모 task 상태 업데이트
    const newCompleted = newItems.filter(item => item.completed).length;
    onUpdate({ checklist_total: newItems.length, checklist_completed: newCompleted, checklist_version: Date.now() });

    try {
      await checklistAPI.deleteItem(boardId, task.id, itemId);
    } catch (error) {
      console.error('Failed to delete checklist item:', error);
      // 롤백
      setChecklistItems(originalItems);
      const rolledBackCompleted = originalItems.filter(item => item.completed).length;
      onUpdate({ checklist_total: originalItems.length, checklist_completed: rolledBackCompleted, checklist_version: Date.now() });
    }
  };

  // 체크리스트 진행률 계산
  const completedChecklistCount = checklistItems.filter((item) => item.completed).length;
  const checklistProgress = checklistItems.length > 0
    ? Math.round((completedChecklistCount / checklistItems.length) * 100)
    : 0;

  const taskTags = editedTask.tags || [];

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[1100px] max-h-[85vh] flex flex-col overflow-hidden bg-kanban-card border border-kanban-border/50 shadow-[0_0_60px_rgba(0,0,0,0.5)] text-foreground p-0 [&>button:last-child]:hidden" onPointerDownOutside={(e) => {
          if (hasChanges) {
            e.preventDefault();
            handleClose();
          }
        }}>
          {/* Feature color accent line */}
          <div className="h-[3px] w-full flex-shrink-0 rounded-t-lg" style={{ backgroundColor: task.feature_color }} />
          <div className="flex flex-1 min-h-0">
          {/* 왼쪽: 기존 태스크 상세 */}
          <div className="flex-1 overflow-y-auto p-6 pb-10 kanban-scrollbar">
          <DialogHeader>
            {/* 피처 & 블록 상태 표시 */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {/* 피처 뱃지 */}
              <div className="flex items-center gap-1">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: `${task.feature_color}20`, color: task.feature_color, border: `1px solid ${task.feature_color}40` }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: task.feature_color }} />
                  {task.feature_title}
                </div>
                {canEdit && onMoveToFeature && features.length > 1 && (
                  <button
                    onClick={() => setShowMoveFeatureDialog(true)}
                    className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    title={t('task.moveFeature')}
                  >
                    <ArrowRightLeft className="h-3 w-3" />
                  </button>
                )}
              </div>
              {/* 현재 블록 상태 */}
              {task.block_name && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-slate-300 border border-white/10">
                  <Layers className="h-3 w-3" />
                  {task.block_name}
                </div>
              )}
            </div>
            <DialogTitle>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 group">
                  {canEdit && isEditingTitle ? (
                    <Input
                      value={editedTask.title}
                      onChange={(e) => updateEditedTask({ title: e.target.value })}
                      onBlur={() => setIsEditingTitle(false)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          setIsEditingTitle(false);
                        }
                      }}
                      className="text-lg font-semibold border border-white/10 px-2 py-1 rounded-lg focus-visible:ring-1 focus-visible:ring-bridge-accent bg-white/5 text-foreground"
                      autoFocus
                    />
                  ) : (
                    <div
                      className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${canEdit ? 'cursor-pointer hover:bg-white/5' : ''}`}
                      onClick={() => canEdit && setIsEditingTitle(true)}
                    >
                      <span className="text-lg font-semibold text-foreground">
                        {editedTask.title}
                      </span>
                      {canEdit && <Pencil className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    {onMoveToDone && task.block_name !== 'Done' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDoneDialog(true)}
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                        title={t('task.markComplete')}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    {onMoveToBlock && task.block_name === 'Done' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowMoveDialog(true)}
                        className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                        title={t('task.moveBlock')}
                      >
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('task.editDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* 설명 섹션 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('task.description')}</Label>
              </div>
              <Textarea
                value={editedTask.description || ''}
                onChange={(e) => canEdit && updateEditedTask({ description: e.target.value })}
                placeholder={t('task.noDescription')}
                rows={3}
                readOnly={!canEdit}
                className={`bg-kanban-bg/50 border-kanban-border/30 text-foreground placeholder:text-slate-500 focus:ring-bridge-accent/50 focus:border-bridge-accent ${!canEdit ? 'cursor-default' : ''}`}
              />
            </div>

            {/* 기간 섹션 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-slate-400" />
                <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('task.period')}</Label>
              </div>
              {canEdit ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full h-10 justify-start text-left font-normal bg-kanban-bg/50 border-kanban-border/30 text-foreground hover:bg-kanban-bg/70 hover:text-foreground"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                      {editedTask.start_date || editedTask.due_date ? (
                        <>
                          {editedTask.start_date ? format(new Date(editedTask.start_date), 'yyyy. MM. dd.', { locale: ko }) : t('task.startDateTbd')}
                          {' ~ '}
                          {editedTask.due_date ? format(new Date(editedTask.due_date), 'yyyy. MM. dd.', { locale: ko }) : t('task.endDateTbd')}
                        </>
                      ) : (
                        <span className="text-slate-400">{t('task.selectDate')}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-bridge-obsidian border-white/10" align="start">
                    <Calendar
                      mode="range"
                      selected={{
                        from: editedTask.start_date ? new Date(editedTask.start_date) : undefined,
                        to: editedTask.due_date ? new Date(editedTask.due_date) : undefined,
                      }}
                      onSelect={(range) => {
                        updateEditedTask({
                          start_date: range?.from ? format(range.from, 'yyyy-MM-dd') : null,
                          due_date: range?.to ? format(range.to, 'yyyy-MM-dd') : null,
                        });
                      }}
                      numberOfMonths={2}
                      locale={ko}
                      className="bg-bridge-obsidian text-foreground"
                    />
                    {(editedTask.start_date || editedTask.due_date) && (
                      <div className="p-2 border-t border-white/10">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => updateEditedTask({ start_date: null, due_date: null })}
                        >
                          {t('task.deleteDate')}
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              ) : (
                <div className="w-full h-10 flex items-center bg-kanban-bg/50 border border-kanban-border/30 rounded-md px-3 text-foreground opacity-70">
                  <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                  {editedTask.start_date || editedTask.due_date ? (
                    <>
                      {editedTask.start_date ? format(new Date(editedTask.start_date), 'yyyy. MM. dd.', { locale: ko }) : t('task.startDateTbd')}
                      {' ~ '}
                      {editedTask.due_date ? format(new Date(editedTask.due_date), 'yyyy. MM. dd.', { locale: ko }) : t('task.endDateTbd')}
                    </>
                  ) : (
                    <span className="text-slate-400">{t('task.noDate')}</span>
                  )}
                </div>
              )}
            </div>

            {/* 담당자 섹션 (체크리스트 담당자들) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('task.assignee')}</Label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  // 체크리스트에서 중복 제거된 담당자 목록
                  const uniqueAssignees = checklistItems
                    .filter((item) => item.assignee)
                    .reduce((acc, item) => {
                      if (item.assignee && !acc.find((a) => a.id === item.assignee!.id)) {
                        acc.push(item.assignee);
                      }
                      return acc;
                    }, [] as Array<{ id: string; name: string; profile_image: string | null }>);

                  if (uniqueAssignees.length === 0) {
                    return <span className="text-sm text-slate-400">{t('task.addAssigneeToChecklist')}</span>;
                  }

                  return uniqueAssignees.map((assignee) => {
                    const memberData = boardMembers.find((m) => m.userId === assignee.id);
                    const color = getAssigneeClasses(assignee.name, memberData?.assigneeColor);
                    return (
                      <div key={assignee.id} className={`flex items-center gap-2 px-3 py-2 ${color.bgLight} border border-white/10 rounded-lg`}
                        style={!color.bgLight ? { backgroundColor: color.hex + '20' } : undefined}
                      >
                        <div className={`w-6 h-6 rounded-full ${color.bg} flex items-center justify-center text-xs text-white whitespace-nowrap overflow-hidden`}
                          style={!color.bg ? { backgroundColor: color.hex } : undefined}
                        >
                          {getInitials(assignee.name)}
                        </div>
                        <span className="text-sm text-foreground">{assignee.name}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* 태그 섹션 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tags className="h-4 w-4 text-slate-400" />
                <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('task.tags')}</Label>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {taskTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5"
                    style={{
                      backgroundColor: `${tag.color}15`,
                      borderColor: `${tag.color}44`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveTag(tag.id)}
                        className="hover:opacity-80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                {canEdit && (
                  <TagPickerPopover
                    selectedTagIds={taskTags.map((t) => t.id)}
                    availableTags={availableTags}
                    onToggleTag={handleToggleTag}
                    onCreateTag={onCreateTag}
                    onUpdateTag={onUpdateTag}
                    onDeleteTag={onDeleteTag}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 체크리스트 섹션 */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-indigo-400" />
                <Label className="text-base font-semibold text-foreground">CheckList</Label>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${checklistProgress}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-indigo-400">
                  {checklistProgress}%
                </span>
              </div>
            </div>

            {/* 체크리스트 항목들 */}
            <div className="space-y-2">
              {checklistItems.length === 0 && (
                <div className="flex items-start gap-3 px-1 py-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Lightbulb size={14} className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-300 mb-1">
                      {t('task.addChecklistHint')}
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      {t('task.addChecklistDesc')}
                    </p>
                  </div>
                </div>
              )}
              {checklistItems
                .sort((a, b) => a.position - b.position)
                .map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => handleToggleChecklistItem(item.id)}
                    onUpdate={(updates) => handleUpdateChecklistItem(item.id, updates)}
                    onDelete={() => setChecklistItemToDelete(item.id)}
                    onMoveToTask={onMoveChecklistToTask && allTasks.length > 1 ? () => {
                      setMoveChecklistItemId(item.id);
                      setShowMoveChecklistDialog(true);
                    } : undefined}
                    boardMembers={boardMembers}
                    boardId={boardId}
                    canEdit={canEdit}
                  />
                ))}

              {/* 새 항목 추가 - Viewer는 추가 불가 */}
              {canEdit && <AddChecklistItemInput onAdd={handleAddChecklistItem} boardMembers={boardMembers} currentUser={currentUser} />}
            </div>
          </div>

          {/* 저장 버튼 - 변경사항이 있을 때만 표시 (Viewer는 저장 불가) */}
          {canEdit && hasChanges && (
            <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
              <Button variant="outline" onClick={handleClose} className="bg-white/5 border-white/10 text-foreground hover:bg-white/10">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} className="bg-bridge-accent hover:bg-bridge-accent/90">
                {t('common.save')}
              </Button>
            </div>
          )}
          </div>

          {/* 오른쪽: 댓글 패널 + 닫기 버튼 */}
          {boardId && (
            <div className="w-[420px] border-l border-kanban-border/30 flex-shrink-0 relative bg-kanban-bg/30">
              {/* 닫기 버튼 */}
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 z-10 p-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <CommentPanel
                taskId={task.id}
                boardId={boardId}
                boardMembers={boardMembers}
                currentUser={currentUser}
                canEdit={canEdit}
                isAdminOrOwner={isAdminOrOwner}
              />
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 확인 다이얼로그 */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent className="bg-bridge-obsidian border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{t('task.saveChangesTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {t('task.saveChangesDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardAndClose} className="bg-white/5 border-white/10 text-foreground hover:bg-white/10">
              {t('task.discard')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveAndClose} className="bg-bridge-accent hover:bg-bridge-accent/90">
              {t('common.save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 다이얼로그 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-bridge-obsidian border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{t('task.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {t('task.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteDialog(false)} className="bg-white/5 border-white/10 text-foreground hover:bg-white/10">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (task) {
                  onDelete(task.id);
                }
                setShowDeleteDialog(false);
                onClose();
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 완료 처리 다이얼로그 */}
      <AlertDialog open={showDoneDialog} onOpenChange={setShowDoneDialog}>
        <AlertDialogContent className="bg-bridge-obsidian border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{t('task.completeTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {t('task.completeDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDoneDialog(false)} className="bg-white/5 border-white/10 text-foreground hover:bg-white/10">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (task && onMoveToDone) {
                  onMoveToDone(task.id);
                }
                setShowDoneDialog(false);
                onClose();
              }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {t('task.markComplete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 블록 이동 다이얼로그 */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent className="max-w-sm bg-bridge-obsidian border-white/10 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t('task.moveBlockTitle')}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {t('task.moveBlockDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {blocks
              .filter((b) => b.fixed_type !== 'FEATURE' && b.fixed_type !== 'DONE')
              .map((block) => (
                <button
                  key={block.id}
                  onClick={() => setSelectedBlockId(block.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                    selectedBlockId === block.id
                      ? 'border-bridge-accent bg-bridge-accent/10'
                      : 'border-white/10 hover:border-white/10 hover:bg-white/5'
                  }`}
                >
                  <Layers className="h-4 w-4 text-slate-400" />
                  <span className="text-foreground">{block.name}</span>
                </button>
              ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMoveDialog(false);
                setSelectedBlockId(null);
              }}
              className="bg-white/5 border-white/10 text-foreground hover:bg-white/10"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (task && onMoveToBlock && selectedBlockId) {
                  onMoveToBlock(task.id, selectedBlockId);
                }
                setShowMoveDialog(false);
                setSelectedBlockId(null);
                onClose();
              }}
              disabled={!selectedBlockId}
              className="bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50"
            >
              {t('task.move')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Feature 이동 다이얼로그 */}
      <Dialog open={showMoveFeatureDialog} onOpenChange={setShowMoveFeatureDialog}>
        <DialogContent className="max-w-sm bg-bridge-obsidian border-white/10 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t('task.moveFeatureTitle')}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {t('task.moveFeatureDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4 max-h-[300px] overflow-y-auto kanban-scrollbar">
            {features
              .filter((f) => f.id !== task?.feature_id)
              .map((feature) => (
                <button
                  key={feature.id}
                  onClick={() => setSelectedFeatureId(feature.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                    selectedFeatureId === feature.id
                      ? 'border-bridge-accent bg-bridge-accent/10'
                      : 'border-white/10 hover:border-white/10 hover:bg-white/5'
                  }`}
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: feature.color }} />
                  <span className="text-foreground text-sm truncate">{feature.title}</span>
                </button>
              ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMoveFeatureDialog(false);
                setSelectedFeatureId(null);
              }}
              className="bg-white/5 border-white/10 text-foreground hover:bg-white/10"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (task && onMoveToFeature && selectedFeatureId) {
                  onMoveToFeature(task.id, selectedFeatureId);
                }
                setShowMoveFeatureDialog(false);
                setSelectedFeatureId(null);
                onClose();
              }}
              disabled={!selectedFeatureId}
              className="bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50"
            >
              {t('task.move')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 체크리스트 항목 Task 이동 다이얼로그 */}
      <Dialog open={showMoveChecklistDialog} onOpenChange={(open) => {
        if (!open) {
          setShowMoveChecklistDialog(false);
          setMoveChecklistItemId(null);
          setSelectedTargetTaskId(null);
          setChecklistMoveSearch('');
        }
      }}>
        <DialogContent className="max-w-sm bg-bridge-obsidian border-white/10 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t('task.moveChecklistToTaskTitle')}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {t('task.moveChecklistToTaskDesc')}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={checklistMoveSearch}
            onChange={(e) => setChecklistMoveSearch(e.target.value)}
            placeholder={t('common.search')}
            className="bg-white/5 border-white/10 text-foreground placeholder:text-slate-500 text-sm"
          />
          <div className="space-y-1 py-2 max-h-[250px] overflow-y-auto kanban-scrollbar">
            {allTasks
              .filter((t) => t.id !== task?.id)
              .filter((t) => !checklistMoveSearch || t.title.toLowerCase().includes(checklistMoveSearch.toLowerCase()) || t.feature_title.toLowerCase().includes(checklistMoveSearch.toLowerCase()))
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTargetTaskId(t.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-left ${
                    selectedTargetTaskId === t.id
                      ? 'border-bridge-accent bg-bridge-accent/10'
                      : 'border-white/10 hover:bg-white/5'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.feature_color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground truncate">{t.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{t.feature_title}</div>
                  </div>
                </button>
              ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMoveChecklistDialog(false);
                setMoveChecklistItemId(null);
                setSelectedTargetTaskId(null);
                setChecklistMoveSearch('');
              }}
              className="bg-white/5 border-white/10 text-foreground hover:bg-white/10"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (task && onMoveChecklistToTask && moveChecklistItemId && selectedTargetTaskId) {
                  onMoveChecklistToTask(moveChecklistItemId, task.id, selectedTargetTaskId);
                  // UI에서 항목 제거
                  setChecklistItems((prev) => prev.filter((ci) => ci.id !== moveChecklistItemId));
                  const remaining = checklistItems.filter((ci) => ci.id !== moveChecklistItemId);
                  const completedCount = remaining.filter((ci) => ci.completed).length;
                  onUpdate({
                    checklist_total: remaining.length,
                    checklist_completed: completedCount,
                    checklist_version: (task.checklist_version || 0) + 1,
                  });
                }
                setShowMoveChecklistDialog(false);
                setMoveChecklistItemId(null);
                setSelectedTargetTaskId(null);
                setChecklistMoveSearch('');
              }}
              disabled={!selectedTargetTaskId}
              className="bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50"
            >
              {t('task.move')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 체크리스트 아이템 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!checklistItemToDelete} onOpenChange={(open) => !open && setChecklistItemToDelete(null)}>
        <AlertDialogContent className="bg-bridge-obsidian border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">{t('task.deleteChecklistTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {t('task.deleteChecklistDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setChecklistItemToDelete(null)} className="bg-white/5 border-white/10 text-foreground hover:bg-white/10">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (checklistItemToDelete) {
                  handleDeleteChecklistItem(checklistItemToDelete);
                }
                setChecklistItemToDelete(null);
              }}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// 체크리스트 항목 컴포넌트
function ChecklistItemRow({
  item,
  onToggle,
  onUpdate,
  onDelete,
  onMoveToTask,
  boardMembers,
  boardId,
  canEdit = true,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onUpdate: (updates: Partial<ChecklistItem>) => void;
  onDelete: () => void;
  onMoveToTask?: () => void;
  boardMembers: BoardMember[];
  boardId: string | null;
  canEdit?: boolean;
}) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(item.title);
  const [showOptions, setShowOptions] = useState(false);
  const [showTimeBlocks, setShowTimeBlocks] = useState(false);
  const [timeBlocks, setTimeBlocks] = useState<ScheduleBlockDetailResponse[]>([]);
  const [isLoadingTimeBlocks, setIsLoadingTimeBlocks] = useState(false);

  // 담당자 색상
  const memberData = item.assignee ? boardMembers.find((m) => m.userId === item.assignee!.id) : null;
  const assigneeColor = item.assignee ? getAssigneeClasses(item.assignee.name, memberData?.assigneeColor) : null;

  // 마운트 시 타임블록 자동 로드
  useEffect(() => {
    if (boardId) {
      setIsLoadingTimeBlocks(true);
      scheduleAPI.getByChecklistItem(boardId, item.id)
        .then(setTimeBlocks)
        .catch(() => {})
        .finally(() => setIsLoadingTimeBlocks(false));
    }
  }, [boardId, item.id]);

  // 타임블록 총합 시간 (분)
  const totalTimeMinutes = timeBlocks.reduce((sum, block) => {
    return sum + Math.round((new Date(`2000-01-01T${block.end_time}`).getTime() - new Date(`2000-01-01T${block.start_time}`).getTime()) / 60000);
  }, 0);

  // 타임블록 토글
  const handleToggleTimeBlocks = () => {
    setShowTimeBlocks(!showTimeBlocks);
  };

  const handleSaveTitle = () => {
    if (editedTitle.trim() && editedTitle !== item.title) {
      onUpdate({ title: editedTitle.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setEditedTitle(item.title);
      setIsEditing(false);
    }
  };

  // 마감일 상태 확인
  const isOverdue =
    item.due_date && new Date(item.due_date) < new Date() && !item.completed;
  const isDueSoon =
    item.due_date &&
    new Date(item.due_date).getTime() - new Date().getTime() < 86400000 &&
    !item.completed;

  return (
    <>
    <div className="group flex items-center gap-2 p-2 rounded hover:bg-white/5 border border-transparent hover:border-white/10">
      {/* 체크박스 */}
      <button
        onClick={canEdit ? onToggle : undefined}
        disabled={!canEdit}
        className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
          item.completed ? 'bg-green-500' : 'bg-slate-600 hover:bg-slate-500'
        } ${!canEdit ? 'cursor-default' : ''}`}
      >
        {item.completed && (
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M5 13l4 4L19 7"></path>
          </svg>
        )}
      </button>

      {/* 제목 - 왼쪽 정렬 */}
      <div className="flex-1 min-w-0">
        {canEdit && isEditing ? (
          <Input
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={handleKeyDown}
            className="text-xs h-6 bg-white/5 border-white/10 text-foreground"
            autoFocus
          />
        ) : (
          <div
            className={`text-xs truncate ${
              item.completed ? 'line-through text-slate-400' : 'text-foreground'
            } ${canEdit ? 'cursor-pointer' : ''}`}
            onClick={() => canEdit && setIsEditing(true)}
          >
            {item.title}
          </div>
        )}
      </div>

      {/* 오른쪽 정렬: 기간 + 담당자 (클릭해서 수정) */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* 기간 - 클릭하면 수정 (Viewer는 읽기 전용) */}
        {canEdit ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors ${
                  isOverdue
                    ? 'text-red-400'
                    : isDueSoon
                    ? 'text-orange-400'
                    : 'text-slate-400'
                }`}
              >
                <CalendarIcon className="h-3 w-3" />
                {(() => {
                  const endDate = item.completed && item.done_date ? item.done_date : item.due_date;
                  if (item.start_date || endDate) {
                    if (item.start_date && endDate) {
                      return <>{format(new Date(item.start_date), 'M/d', { locale: ko })} - {format(new Date(endDate), 'M/d', { locale: ko })}</>;
                    } else if (item.start_date) {
                      return <>{format(new Date(item.start_date), 'M/d', { locale: ko })} ~</>;
                    } else {
                      return <>~ {format(new Date(endDate!), 'M/d', { locale: ko })}</>;
                    }
                  }
                  return <span className="text-slate-400">{t('task.date')}</span>;
                })()}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-bridge-obsidian border-white/10" align="end">
              <Calendar
                mode="range"
                selected={{
                  from: item.start_date ? new Date(item.start_date) : undefined,
                  to: item.due_date ? new Date(item.due_date) : undefined,
                }}
                onSelect={(range) => {
                  onUpdate({
                    start_date: range?.from ? format(range.from, 'yyyy-MM-dd') : null,
                    due_date: range?.to ? format(range.to, 'yyyy-MM-dd') : null,
                  });
                }}
                numberOfMonths={1}
                locale={ko}
                className="bg-bridge-obsidian text-foreground"
              />
              {(item.start_date || item.due_date) && (
                <div className="p-2 border-t border-white/10">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => onUpdate({ start_date: null, due_date: null })}
                  >
                    {t('task.deleteDate')}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        ) : (
          <div
            className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 ${
              isOverdue ? 'text-red-400' : isDueSoon ? 'text-orange-400' : 'text-slate-400'
            }`}
          >
            <CalendarIcon className="h-3 w-3" />
            {(() => {
              const endDate = item.completed && item.done_date ? item.done_date : item.due_date;
              if (item.start_date || endDate) {
                if (item.start_date && endDate) {
                  return <>{format(new Date(item.start_date), 'M/d', { locale: ko })} - {format(new Date(endDate), 'M/d', { locale: ko })}</>;
                } else if (item.start_date) {
                  return <>{format(new Date(item.start_date), 'M/d', { locale: ko })} ~</>;
                } else {
                  return <>~ {format(new Date(endDate!), 'M/d', { locale: ko })}</>;
                }
              }
              return <span className="text-slate-400">-</span>;
            })()}
          </div>
        )}

        {/* 담당자 - 클릭하면 수정 (Viewer는 읽기 전용) */}
        {canEdit ? (
          <Popover>
            <PopoverTrigger asChild>
              {item.assignee && assigneeColor ? (
                <button
                  className={`flex items-center gap-1 ${assigneeColor.bgLight} rounded-full px-1.5 py-0.5 hover:opacity-80 transition-opacity`}
                  style={!assigneeColor.bgLight ? { backgroundColor: assigneeColor.hex + '20' } : undefined}
                >
                  <div
                    className={`w-4 h-4 rounded-full ${assigneeColor.bg} flex items-center justify-center text-[9px] font-bold text-white whitespace-nowrap overflow-hidden`}
                    style={!assigneeColor.bg ? { backgroundColor: assigneeColor.hex } : undefined}
                  >
                    {getInitials(item.assignee.name)}
                  </div>
                  <span
                    className={`text-[10px] font-medium ${assigneeColor.text}`}
                    style={!assigneeColor.text ? { color: assigneeColor.hex } : undefined}
                  >
                    {item.assignee.name}
                  </span>
                </button>
              ) : (
                <button className="flex items-center gap-1 text-[11px] text-slate-400 px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors">
                  <div className="w-4 h-4 rounded-full bg-slate-600 flex items-center justify-center text-[9px] text-slate-400">
                    ?
                  </div>
                </button>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1 bg-bridge-obsidian border-white/10" align="end">
              <div className="space-y-0.5">
                <button
                  onClick={() => onUpdate({ assignee: null })}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-white/10 transition-colors ${
                    !item.assignee ? 'bg-white/10 text-foreground' : 'text-slate-300'
                  }`}
                >
                  {t('common.none')}
                </button>
                {boardMembers.map((member) => {
                  const memberColor = getAssigneeClasses(member.name, member.assigneeColor);
                  return (
                    <button
                      key={member.userId}
                      onClick={() => onUpdate({ assignee: { id: member.userId, name: member.name, profile_image: member.avatar || null } })}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-white/10 transition-colors ${
                        item.assignee?.id === member.userId ? 'bg-white/10 text-foreground' : 'text-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full ${memberColor.bg} flex items-center justify-center text-[9px] font-bold text-white whitespace-nowrap overflow-hidden`}
                        style={!memberColor.bg ? { backgroundColor: memberColor.hex } : undefined}
                      >
                        {getInitials(member.name)}
                      </div>
                      {member.name}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          // Viewer: 읽기 전용 담당자 표시
          item.assignee && assigneeColor ? (
            <div
              className={`flex items-center gap-1 ${assigneeColor.bgLight} rounded-full px-1.5 py-0.5`}
              style={!assigneeColor.bgLight ? { backgroundColor: assigneeColor.hex + '20' } : undefined}
            >
              <div
                className={`w-4 h-4 rounded-full ${assigneeColor.bg} flex items-center justify-center text-[9px] font-bold text-white whitespace-nowrap overflow-hidden`}
                style={!assigneeColor.bg ? { backgroundColor: assigneeColor.hex } : undefined}
              >
                {getInitials(item.assignee.name)}
              </div>
              <span
                className={`text-[10px] font-medium ${assigneeColor.text}`}
                style={!assigneeColor.text ? { color: assigneeColor.hex } : undefined}
              >
                {item.assignee.name}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-slate-400 px-1.5 py-0.5">
              <div className="w-4 h-4 rounded-full bg-slate-600 flex items-center justify-center text-[9px] text-slate-400">
                ?
              </div>
            </div>
          )
        )}
      </div>

      {/* 타임블록 총합 시간 + 토글 버튼 */}
      {totalTimeMinutes > 0 && (
        <span className="text-[11px] text-bridge-accent font-medium whitespace-nowrap">
          {(() => {
            const h = Math.floor(totalTimeMinutes / 60);
            const m = totalTimeMinutes % 60;
            return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}` : `${totalTimeMinutes}m`;
          })()}
        </span>
      )}
      <button
        onClick={handleToggleTimeBlocks}
        className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
          showTimeBlocks || timeBlocks.length > 0
            ? 'text-bridge-accent bg-bridge-accent/10'
            : 'text-slate-400 hover:text-slate-400 hover:bg-white/5'
        }`}
        title={t('task.viewTimeBlocks')}
      >
        {isLoadingTimeBlocks ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : showTimeBlocks ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
      </button>

      {/* 이동/삭제 버튼 - Viewer는 불가 */}
      {canEdit && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          {onMoveToTask && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              onClick={onMoveToTask}
              title={t('task.moveChecklistToTask')}
            >
              <ArrowRightLeft className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>

    {/* 타임블록 리스트 */}
    {showTimeBlocks && (
      <div className="ml-6 mt-1 mb-2 space-y-1">
        {timeBlocks.length === 0 ? (
          <div className="text-xs text-slate-400 py-1 px-2">
            {t('task.noTimeBlocks')}
          </div>
        ) : (
          <>
            {timeBlocks.map((block) => (
              <div
                key={block.id}
                className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-white/[0.02] border border-white/15"
              >
                <CalendarIcon className="h-3 w-3 text-slate-400" />
                <span className="text-slate-400">
                  {format(new Date(block.scheduled_date), 'M/d (E)', { locale: ko })}
                </span>
                <Clock className="h-3 w-3 text-slate-400" />
                <span className="text-foreground font-medium">
                  {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                </span>
                <span className="text-slate-400">
                  ({Math.round((new Date(`2000-01-01T${block.end_time}`).getTime() - new Date(`2000-01-01T${block.start_time}`).getTime()) / 60000)}분)
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    )}
  </>
  );
}

// 체크리스트 항목 추가 입력
function AddChecklistItemInput({
  onAdd,
  boardMembers,
  currentUser,
}: {
  onAdd: (data: { title: string; start_date?: string; due_date?: string; assignee_id?: string }) => void;
  boardMembers: BoardMember[];
  currentUser: User | null;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [assigneeId, setAssigneeId] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // 기본값 설정: 현재 사용자를 담당자로, 오늘 날짜를 시작일로
  const handleStartAdding = () => {
    setIsAdding(true);
    // 시작일을 오늘로 설정
    setDateRange({ from: new Date(), to: undefined });
    // 현재 사용자가 보드 멤버인지 확인하고 기본값으로 설정
    if (currentUser) {
      const currentMember = boardMembers.find(m => m.userId === currentUser.id);
      if (currentMember) {
        setAssigneeId(currentUser.id);
      }
    }
  };

  const handleAdd = () => {
    if (value.trim()) {
      onAdd({
        title: value,
        start_date: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        due_date: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
        assignee_id: assigneeId || undefined,
      });
      setValue('');
      setDateRange(undefined);
      setAssigneeId('');
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      handleAdd();
    } else if (e.key === 'Escape') {
      setValue('');
      setDateRange(undefined);
      setAssigneeId('');
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setValue('');
    setDateRange(undefined);
    setAssigneeId('');
    setIsAdding(false);
  };

  // 선택된 담당자 정보 가져오기
  const selectedMember = assigneeId ? boardMembers.find(m => m.userId === assigneeId) : null;

  if (!isAdding) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-slate-400 hover:text-foreground hover:bg-white/5"
        onClick={handleStartAdding}
      >
        <Plus className="h-4 w-4 mr-2" />
        {t('task.addChecklistItem')}
      </Button>
    );
  }

  return (
    <div className="p-3 border border-white/10 rounded-lg bg-white/5">
      <div className="flex gap-2 items-start">
        <div className="w-4 h-4 rounded bg-slate-600 flex-shrink-0 mt-1.5" />
        <div className="flex-1 space-y-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('task.checklistItemPlaceholder')}
            className="text-xs h-7 bg-white/5 border-white/10 text-foreground placeholder:text-slate-400"
            autoFocus
          />

          {/* 옵션 필드들 */}
          <div className="flex gap-2 pt-2 border-t border-white/10">
              {/* 날짜 범위 선택 */}
              <div className="flex-1">
                <label className="text-xs text-slate-400 block mb-1">{t('task.period')}</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full h-7 text-xs justify-start text-left font-normal bg-white/5 border-white/10 text-foreground hover:bg-white/10"
                    >
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, 'MM/dd', { locale: ko })} -{' '}
                            {format(dateRange.to, 'MM/dd', { locale: ko })}
                          </>
                        ) : (
                          format(dateRange.from, 'MM/dd', { locale: ko })
                        )
                      ) : (
                        <span className="text-slate-400">{t('task.selectDate')}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-bridge-obsidian border-white/10" align="start">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={1}
                      locale={ko}
                      className="bg-bridge-obsidian text-foreground"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* 담당자 */}
              <div className="flex-1">
                <label className="text-xs text-slate-400 block mb-1">{t('task.assignee')}</label>
                <Select
                  value={assigneeId || 'none'}
                  onValueChange={(val) => setAssigneeId(val === 'none' ? '' : val)}
                >
                  <SelectTrigger className="h-7 text-xs bg-white/5 border-white/10 text-foreground">
                    {selectedMember ? (
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded-full bg-bridge-accent flex items-center justify-center text-[10px] text-white flex-shrink-0 whitespace-nowrap overflow-hidden">
                          {getInitials(selectedMember.name)}
                        </div>
                        <span>{selectedMember.name}</span>
                      </div>
                    ) : (
                      <SelectValue placeholder={t('common.none')} />
                    )}
                  </SelectTrigger>
                  <SelectContent className="bg-bridge-obsidian border-white/10">
                    <SelectItem value="none" className="text-foreground hover:bg-white/10">
                      <span className="text-xs">{t('common.none')}</span>
                    </SelectItem>
                    {boardMembers.map((member) => (
                      <SelectItem key={member.userId} value={member.userId} className="text-foreground hover:bg-white/10">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-bridge-accent flex items-center justify-center text-[10px] text-white flex-shrink-0 whitespace-nowrap overflow-hidden">
                            {getInitials(member.name)}
                          </div>
                          <span className="text-xs">{member.name}</span>
                          {member.userId === currentUser?.id && (
                            <span className="text-[10px] text-slate-400">(나)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
        </div>
      </div>

      {/* 버튼 영역 */}
      <div className="flex justify-end gap-2 mt-2">
        <Button size="sm" onClick={handleAdd} className="h-7 bg-bridge-accent hover:bg-bridge-accent/90">
          {t('common.add')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          className="h-7 text-slate-400 hover:text-foreground hover:bg-white/10"
        >
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}