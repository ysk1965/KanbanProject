import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Loader2,
  Plus,
  ChevronDown,
  Check,
} from 'lucide-react';
import { boardChecklistAPI, taskAPI, TaskResponse } from '../../utils/api';
import { Feature } from '../../types';
import { MotionModal } from '../ui/MotionModal';

// ─── Constants ──────────────────────────────────────────────────────────────

const NEW_FEATURE_SENTINEL = '__new__';

// ─── Props ──────────────────────────────────────────────────────────────────

interface WorkloadCreateModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  features: Feature[];
  assigneeId?: string | null;
  contractorId?: string | null;
  startDate: string;
  dueDate: string;
  onCreated: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function WorkloadCreateModal({
  open,
  onClose,
  boardId,
  features,
  assigneeId,
  contractorId,
  startDate,
  dueDate,
  onCreated,
}: WorkloadCreateModalProps) {
  const { t } = useTranslation();

  // ── Form state ──
  const [title, setTitle] = useState('');
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [newFeatureTitle, setNewFeatureTitle] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // ── Data ──
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // ── Dropdowns ──
  const [showFeatureDropdown, setShowFeatureDropdown] = useState(false);
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const featureDropdownRef = useRef<HTMLDivElement>(null);
  const taskDropdownRef = useRef<HTMLDivElement>(null);

  // ── Submit ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Refs ──
  const titleInputRef = useRef<HTMLInputElement>(null);
  const newFeatureInputRef = useRef<HTMLInputElement>(null);

  // Filter out inbox features
  const selectableFeatures = features.filter((f) => !f.inbox);

  // Is "new feature" mode?
  const isNewFeature = selectedFeatureId === NEW_FEATURE_SENTINEL;

  // ── Auto-focus title input on open ──
  useEffect(() => {
    if (open) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [open]);

  // ── Focus new feature input when selected ──
  useEffect(() => {
    if (isNewFeature) {
      setTimeout(() => newFeatureInputRef.current?.focus(), 50);
    }
  }, [isNewFeature]);

  // ── Load tasks when feature changes ──
  useEffect(() => {
    if (!selectedFeatureId || isNewFeature) {
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
      } catch (err) {
        console.error('Failed to load tasks:', err);
      } finally {
        setIsLoadingTasks(false);
      }
    };
    loadTasks();
  }, [boardId, selectedFeatureId, isNewFeature]);

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
  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: Parameters<typeof boardChecklistAPI.createFromWorkload>[1] = {
        title: trimmedTitle,
        assignee_id: assigneeId || undefined,
        contractor_id: contractorId || undefined,
        start_date: startDate,
        due_date: dueDate,
      };

      if (isNewFeature && newFeatureTitle.trim()) {
        // Create with new feature
        payload.new_feature_title = newFeatureTitle.trim();
      } else if (selectedFeatureId && !isNewFeature) {
        // Existing feature
        payload.feature_id = selectedFeatureId;
        if (selectedTaskId) {
          payload.task_id = selectedTaskId;
        }
        // If no task selected, server auto-creates one
      }
      // If no feature selected, goes to inbox

      await boardChecklistAPI.createFromWorkload(boardId, payload);
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create workload item:', err);
      setError(t('common.error', 'An error occurred'));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    title, isSubmitting, assigneeId, contractorId, startDate, dueDate,
    isNewFeature, newFeatureTitle, selectedFeatureId, selectedTaskId,
    boardId, onCreated, onClose, t,
  ]);

  // ── Key handler ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Helpers ──
  const selectedFeature = selectableFeatures.find((f) => f.id === selectedFeatureId);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const canSubmit = title.trim().length > 0 && !(isNewFeature && !newFeatureTitle.trim());

  return (
    <MotionModal open={open} onClose={onClose} className="w-full sm:max-w-md" accentColor>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <Plus className="w-5 h-5 text-bridge-accent shrink-0" aria-hidden="true" />
        <h2 className="text-sm font-bold text-foreground flex-1">
          {t('schedule.workloadCreate.title', '새 업무 추가')}
        </h2>
        <button
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
          className="p-1 rounded-lg text-slate-500 hover:text-foreground
            hover:bg-foreground/5 transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 space-y-4">
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
            placeholder={t('schedule.workloadCreate.titlePlaceholder', '업무 제목을 입력하세요')}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
              py-3 px-4 text-foreground placeholder-slate-500
              focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>

        {/* Feature selector */}
        <div ref={featureDropdownRef} className="relative">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
            {t('schedule.workloadCreate.feature', 'Feature (선택사항)')}
          </label>
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
            ) : isNewFeature ? (
              <span className="flex-1 text-left text-bridge-secondary truncate">
                {t('schedule.workloadCreate.featureNew', '새 Feature 만들기')}
              </span>
            ) : (
              <span className="flex-1 text-left text-slate-500">
                {t('schedule.workloadCreate.featureNone', '미분류')}
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
              {/* None option */}
              <button
                onClick={() => {
                  setSelectedFeatureId(null);
                  setNewFeatureTitle('');
                  setShowFeatureDropdown(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs
                  text-slate-400 hover:bg-foreground/5 transition-colors"
              >
                <span className="flex-1">{t('schedule.workloadCreate.featureNone', '미분류')}</span>
                {!selectedFeatureId && (
                  <Check size={14} className="text-bridge-accent shrink-0" />
                )}
              </button>

              {/* Existing features */}
              {selectableFeatures.map((feature) => (
                <button
                  key={feature.id}
                  onClick={() => {
                    setSelectedFeatureId(feature.id);
                    setNewFeatureTitle('');
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

              {/* New feature option */}
              <div className="border-t border-foreground/[0.08] mt-1 pt-1">
                <button
                  onClick={() => {
                    setSelectedFeatureId(NEW_FEATURE_SENTINEL);
                    setShowFeatureDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs
                    text-bridge-secondary hover:bg-foreground/5 transition-colors"
                >
                  <Plus size={14} className="shrink-0" />
                  <span className="flex-1">
                    {t('schedule.workloadCreate.featureNew', '새 Feature 만들기')}
                  </span>
                  {isNewFeature && (
                    <Check size={14} className="text-bridge-accent shrink-0" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Inbox hint */}
          {!selectedFeatureId && !isNewFeature && (
            <p className="text-xs text-slate-500 mt-1.5">
              {t('schedule.workloadCreate.inboxHint', '미분류에 추가됩니다')}
            </p>
          )}
        </div>

        {/* New feature title input */}
        {isNewFeature && (
          <div>
            <input
              ref={newFeatureInputRef}
              type="text"
              value={newFeatureTitle}
              onChange={(e) => setNewFeatureTitle(e.target.value)}
              placeholder={t('schedule.workloadCreate.featureNew', '새 Feature 만들기')}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
                py-3 px-4 text-foreground placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          </div>
        )}

        {/* Task selector (only when existing feature is selected) */}
        {selectedFeatureId && !isNewFeature && (
          <div ref={taskDropdownRef} className="relative">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
              {t('schedule.workloadCreate.task', 'Task (선택사항)')}
            </label>
            {isLoadingTasks ? (
              <div className="flex items-center gap-2 py-2.5 px-3 text-xs text-slate-500">
                <Loader2 size={14} className="animate-spin text-bridge-accent" />
                {t('common.loading', 'Loading...')}
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
                      {t('schedule.workloadCreate.taskAuto', '자동 생성')}
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
                    {/* Auto-create option */}
                    <button
                      onClick={() => {
                        setSelectedTaskId(null);
                        setShowTaskDropdown(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs
                        text-slate-400 hover:bg-foreground/5 transition-colors"
                    >
                      <span className="flex-1">
                        {t('schedule.workloadCreate.taskAuto', '자동 생성')}
                      </span>
                      {!selectedTaskId && (
                        <Check size={14} className="text-bridge-accent shrink-0" />
                      )}
                    </button>

                    {/* Existing tasks */}
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
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-500">
          Esc {t('schedule.workloadCreate.cancel', '취소')}
        </span>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-bridge-accent
            disabled:opacity-50 disabled:cursor-not-allowed
            hover:bg-bridge-accent/90 transition-all"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            t('schedule.workloadCreate.submit', '추가')
          )}
        </button>
      </div>
    </MotionModal>
  );
}
