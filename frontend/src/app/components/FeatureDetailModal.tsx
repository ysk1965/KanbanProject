import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Feature, Task, Tag } from '../types';
import { FEATURE_COLORS } from '../constants';
import { X, Trash2, ChevronDown, ClipboardList, Lightbulb, ArrowRight, Pipette, FileText, CalendarIcon, Tags, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { TagPickerPopover } from './TagPickerPopover';
import { featureAPI, taskAPI } from '../utils/api';
import { FeatureAIDecomposeModal } from './FeatureAIDecomposeModal';

interface FeatureDetailModalProps {
  feature: Feature | null;
  tasks: Task[];
  blocks: Array<{ id: string; name: string }>;
  open: boolean;
  onClose: () => void;
  onAddSubtask: (title: string) => void;
  onRenameSubtask?: (taskId: string, newTitle: string) => void;
  onUpdateFeature: (feature: Partial<Feature>) => void;
  onDelete: (featureId: string) => void;
  availableTags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (tagId: string, data: { name?: string; color?: string }) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  boardId: string;
  canEdit?: boolean;
}

export function FeatureDetailModal({
  feature,
  tasks,
  blocks,
  open,
  onClose,
  onAddSubtask,
  onRenameSubtask,
  onUpdateFeature,
  onDelete,
  availableTags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  boardId,
  canEdit = true,
}: FeatureDetailModalProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [initialFeature, setInitialFeature] = useState<Feature | null>(null);
  const [editedFeature, setEditedFeature] = useState<Feature | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [flyingTask, setFlyingTask] = useState<{ title: string; x: number; y: number } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showAIDecompose, setShowAIDecompose] = useState(false);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (feature && open) {
      setInitialFeature(JSON.parse(JSON.stringify(feature)));
      setEditedFeature(JSON.parse(JSON.stringify(feature)));
      setHasChanges(false);
    }
  }, [feature, open]);

  useEffect(() => {
    if (initialFeature && editedFeature) {
      const changed = JSON.stringify(initialFeature) !== JSON.stringify(editedFeature);
      setHasChanges(changed);
    }
  }, [initialFeature, editedFeature]);

  if (!open || !feature || !editedFeature) return null;

  const progressPercent = feature.progress_percentage;
  const completedCount = feature.completed_tasks;
  const totalCount = feature.total_tasks;

  const handleClose = () => {
    if (hasChanges) {
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    if (hasChanges && editedFeature) {
      onUpdateFeature(editedFeature);
      setInitialFeature(JSON.parse(JSON.stringify(editedFeature)));
      setHasChanges(false);
    }
  };

  const handleDiscardAndClose = () => {
    setShowConfirmDialog(false);
    onClose();
  };

  const handleSaveAndClose = () => {
    if (editedFeature) {
      onUpdateFeature(editedFeature);
    }
    setShowConfirmDialog(false);
    onClose();
  };

  const updateEditedFeature = (updates: Partial<Feature>) => {
    setEditedFeature((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleStartEditTask = (task: Task) => {
    if (!canEdit) return;
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleSaveTaskTitle = async () => {
    if (!editingTaskId || !editingTaskTitle.trim()) {
      setEditingTaskId(null);
      return;
    }
    const newTitle = editingTaskTitle.trim();
    const originalTask = tasks.find((t) => t.id === editingTaskId);
    if (originalTask && originalTask.title !== newTitle) {
      try {
        await taskAPI.updateTask(boardId, editingTaskId, { title: newTitle });
        onRenameSubtask?.(editingTaskId, newTitle);
      } catch (error) {
        console.error('Failed to rename subtask:', error);
      }
    }
    setEditingTaskId(null);
  };

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      // 날아가는 애니메이션 트리거
      if (addBtnRef.current) {
        const rect = addBtnRef.current.getBoundingClientRect();
        setFlyingTask({
          title: newSubtaskTitle.trim(),
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
        setTimeout(() => setFlyingTask(null), 800);
      }
      onAddSubtask(newSubtaskTitle.trim());
      setNewSubtaskTitle('');
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (!feature) return;
    const currentTags = editedFeature.tags || [];
    const tagToAdd = availableTags.find((t) => t.id === tagId);
    if (tagToAdd && !currentTags.some((t) => t.id === tagId)) {
      updateEditedFeature({ tags: [...currentTags, tagToAdd] });
      try {
        await featureAPI.addTag(boardId, feature.id, tagId);
      } catch (error) {
        console.error('Failed to add tag:', error);
        updateEditedFeature({ tags: currentTags });
      }
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!feature) return;
    const currentTags = editedFeature.tags || [];
    updateEditedFeature({ tags: currentTags.filter((t) => t.id !== tagId) });
    try {
      await featureAPI.removeTag(boardId, feature.id, tagId);
    } catch (error) {
      console.error('Failed to remove tag:', error);
      updateEditedFeature({ tags: currentTags });
    }
  };

  const handleToggleTag = (tagId: string) => {
    const currentTags = editedFeature.tags || [];
    const isSelected = currentTags.some((t) => t.id === tagId);
    if (isSelected) {
      handleRemoveTag(tagId);
    } else {
      handleAddTag(tagId);
    }
  };

  const getBlockName = (blockId: string) => {
    return blocks.find((b) => b.id === blockId)?.name || blockId;
  };

  const featureTags = editedFeature.tags || [];
  const selectedColor = editedFeature.color || '#8B5CF6';

  return (
    <>
      {/* Main Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        onMouseDown={(e) => { mouseDownTargetRef.current = e.target; }}
        onClick={(e) => { if (e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget) handleClose(); }}
      >
        <div
          className="w-full max-w-xl bg-kanban-card text-zinc-300 rounded-2xl border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Feature color accent line */}
          <div className="h-[3px] w-full" style={{ backgroundColor: selectedColor }} />
          {/* Top Control Bar */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-kanban-border/30 bg-kanban-surface/20">
            <div className="flex items-center gap-3 flex-1">
              {canEdit ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="w-5 h-5 rounded-md shadow-lg flex-shrink-0 transition-all duration-300 hover:scale-125 cursor-pointer"
                      style={{
                        backgroundColor: selectedColor,
                        boxShadow: `0 0 15px ${selectedColor}88`,
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    />
                  </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-bridge-obsidian border-white/10" align="start" sideOffset={8}>
                  <div className="space-y-3">
                    <div className="grid grid-cols-5 gap-2">
                      {FEATURE_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => updateEditedFeature({ color })}
                          className={`w-7 h-7 rounded-full transition-all duration-200 ${
                            selectedColor === color
                              ? 'ring-2 ring-white ring-offset-2 ring-offset-bridge-obsidian scale-110'
                              : 'opacity-50 hover:opacity-100 hover:scale-110'
                          }`}
                          style={{
                            backgroundColor: color,
                            boxShadow: selectedColor === color ? `0 0 12px ${color}` : 'none',
                          }}
                        />
                      ))}
                    </div>
                    <div className="border-t border-white/10 pt-3">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <Pipette size={14} className="text-slate-400 group-hover:text-white transition-colors" />
                        <span className="text-[11px] text-slate-400 group-hover:text-white transition-colors">{t('featureDetail.customColor')}</span>
                        <input
                          type="color"
                          value={selectedColor}
                          onChange={(e) => updateEditedFeature({ color: e.target.value })}
                          className="w-6 h-6 rounded cursor-pointer border-none bg-transparent ml-auto [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-white/10 [&::-webkit-color-swatch]:border"
                        />
                      </label>
                    </div>
                  </div>
                </PopoverContent>
                </Popover>
              ) : (
                <div
                  className="w-5 h-5 rounded-md shadow-lg flex-shrink-0"
                  style={{
                    backgroundColor: selectedColor,
                    boxShadow: `0 0 15px ${selectedColor}88`,
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                />
              )}
              <input
                type="text"
                value={editedFeature.title}
                onChange={(e) => canEdit && updateEditedFeature({ title: e.target.value })}
                readOnly={!canEdit}
                className={`text-lg font-bold bg-transparent border-none focus:outline-none rounded w-full text-foreground placeholder-zinc-400 ${!canEdit ? 'cursor-default' : ''}`}
              />
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <>
                  <button
                    onClick={() => setShowDeleteDialog(true)}
                    className="p-2 text-zinc-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                  <div className="w-px h-4 bg-white/10 mx-1" />
                </>
              )}
              <button
                onClick={handleClose}
                className="p-2 text-zinc-400 hover:text-foreground transition-colors"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          <div className="px-6 py-6 space-y-5 max-h-[80vh] overflow-y-auto kanban-scrollbar">
            {/* Description Module */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('featureDetail.description')}</label>
              </div>
              <textarea
                placeholder={t('featureDetail.descriptionPlaceholder')}
                value={editedFeature.description || ''}
                onChange={(e) => canEdit && updateEditedFeature({ description: e.target.value })}
                readOnly={!canEdit}
                className={`w-full min-h-[100px] bg-kanban-bg/50 border border-kanban-border/30 rounded-xl p-4 text-zinc-300 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none text-sm leading-relaxed ${!canEdit ? 'cursor-default' : ''}`}
              />
            </section>

            {/* Core Specs Grid */}
            <div className="grid grid-cols-2 gap-6">
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-slate-400" />
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('featureDetail.dueDate')}</label>
                </div>
                {canEdit ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="w-full h-10 flex items-center gap-2 text-left bg-kanban-bg/50 border border-kanban-border/30 rounded-lg px-4 py-2.5 text-xs font-bold text-zinc-200 hover:bg-kanban-bg/70 transition-colors"
                      >
                        <CalendarIcon className="h-4 w-4 text-slate-400" />
                        {editedFeature.due_date ? (
                          format(new Date(editedFeature.due_date), 'yyyy. MM. dd.', { locale: ko })
                        ) : (
                          <span className="text-slate-400 font-normal">{t('featureDetail.selectDate')}</span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-bridge-obsidian border-white/10" align="start">
                      <Calendar
                        mode="single"
                        selected={editedFeature.due_date ? new Date(editedFeature.due_date) : undefined}
                        onSelect={(date: Date | undefined) => {
                          updateEditedFeature({
                            due_date: date ? format(date, 'yyyy-MM-dd') : null,
                          });
                        }}
                        locale={ko}
                        className="bg-bridge-obsidian text-foreground"
                      />
                      {editedFeature.due_date && (
                        <div className="p-2 border-t border-white/10">
                          <button
                            className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded transition-colors"
                            onClick={() => updateEditedFeature({ due_date: null })}
                          >
                            {t('featureDetail.removeDate')}
                          </button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="w-full h-10 flex items-center gap-2 bg-kanban-bg/50 border border-kanban-border/30 rounded-lg px-4 py-2.5 text-xs font-bold text-zinc-200 opacity-70">
                    <CalendarIcon className="h-4 w-4 text-slate-400" />
                    {editedFeature.due_date ? (
                      format(new Date(editedFeature.due_date), 'yyyy. MM. dd.', { locale: ko })
                    ) : (
                      <span className="text-slate-400 font-normal">{t('featureDetail.noDate')}</span>
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* Tags Section */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Tags className="h-4 w-4 text-slate-400" />
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('featureDetail.tags')}</label>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {featureTags.map((tag) => (
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
                        <X size={10} />
                      </button>
                    )}
                  </span>
                ))}
                {canEdit && (
                  <TagPickerPopover
                    selectedTagIds={featureTags.map((t) => t.id)}
                    availableTags={availableTags}
                    onToggleTag={handleToggleTag}
                    onCreateTag={onCreateTag}
                    onUpdateTag={onUpdateTag}
                    onDeleteTag={onDeleteTag}
                  />
                )}
              </div>
            </section>

            {/* Subtask Module */}
            <section className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardList size={14} className="text-indigo-400" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('featureDetail.subtaskList')}</span>
                  {canEdit && (
                    <button
                      onClick={() => setShowAIDecompose(true)}
                      className="ml-1 flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-bridge-accent bg-bridge-accent/10 rounded-lg hover:bg-bridge-accent/20 transition-all"
                    >
                      <Sparkles className="h-3 w-3" />
                      AI
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%`, backgroundColor: selectedColor }}
                    />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: selectedColor }}>
                    {Math.round(progressPercent)}%
                  </span>
                </div>
              </div>

              <div className="bg-kanban-bg/40 border border-kanban-border/30 rounded-xl overflow-hidden">
                {/* Task Entries */}
                <div className="divide-y divide-white/5">
                  {tasks.length === 0 && (
                    <div className="relative">
                      {/* 안내 메시지 */}
                      <div className="px-5 pt-5 pb-3 flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Lightbulb size={14} className="text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-zinc-300 mb-1">
                            {t('featureDetail.addSubtaskGuide')}
                          </p>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">
                            {t('featureDetail.subtaskDescription')}
                          </p>
                        </div>
                      </div>
                      {/* 예시 서브태스크 (시각적 가이드) */}
                      <div className="mx-4 mb-4 rounded-lg border border-dashed border-white/10 overflow-hidden opacity-40 pointer-events-none select-none">
                        <div className="px-3 py-1.5 bg-white/[0.02]">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">예시</span>
                        </div>
                        <div className="divide-y divide-white/5">
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" style={{ boxShadow: '0 0 8px rgba(129,140,248,0.27)' }} />
                              <span className="text-xs font-semibold text-zinc-400">API 엔드포인트 설계</span>
                            </div>
                            <span className="text-[10px] font-black tracking-widest text-zinc-500">→ TASK</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" style={{ boxShadow: '0 0 8px rgba(129,140,248,0.27)' }} />
                              <span className="text-xs font-semibold text-zinc-400">화면 UI 구현</span>
                            </div>
                            <span className="text-[10px] font-black tracking-widest text-zinc-500">→ IN PROGRESS</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" style={{ boxShadow: '0 0 8px rgba(129,140,248,0.27)' }} />
                              <span className="text-xs font-semibold text-zinc-400">테스트 코드 작성</span>
                            </div>
                            <span className="text-[10px] font-black tracking-widest text-zinc-500">→ DONE ✓</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors group"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: selectedColor,
                            boxShadow: `0 0 8px ${selectedColor}44`,
                          }}
                        />
                        {editingTaskId === task.id ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingTaskTitle}
                            onChange={(e) => setEditingTaskTitle(e.target.value)}
                            onBlur={handleSaveTaskTitle}
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing) return;
                              if (e.key === 'Enter') handleSaveTaskTitle();
                              if (e.key === 'Escape') setEditingTaskId(null);
                            }}
                            className="flex-1 text-xs font-semibold bg-white/5 border border-bridge-accent/50 rounded-md px-2 py-1 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                          />
                        ) : (
                          <span
                            className={`text-xs font-semibold text-zinc-300 group-hover:text-foreground transition-colors truncate ${canEdit ? 'cursor-text hover:bg-white/5 rounded px-1 -mx-1' : ''}`}
                            onDoubleClick={() => handleStartEditTask(task)}
                          >
                            {task.title}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-black text-zinc-400 flex-shrink-0 ml-2">
                        <span className="tracking-widest group-hover:text-indigo-400 transition-colors">
                          → {getBlockName(task.block_id).toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick Add Dock - Viewer는 서브태스크 추가 불가 */}
                {canEdit && (
                  <div className="bg-kanban-bg/30 p-2 flex gap-2 border-t border-kanban-border/20">
                    <input
                      type="text"
                      placeholder={t('featureDetail.newSubtaskPlaceholder')}
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === 'Enter') handleAddSubtask();
                      }}
                      className="flex-1 bg-kanban-bg/50 border border-kanban-border/30 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-bridge-accent/50 focus:border-bridge-accent text-zinc-300 placeholder-zinc-500 transition-all"
                    />
                    <button
                      ref={addBtnRef}
                      onClick={handleAddSubtask}
                      className="px-4 py-2 bg-indigo-600/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-500/20 hover:bg-indigo-600/20 hover:text-foreground transition-all active:scale-95"
                    >
                      ADD
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* 저장 버튼 - 변경사항이 있을 때만 표시 (Viewer는 저장 불가) */}
            {canEdit && hasChanges && (
              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={() => {
                    setEditedFeature(JSON.parse(JSON.stringify(initialFeature)));
                    setHasChanges(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-foreground bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  className="px-5 py-2 bg-bridge-accent text-white text-sm font-bold rounded-lg hover:bg-bridge-accent/90 transition-all"
                >
                  {t('common.save')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-kanban-card rounded-2xl border border-kanban-border/50 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground mb-2">{t('featureDetail.saveChangesTitle')}</h3>
            <p className="text-sm text-zinc-400 mb-6">
              {t('featureDetail.saveChangesDesc')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDiscardAndClose}
                className="flex-1 py-3 text-sm font-bold text-zinc-400 hover:text-foreground transition-colors border border-white/10 rounded-xl hover:bg-white/5"
              >
                {t('featureDetail.discard')}
              </button>
              <button
                onClick={handleSaveAndClose}
                className="flex-1 py-3 bg-bridge-accent text-sm font-bold rounded-xl hover:bg-bridge-accent/90 transition-colors text-white"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-kanban-card rounded-2xl border border-kanban-border/50 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground mb-2">{t('featureDetail.deleteTitle')}</h3>
            <p className="text-sm text-zinc-400 mb-6">
              {t('featureDetail.deleteDesc')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="flex-1 py-3 text-sm font-bold text-zinc-400 hover:text-foreground transition-colors border border-white/10 rounded-xl hover:bg-white/5"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  onDelete(feature.id);
                  onClose();
                }}
                className="flex-1 py-3 bg-red-500 text-sm font-bold rounded-xl hover:bg-red-600 transition-colors text-white"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flying task animation (portal) */}
      {showAIDecompose && feature && (
        <FeatureAIDecomposeModal
          boardId={boardId}
          featureId={feature.id}
          featureTitle={feature.title}
          existingTaskTitles={tasks.map(t => t.title)}
          onClose={() => setShowAIDecompose(false)}
          onApplied={() => {
            setShowAIDecompose(false);
          }}
        />
      )}

      {flyingTask &&
        createPortal(
          <AnimatePresence>
            <motion.div
              key="flying-task"
              initial={{ x: flyingTask.x, y: flyingTask.y, opacity: 1, scale: 1 }}
              animate={{
                x: window.innerWidth * 0.15,
                y: flyingTask.y - 120,
                opacity: 0,
                scale: 0.7,
              }}
              transition={{ duration: 0.65, ease: [0.32, 0.72, 0, 1] }}
              className="fixed z-[100] pointer-events-none"
              style={{ top: 0, left: 0 }}
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg shadow-[0_0_20px_rgba(99,102,241,0.5)]">
                <ArrowRight size={12} className="text-white" />
                <span className="text-xs font-bold text-white whitespace-nowrap">
                  TASK
                </span>
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
