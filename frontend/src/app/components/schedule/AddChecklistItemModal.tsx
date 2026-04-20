import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Loader2,
  CheckSquare,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  featureAPI,
  taskAPI,
  checklistAPI,
  FeatureResponse,
  TaskResponse,
} from '../../utils/api';
import { BoardMember } from '../ShareBoardModal';
import { MotionModal } from '../ui/MotionModal';
import { getInitials, getAssigneeHex } from '../../utils/assigneeColor';

// ─── Props ───────────────────────────────────────────────────────────────────

interface AddChecklistItemModalProps {
  boardId: string;
  boardMembers: BoardMember[];
  onAdd: () => void;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AddChecklistItemModal({
  boardId,
  boardMembers,
  onAdd,
  onClose,
}: AddChecklistItemModalProps) {
  const { t } = useTranslation();

  // ── Data ──
  const [features, setFeatures] = useState<FeatureResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // ── Selection state ──
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);

  // ── Dropdowns ──
  const [showFeatureDropdown, setShowFeatureDropdown] = useState(false);
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const featureDropdownRef = useRef<HTMLDivElement>(null);
  const taskDropdownRef = useRef<HTMLDivElement>(null);

  // ── Submit ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const didAddRef = useRef(false);

  // ── Load features ──
  useEffect(() => {
    const loadFeatures = async () => {
      setIsLoadingFeatures(true);
      try {
        const res = await featureAPI.getFeatures(boardId);
        setFeatures(res.features);
        if (res.features.length === 1) {
          setSelectedFeatureId(res.features[0].id);
        }
      } catch (err) {
        console.error('Failed to load features:', err);
      } finally {
        setIsLoadingFeatures(false);
      }
    };
    loadFeatures();
  }, [boardId]);

  // ── Load tasks when feature changes ──
  useEffect(() => {
    if (!selectedFeatureId) {
      setTasks([]);
      setSelectedTaskId(null);
      return;
    }

    const loadTasks = async () => {
      setIsLoadingTasks(true);
      setSelectedTaskId(null);
      try {
        const res = await taskAPI.getTasks(boardId, { feature_id: selectedFeatureId });
        setTasks(res.tasks);
        if (res.tasks.length === 1) {
          setSelectedTaskId(res.tasks[0].id);
        }
      } catch (err) {
        console.error('Failed to load tasks:', err);
      } finally {
        setIsLoadingTasks(false);
      }
    };
    loadTasks();
  }, [boardId, selectedFeatureId]);

  // ── Focus title input when task is selected ──
  useEffect(() => {
    if (selectedTaskId) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [selectedTaskId]);

  // ── Close dropdowns on outside click ──
  useEffect(() => {
    if (!showFeatureDropdown && !showTaskDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (showFeatureDropdown && featureDropdownRef.current && !featureDropdownRef.current.contains(e.target as Node)) {
        setShowFeatureDropdown(false);
      }
      if (showTaskDropdown && taskDropdownRef.current && !taskDropdownRef.current.contains(e.target as Node)) {
        setShowTaskDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showFeatureDropdown, showTaskDropdown]);

  // ── Submit handler ──
  const handleAdd = useCallback(async () => {
    if (!selectedTaskId || !title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await checklistAPI.addItem(boardId, selectedTaskId, {
        title: title.trim(),
        assignee_id: selectedAssigneeId || undefined,
      });
      setTitle('');
      setAddedCount((c) => c + 1);
      didAddRef.current = true;
      titleInputRef.current?.focus();
    } catch (err) {
      console.error('Failed to add checklist item:', err);
      setError(t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  }, [boardId, selectedTaskId, title, selectedAssigneeId, isSubmitting, t]);

  // ── Key handler ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAdd();
    }
  };

  // ── Close handler ──
  const handleClose = () => {
    if (didAddRef.current) {
      onAdd();
    }
    onClose();
  };

  // ── Helpers ──
  const selectedFeature = features.find((f) => f.id === selectedFeatureId);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <MotionModal open onClose={handleClose} className="w-full sm:max-w-md" accentColor>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <CheckSquare className="w-5 h-5 text-bridge-accent shrink-0" aria-hidden="true" />
        <h2 className="text-sm font-bold text-foreground flex-1">
          {t('schedule.panel.addItem', 'Add checklist item')}
        </h2>
        <button
          onClick={handleClose}
          aria-label={t('common.close', 'Close')}
          className="p-1 rounded-lg text-slate-500 hover:text-foreground
            hover:bg-foreground/5 transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 space-y-4">
        {/* Feature selector */}
        <div ref={featureDropdownRef} className="relative">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
            {t('schedule.panel.selectFeature', 'Feature')}
          </label>
          {isLoadingFeatures ? (
            <div className="flex items-center gap-2 py-2.5 px-3 text-xs text-slate-500">
              <Loader2 size={14} className="animate-spin text-bridge-accent" />
              {t('common.loading', 'Loading...')}
            </div>
          ) : features.length === 0 ? (
            <div className="py-2.5 px-3 text-xs text-slate-500">
              {t('schedule.panel.noFeatures', 'No features yet')}
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowFeatureDropdown((prev) => !prev)}
                className="w-full flex items-center gap-2 px-3 py-2.5
                  bg-foreground/[0.03] border border-foreground/10 rounded-xl
                  text-xs text-foreground hover:bg-foreground/5 transition-all
                  focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              >
                {selectedFeature ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: selectedFeature.color }}
                    />
                    <span className="flex-1 text-left truncate">{selectedFeature.title}</span>
                  </>
                ) : (
                  <span className="flex-1 text-left text-slate-500">
                    {t('schedule.panel.selectFeaturePlaceholder', 'Select a feature')}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-slate-400 transition-transform ${showFeatureDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              {showFeatureDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50
                  bg-bridge-obsidian border border-foreground/[0.08] rounded-xl shadow-xl
                  max-h-[200px] overflow-y-auto custom-scrollbar py-1">
                  {features.map((feature) => (
                    <button
                      key={feature.id}
                      onClick={() => {
                        setSelectedFeatureId(feature.id);
                        setShowFeatureDropdown(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs
                        text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: feature.color }}
                      />
                      <span className="flex-1 truncate">{feature.title}</span>
                      {feature.id === selectedFeatureId && (
                        <Check size={14} className="text-bridge-accent shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Task selector */}
        <div ref={taskDropdownRef} className="relative">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
            {t('schedule.panel.selectTask', 'Task')}
          </label>
          {!selectedFeatureId ? (
            <div className="py-2.5 px-3 text-xs text-slate-500 bg-foreground/[0.02] border border-foreground/5 rounded-xl">
              {t('schedule.panel.selectFeaturePlaceholder', 'Select a feature')}
            </div>
          ) : isLoadingTasks ? (
            <div className="flex items-center gap-2 py-2.5 px-3 text-xs text-slate-500">
              <Loader2 size={14} className="animate-spin text-bridge-accent" />
              {t('common.loading', 'Loading...')}
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-2.5 px-3 text-xs text-slate-500">
              {t('schedule.panel.noTasks', 'No tasks in this feature')}
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowTaskDropdown((prev) => !prev)}
                className="w-full flex items-center gap-2 px-3 py-2.5
                  bg-foreground/[0.03] border border-foreground/10 rounded-xl
                  text-xs text-foreground hover:bg-foreground/5 transition-all
                  focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              >
                {selectedTask ? (
                  <span className="flex-1 text-left truncate">{selectedTask.title}</span>
                ) : (
                  <span className="flex-1 text-left text-slate-500">
                    {t('schedule.panel.selectTaskPlaceholder', 'Select a task')}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-slate-400 transition-transform ${showTaskDropdown ? 'rotate-180' : ''}`}
                />
              </button>

              {showTaskDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50
                  bg-bridge-obsidian border border-foreground/[0.08] rounded-xl shadow-xl
                  max-h-[200px] overflow-y-auto custom-scrollbar py-1">
                  {tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => {
                        setSelectedTaskId(task.id);
                        setShowTaskDropdown(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs
                        text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <span className="flex-1 truncate">{task.title}</span>
                      {task.id === selectedTaskId && (
                        <Check size={14} className="text-bridge-accent shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Title input */}
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
            {t('schedule.panel.itemTitle', 'Item title')}
          </label>
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('task.checklistItemPlaceholder', 'Enter checklist item')}
            disabled={!selectedTaskId}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
              py-2.5 px-3 text-xs text-foreground placeholder-slate-500
              focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Assignee selector */}
        {boardMembers.length > 0 && (
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
              {t('kanban.assignee', 'Assignee')}
              <span className="text-slate-500 normal-case tracking-normal font-normal ml-1">
                ({t('common.optional', 'Optional')})
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {boardMembers.map((member) => {
                const isSelected = selectedAssigneeId === member.userId;
                const bgColor = getAssigneeHex(member.name, member.assigneeColor);
                return (
                  <button
                    key={member.userId}
                    onClick={() => setSelectedAssigneeId(isSelected ? null : member.userId)}
                    title={member.name}
                    className={`w-8 h-8 rounded-full text-[10px] font-bold text-white
                      flex items-center justify-center transition-all
                      ${isSelected ? 'ring-2 ring-bridge-accent ring-offset-2 ring-offset-bridge-obsidian scale-110' : 'opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: bgColor }}
                  >
                    {member.avatar ? (
                      <img src={member.avatar} alt={member.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      getInitials(member.name)
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-500">
          Esc {t('common.close', 'Close')}
        </span>
        <div className="flex items-center gap-2">
          {addedCount > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
              +{addedCount}
            </span>
          )}
          <button
            onClick={handleAdd}
            disabled={!title.trim() || !selectedTaskId || isSubmitting}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent
              disabled:opacity-50 disabled:cursor-not-allowed
              hover:bg-bridge-accent/90 transition-all"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              t('common.add', 'Add')
            )}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
