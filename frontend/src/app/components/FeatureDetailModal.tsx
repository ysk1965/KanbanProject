import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Feature, Task, Tag } from '../types';
import { FEATURE_COLORS } from '../constants';
import { X, Trash2, ClipboardList, Lightbulb, ArrowRight, ArrowRightLeft, Pipette, FileText, CalendarIcon, Tags, Sparkles, Pencil, AlertTriangle, ChevronDown } from 'lucide-react';
import { MotionModal } from './ui/MotionModal';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { useTranslation } from 'react-i18next';
import { TagPickerPopover } from './TagPickerPopover';
import { featureAPI, taskAPI } from '../utils/api';
import { FeatureAIDecomposeModal } from './FeatureAIDecomposeModal';
import { isDomainAIHidden } from '../utils/domain';

interface FeatureDetailModalProps {
  feature: Feature | null;
  tasks: Task[];
  blocks: Array<{ id: string; name: string }>;
  open: boolean;
  onClose: () => void;
  onAddSubtask: (title: string) => void;
  onRenameSubtask?: (taskId: string, newTitle: string) => void;
  onUpdateFeature: (feature: Partial<Feature>) => void;
  onDelete: (featureId: string, taskMigrations?: Array<{ task_id: string; target_feature_id: string }>) => void;
  allFeatures: Feature[];
  availableTags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (tagId: string, data: { name?: string; color?: string }) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  boardId: string;
  canEdit?: boolean;
  isOnboarding?: boolean;
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
  allFeatures,
  availableTags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  boardId,
  canEdit = true,
  isOnboarding = false,
}: FeatureDetailModalProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [initialFeature, setInitialFeature] = useState<Feature | null>(null);
  const [editedFeature, setEditedFeature] = useState<Feature | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [taskMigrationMap, setTaskMigrationMap] = useState<Record<string, string>>({});
  const [bulkTargetFeatureId, setBulkTargetFeatureId] = useState<string>('');
  const [flyingTask, setFlyingTask] = useState<{ title: string; x: number; y: number } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showAIConfirm, setShowAIConfirm] = useState(false);
  const [showAIDecompose, setShowAIDecompose] = useState(false);
  const [dateCalendarOpen, setDateCalendarOpen] = useState(false);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (feature && open) {
      setInitialFeature(JSON.parse(JSON.stringify(feature)));
      setEditedFeature(JSON.parse(JSON.stringify(feature)));
      setHasChanges(false);
      setIsEditingTitle(false);
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
      <MotionModal open={open} onClose={handleClose} overlayClose={!hasChanges} className="sm:max-w-xl max-h-[85dvh] flex flex-col overflow-hidden bg-bridge-surface p-0">
          {/* Feature color accent line */}
          <div className="h-[3px] w-full flex-shrink-0 rounded-t-lg" style={{ backgroundColor: selectedColor }} />

          {/* Top Control Bar */}
          <div className="px-6 py-4 border-b border-bridge-border/30 flex-shrink-0">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 group">
                  {/* Color Picker */}
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
                      <PopoverContent className="w-auto p-3 bg-bridge-obsidian border-foreground/10" align="start" sideOffset={8}>
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
                          <div className="border-t border-foreground/10 pt-3">
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <Pipette size={14} className="text-slate-400 group-hover:text-foreground transition-colors" />
                              <span className="text-[11px] text-slate-400 group-hover:text-foreground transition-colors">{t('featureDetail.customColor')}</span>
                              <input
                                type="color"
                                value={selectedColor}
                                onChange={(e) => updateEditedFeature({ color: e.target.value })}
                                className="w-6 h-6 rounded cursor-pointer border-none bg-transparent ml-auto [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-foreground/10 [&::-webkit-color-swatch]:border"
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

                  {/* Title - hover to edit */}
                  {canEdit && isEditingTitle ? (
                    <Input
                      value={editedFeature.title}
                      onChange={(e) => updateEditedFeature({ title: e.target.value })}
                      onBlur={() => setIsEditingTitle(false)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          setIsEditingTitle(false);
                        }
                      }}
                      className="text-lg font-semibold border border-foreground/10 px-2 py-1 rounded-lg focus-visible:ring-1 focus-visible:ring-bridge-accent bg-foreground/5 text-foreground"
                      autoFocus
                    />
                  ) : (
                    <div
                      className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${canEdit ? 'cursor-pointer hover:bg-foreground/5' : ''}`}
                      onClick={() => canEdit && setIsEditingTitle(true)}
                    >
                      <span className="text-lg font-semibold text-foreground">
                        {editedFeature.title}
                      </span>
                      {canEdit && <Pencil className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  <button
                    onClick={handleClose}
                    className="p-2 text-slate-400 hover:text-foreground transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 pb-10 kanban-scrollbar">
            <div className="space-y-5">
              {/* Description Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('featureDetail.description')}</Label>
                </div>
                <Textarea
                  placeholder={t('featureDetail.descriptionPlaceholder')}
                  value={editedFeature.description || ''}
                  onChange={(e) => canEdit && updateEditedFeature({ description: e.target.value })}
                  readOnly={!canEdit}
                  rows={5}
                  className={`bg-bridge-dark/50 border-bridge-border/30 text-foreground placeholder:text-slate-500 focus:ring-bridge-accent/50 focus:border-bridge-accent ${!canEdit ? 'cursor-default' : ''}`}
                />
              </div>

              {/* Date Range Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-slate-400" />
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('featureDetail.dateRange')}</Label>
                </div>
                {canEdit ? (
                  <Popover open={dateCalendarOpen} onOpenChange={setDateCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-10 justify-start text-left font-normal bg-bridge-dark/50 border-bridge-border/30 text-foreground hover:bg-bridge-dark/70 hover:text-foreground"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                        {editedFeature.start_date || editedFeature.due_date ? (
                          <span>
                            {editedFeature.start_date
                              ? format(new Date(editedFeature.start_date), 'yyyy. MM. dd.', { locale: ko })
                              : '?'}
                            {' ~ '}
                            {editedFeature.due_date
                              ? format(new Date(editedFeature.due_date), 'yyyy. MM. dd.', { locale: ko })
                              : '?'}
                          </span>
                        ) : (
                          <span className="text-slate-400">{t('featureDetail.selectDateRange')}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-bridge-obsidian border-foreground/10" align="start">
                      <Calendar
                        mode="range"
                        selected={
                          editedFeature.start_date || editedFeature.due_date
                            ? {
                                from: editedFeature.start_date ? new Date(editedFeature.start_date) : undefined,
                                to: editedFeature.due_date ? new Date(editedFeature.due_date) : undefined,
                              }
                            : undefined
                        }
                        onSelect={(range: DateRange | undefined) => {
                          updateEditedFeature({
                            start_date: range?.from ? format(range.from, 'yyyy-MM-dd') : null,
                            due_date: range?.to ? format(range.to, 'yyyy-MM-dd') : null,
                          });
                        }}
                        numberOfMonths={2}
                        locale={ko}
                        className="bg-bridge-obsidian text-foreground"
                      />
                      {(editedFeature.start_date || editedFeature.due_date) && (
                        <div className="p-2 border-t border-foreground/10 flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => updateEditedFeature({ start_date: null, due_date: null })}
                          >
                            {t('featureDetail.removeDate')}
                          </Button>
                          {editedFeature.start_date && editedFeature.due_date && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-1 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 font-bold"
                              onClick={() => setDateCalendarOpen(false)}
                            >
                              {t('common.confirm', '확인')}
                            </Button>
                          )}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="w-full h-10 flex items-center bg-bridge-dark/50 border border-bridge-border/30 rounded-md px-3 text-foreground opacity-70">
                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                    {editedFeature.start_date || editedFeature.due_date ? (
                      <span>
                        {editedFeature.start_date
                          ? format(new Date(editedFeature.start_date), 'yyyy. MM. dd.', { locale: ko })
                          : '?'}
                        {' ~ '}
                        {editedFeature.due_date
                          ? format(new Date(editedFeature.due_date), 'yyyy. MM. dd.', { locale: ko })
                          : '?'}
                      </span>
                    ) : (
                      <span className="text-slate-400">{t('featureDetail.noDate')}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Tags Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Tags className="h-4 w-4 text-slate-400" />
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{t('featureDetail.tags')}</Label>
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
              </div>

              {/* Subtask Module */}
              <div className={`mt-6 pt-6 border-t border-foreground/10 relative ${isOnboarding && tasks.length === 0 ? 'z-10' : ''}`}>
                <div className="flex items-center justify-between mb-4 relative">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" style={{ color: selectedColor }} />
                    <Label className="text-base font-semibold text-foreground">{t('featureDetail.subtaskList')}</Label>
                    {canEdit && !isDomainAIHidden && (
                      <button
                        onClick={() => setShowAIConfirm(true)}
                        className="ml-1 flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-white bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-lg hover:shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all"
                      >
                        <Sparkles className="h-3 w-3" />
                        AI
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-foreground/10 rounded-full overflow-hidden">
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

                <div className={`relative bg-bridge-dark/40 rounded-xl overflow-hidden transition-all duration-500 ${isOnboarding && tasks.length === 0 ? 'border-2 border-bridge-accent/50' : 'border border-bridge-border/30'}`}>
                  {/* 온보딩 펄스 글로우 */}
                  {isOnboarding && tasks.length === 0 && (
                    <motion.div
                      className="absolute inset-0 rounded-xl pointer-events-none z-0"
                      animate={{ boxShadow: [
                        '0 0 0 2px rgba(99,102,241,0.2), 0 0 15px rgba(99,102,241,0.08)',
                        '0 0 0 3px rgba(99,102,241,0.5), 0 0 40px rgba(99,102,241,0.2), 0 0 80px rgba(99,102,241,0.08)',
                        '0 0 0 2px rgba(99,102,241,0.2), 0 0 15px rgba(99,102,241,0.08)',
                      ] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  {/* Task Entries */}
                  <div className="divide-y divide-white/5 relative z-[1]">
                    {tasks.length === 0 && (
                      <div className="relative">
                        {isOnboarding ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 22 }}
                            className="m-4 p-4 rounded-xl bg-gradient-to-r from-bridge-accent/15 via-purple-500/10 to-bridge-accent/15 border border-bridge-accent/30"
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <motion.div
                                animate={{ scale: [1, 1.2, 1], boxShadow: [
                                  '0 0 0 0 rgba(99,102,241,0)',
                                  '0 0 0 8px rgba(99,102,241,0.2)',
                                  '0 0 0 0 rgba(99,102,241,0)',
                                ] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="px-2.5 h-8 rounded-lg bg-gradient-to-br from-bridge-accent to-purple-500 flex items-center justify-center flex-shrink-0"
                              >
                                <span className="text-[10px] font-black text-white tracking-widest uppercase">Step 2</span>
                              </motion.div>
                              <div className="flex-1">
                                <p className="text-sm font-bold text-white">
                                  {t('featureDetail.onboardingStep2')}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {t('featureDetail.subtaskDescription')}
                                </p>
                              </div>
                            </div>
                            {/* 포인팅 화살표 */}
                            <motion.div
                              animate={{ y: [0, 4, 0] }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                              className="flex items-center justify-center gap-1.5 text-bridge-accent/70"
                            >
                              <ArrowRight className="h-3.5 w-3.5 rotate-90" />
                              <span className="text-[10px] font-bold tracking-wider uppercase">{t('featureDetail.addSubtaskGuide')}</span>
                              <ArrowRight className="h-3.5 w-3.5 rotate-90" />
                            </motion.div>
                          </motion.div>
                        ) : (
                          <>
                            <div className="px-5 pt-5 pb-3 flex items-start gap-3">
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: `${selectedColor}15` }}
                              >
                                <Lightbulb size={14} style={{ color: selectedColor }} />
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-foreground mb-1">
                                  {t('featureDetail.addSubtaskGuide')}
                                </p>
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                  {t('featureDetail.subtaskDescription')}
                                </p>
                              </div>
                            </div>
                          </>
                        )}
                        {/* Example subtasks (visual guide) */}
                        <div className="mx-4 mb-4 rounded-lg border border-dashed border-foreground/10 overflow-hidden opacity-40 pointer-events-none select-none">
                          <div className="px-3 py-1.5 bg-white/[0.02]">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">예시</span>
                          </div>
                          <div className="divide-y divide-white/5">
                            {['API 엔드포인트 설계', '화면 UI 구현', '테스트 코드 작성'].map((title, i) => (
                              <div key={i} className="flex items-center justify-between px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: selectedColor, boxShadow: `0 0 8px ${selectedColor}44` }}
                                  />
                                  <span className="text-xs font-semibold text-slate-400">{title}</span>
                                </div>
                                <span className="text-[10px] font-black tracking-widest text-slate-500">
                                  → {i === 0 ? 'TASK' : i === 1 ? 'IN PROGRESS' : 'DONE ✓'}
                                </span>
                              </div>
                            ))}
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
                              className="flex-1 text-xs font-semibold bg-foreground/5 border border-bridge-accent/50 rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                            />
                          ) : (
                            <span
                              className={`text-xs font-semibold text-foreground/80 group-hover:text-foreground transition-colors truncate ${canEdit ? 'cursor-text hover:bg-foreground/5 rounded px-1 -mx-1' : ''}`}
                              onDoubleClick={() => handleStartEditTask(task)}
                            >
                              {task.title}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 flex-shrink-0 ml-2">
                          <span className="tracking-widest transition-colors" style={{ color: undefined }}>
                            → {getBlockName(task.block_id).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Quick Add Dock */}
                  {canEdit && (
                    <motion.div
                      className={`relative z-[1] p-2 flex gap-2 border-t transition-all ${isOnboarding && tasks.length === 0 ? 'bg-bridge-accent/5 border-bridge-accent/20' : 'bg-bridge-dark/30 border-bridge-border/20'}`}
                      animate={isOnboarding && tasks.length === 0 ? { backgroundColor: ['rgba(99,102,241,0.03)', 'rgba(99,102,241,0.08)', 'rgba(99,102,241,0.03)'] } : {}}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <input
                        type="text"
                        placeholder={t('featureDetail.newSubtaskPlaceholder')}
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === 'Enter') handleAddSubtask();
                        }}
                        className={`flex-1 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent text-foreground transition-all ${isOnboarding && tasks.length === 0 ? 'bg-bridge-dark/70 border-2 border-bridge-accent/40 placeholder-slate-400 shadow-[0_0_12px_rgba(99,102,241,0.15)]' : 'bg-bridge-dark/50 border border-bridge-border/30 placeholder-slate-500'}`}
                        autoFocus={isOnboarding && tasks.length === 0}
                      />
                      <motion.button
                        ref={addBtnRef}
                        onClick={handleAddSubtask}
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all active:scale-95"
                        style={{
                          backgroundColor: isOnboarding && tasks.length === 0 ? `${selectedColor}25` : `${selectedColor}15`,
                          color: selectedColor,
                          borderColor: `${selectedColor}33`,
                        }}
                        animate={isOnboarding && tasks.length === 0 ? { scale: [1, 1.05, 1] } : {}}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        ADD
                      </motion.button>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Save/Cancel - shown only with changes */}
              {canEdit && hasChanges && (
                <div className="flex justify-end gap-2 pt-4 border-t border-foreground/10">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditedFeature(JSON.parse(JSON.stringify(initialFeature)));
                      setHasChanges(false);
                    }}
                    className="bg-foreground/5 border-foreground/10 text-foreground hover:bg-foreground/10"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={handleSave}
                    className="bg-bridge-accent hover:bg-bridge-accent/90"
                  >
                    {t('common.save')}
                  </Button>
                </div>
              )}
            </div>
          </div>
      </MotionModal>

      {/* Confirm Dialog */}
      <MotionModal open={showConfirmDialog} onClose={() => setShowConfirmDialog(false)} className="sm:max-w-sm p-6">
        <h3 className="text-lg font-semibold text-foreground">{t('featureDetail.saveChangesTitle')}</h3>
        <p className="text-sm text-slate-400 mt-1">{t('featureDetail.saveChangesDesc')}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
          <button onClick={handleDiscardAndClose} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10">
            {t('featureDetail.discard')}
          </button>
          <button onClick={handleSaveAndClose} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-bridge-accent text-white hover:bg-bridge-accent/90">
            {t('common.save')}
          </button>
        </div>
      </MotionModal>

      {/* Delete Dialog - 태스크 이관 모달 */}
      <MotionModal
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setTaskMigrationMap({});
          setBulkTargetFeatureId('');
        }}
        className={`${tasks.length > 0 ? 'sm:max-w-lg' : 'sm:max-w-sm'} p-0 max-h-[80dvh] flex flex-col overflow-hidden`}
      >
        {tasks.length > 0 ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-foreground/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <ArrowRightLeft className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">{t('featureDetail.deleteTitle')}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('featureDetail.taskMigrationDesc', { count: tasks.length })}
                  </p>
                </div>
              </div>
            </div>

            {/* Bulk migration */}
            <div className="px-6 py-3 border-b border-foreground/5 bg-foreground/[0.02] flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                  {t('featureDetail.bulkMigrate', '일괄 이관')}
                </span>
                <div className="relative flex-1">
                  <select
                    value={bulkTargetFeatureId}
                    onChange={(e) => {
                      const targetId = e.target.value;
                      setBulkTargetFeatureId(targetId);
                      if (targetId) {
                        const newMap: Record<string, string> = {};
                        tasks.forEach(t => { newMap[t.id] = targetId; });
                        setTaskMigrationMap(newMap);
                      } else {
                        setTaskMigrationMap({});
                      }
                    }}
                    className="w-full appearance-none bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 pr-8 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                  >
                    <option value="">{t('featureDetail.selectFeature', '이관할 피처 선택...')}</option>
                    {allFeatures
                      .filter(f => f.id !== feature.id)
                      .map(f => (
                        <option key={f.id} value={f.id}>{f.title}</option>
                      ))
                    }
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Task list with individual migration selectors */}
            <div className="flex-1 overflow-y-auto px-6 py-3 kanban-scrollbar">
              <div className="space-y-2">
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-foreground/[0.03] border border-foreground/5">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: feature.color, boxShadow: `0 0 6px ${feature.color}44` }}
                    />
                    <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0" title={task.title}>
                      {task.title}
                    </span>
                    <div className="relative flex-shrink-0">
                      <select
                        value={taskMigrationMap[task.id] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTaskMigrationMap(prev => {
                            const next = { ...prev };
                            if (val) {
                              next[task.id] = val;
                            } else {
                              delete next[task.id];
                            }
                            return next;
                          });
                          setBulkTargetFeatureId('');
                        }}
                        className="appearance-none bg-foreground/5 border border-foreground/10 rounded-md px-2.5 py-1.5 pr-7 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-bridge-accent/50 max-w-[160px]"
                      >
                        <option value="">{t('featureDetail.deleteWithFeature', '삭제')}</option>
                        {allFeatures
                          .filter(f => f.id !== feature.id)
                          .map(f => (
                            <option key={f.id} value={f.id}>{f.title}</option>
                          ))
                        }
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-foreground/10 flex-shrink-0">
              {/* Warning for tasks to be deleted */}
              {(() => {
                const deleteCount = tasks.filter(t => !taskMigrationMap[t.id]).length;
                const migrateCount = tasks.filter(t => !!taskMigrationMap[t.id]).length;
                return (
                  <>
                    {deleteCount > 0 && (
                      <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-300">
                          {t('featureDetail.deleteWarning', {
                            deleteCount,
                            defaultValue: `${deleteCount}개 태스크가 피처와 함께 삭제됩니다.`,
                          })}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowDeleteDialog(false);
                          setTaskMigrationMap({});
                          setBulkTargetFeatureId('');
                        }}
                        className="flex-1 inline-flex items-center justify-center rounded-lg text-sm font-medium h-10 px-4 bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={() => {
                          const migrations = Object.entries(taskMigrationMap)
                            .filter(([, targetId]) => targetId)
                            .map(([taskId, targetId]) => ({ task_id: taskId, target_feature_id: targetId }));
                          onDelete(feature.id, migrations.length > 0 ? migrations : undefined);
                          onClose();
                        }}
                        className={`flex-1 inline-flex items-center justify-center rounded-lg text-sm font-bold h-10 px-4 text-white transition-all ${
                          migrateCount > 0
                            ? 'bg-bridge-accent hover:bg-bridge-accent/90'
                            : 'bg-red-500 hover:bg-red-600'
                        }`}
                      >
                        {migrateCount > 0
                          ? t('featureDetail.migrateAndDelete', {
                              migrateCount,
                              defaultValue: `${migrateCount}개 이관 후 삭제`,
                            })
                          : t('featureDetail.deleteAll', '전체 삭제')
                        }
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          /* 태스크 없을 때: 간단 확인 모달 */
          <div className="p-6">
            <h3 className="text-lg font-semibold text-foreground">{t('featureDetail.deleteTitle')}</h3>
            <p className="text-sm text-slate-400 mt-1">{t('featureDetail.deleteDesc')}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
              <button onClick={() => setShowDeleteDialog(false)} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  onDelete(feature.id);
                  onClose();
                }}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-red-500 hover:bg-red-600 text-white"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        )}
      </MotionModal>

      {/* AI Confirm Modal */}
      {showAIConfirm && feature && (
        <MotionModal open={true} onClose={() => setShowAIConfirm(false)} className="sm:max-w-md p-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-bridge-secondary to-bridge-accent flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <h3 className="text-sm font-bold text-foreground">{t('featureDetail.aiConfirmTitle')}</h3>
            </div>
            <button onClick={() => setShowAIConfirm(false)} className="text-slate-400 hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 py-4 space-y-4">
            <p className="text-xs text-slate-400">{t('featureDetail.aiConfirmDesc')}</p>

            {/* Feature title */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {t('featureDetail.aiConfirmFeatureTitle')}
              </label>
              <input
                type="text"
                value={editedFeature.title}
                onChange={(e) => updateEditedFeature({ title: e.target.value })}
                className="w-full px-3 py-2.5 bg-white/5 rounded-lg border border-foreground/5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>

            {/* Feature description */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {t('featureDetail.aiConfirmFeatureDesc')}
              </label>
              <textarea
                value={editedFeature.description || ''}
                onChange={(e) => updateEditedFeature({ description: e.target.value })}
                placeholder={t('featureDetail.aiConfirmNoDesc')}
                rows={3}
                className="w-full px-3 py-2.5 bg-white/5 rounded-lg border border-foreground/5 text-sm text-slate-300 placeholder-amber-400/60 resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-foreground/5 flex justify-end gap-2">
            <button
              onClick={() => setShowAIConfirm(false)}
              className="px-4 py-2 text-sm text-slate-400 hover:text-foreground transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={() => {
                if (hasChanges && editedFeature) {
                  onUpdateFeature(editedFeature);
                  setInitialFeature(JSON.parse(JSON.stringify(editedFeature)));
                  setHasChanges(false);
                }
                setShowAIConfirm(false);
                setShowAIDecompose(true);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-lg hover:shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('featureDetail.aiConfirmStart')}
            </button>
          </div>
        </MotionModal>
      )}

      {/* AI Decompose Modal */}
      {showAIDecompose && feature && (
        <FeatureAIDecomposeModal
          boardId={boardId}
          featureId={feature.id}
          featureTitle={editedFeature.title}
          existingTaskTitles={tasks.map(t => t.title)}
          onClose={() => setShowAIDecompose(false)}
          onApplied={() => {
            setShowAIDecompose(false);
          }}
        />
      )}

      {/* Flying task animation (portal) */}
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
