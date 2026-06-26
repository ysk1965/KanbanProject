import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, ChevronDown, Plus, Layers, Zap } from 'lucide-react';
import { MotionModal } from './ui/MotionModal';
import { ColorPickerPopover } from './ui/ColorPickerPopover';
import { FEATURE_COLORS, getRandomFeatureColor } from '../constants';
import type { Feature } from '../types';

interface QuickAddTaskModalProps {
  open: boolean;
  onClose: () => void;
  features: Feature[];
  blockName?: string;
  onSubmit: (data: {
    featureId?: string;
    newFeatureTitle?: string;
    taskTitle: string;
    color?: string;
  }) => void;
  isSubmitting?: boolean;
  /** Simple mode: title-only input with continuous adding */
  isSimpleMode?: boolean;
  /** Callback after successful add in simple mode (for continuous adding) */
  onAdded?: () => void;
}

export function QuickAddTaskModal({
  open,
  onClose,
  features,
  blockName,
  onSubmit,
  isSubmitting = false,
  isSimpleMode = false,
  onAdded,
}: QuickAddTaskModalProps) {
  const { t } = useTranslation();
  const [selectedFeatureId, setSelectedFeatureId] = useState<string>('');
  const [isCreatingFeature, setIsCreatingFeature] = useState(false);
  const [newFeatureTitle, setNewFeatureTitle] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(FEATURE_COLORS[8]);
  const [addedCount, setAddedCount] = useState(0);
  const taskTitleRef = useRef<HTMLInputElement>(null);
  const featureTitleRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedFeatureId(features.length > 0 ? features[0].id : '');
      setIsCreatingFeature(features.length === 0);
      setNewFeatureTitle('');
      setTaskTitle('');
      setSelectedColor(getRandomFeatureColor());
      setAddedCount(0);
    }
  }, [open, features]);

  // Auto-focus
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (isSimpleMode) {
        taskTitleRef.current?.focus();
      } else if (isCreatingFeature && features.length === 0) {
        featureTitleRef.current?.focus();
      } else {
        taskTitleRef.current?.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [open, isSimpleMode, isCreatingFeature, features.length]);

  const handleFeatureChange = (value: string) => {
    if (value === '__new__') {
      setIsCreatingFeature(true);
      setSelectedFeatureId('');
      setTimeout(() => featureTitleRef.current?.focus(), 50);
    } else {
      setIsCreatingFeature(false);
      setSelectedFeatureId(value);
      setNewFeatureTitle('');
    }
  };

  const canSubmitSimple = taskTitle.trim() && !isSubmitting;
  const canSubmit = isSimpleMode
    ? canSubmitSimple
    : taskTitle.trim() &&
      (isCreatingFeature ? newFeatureTitle.trim() : selectedFeatureId) &&
      !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (isSimpleMode) {
      // Feature 미지정 → BE에서 "미분류"(inbox) Feature로 자동 귀속
      onSubmit({
        featureId: undefined,
        taskTitle: taskTitle.trim(),
        color: selectedColor,
      });
      // Clear for next input (continuous adding) — 다음 카드는 새 랜덤 색상
      setTaskTitle('');
      setSelectedColor(getRandomFeatureColor());
      setAddedCount((c) => c + 1);
      onAdded?.();
      setTimeout(() => taskTitleRef.current?.focus(), 50);
    } else {
      onSubmit({
        featureId: isCreatingFeature ? undefined : selectedFeatureId,
        newFeatureTitle: isCreatingFeature ? newFeatureTitle.trim() : undefined,
        taskTitle: taskTitle.trim(),
        color: selectedColor,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const selectedFeature = features.find((f) => f.id === selectedFeatureId);

  // Simple Mode UI
  if (isSimpleMode) {
    return (
      <MotionModal open={open} onClose={onClose} className="sm:max-w-md bg-bridge-obsidian p-0 overflow-hidden">
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-7 h-7 rounded-lg bg-bridge-secondary/10 flex items-center justify-center">
                <Zap size={14} className="text-bridge-secondary" />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-bold text-foreground">{t('quickAdd.quickCapture', '빠른 추가')}</h2>
                <p className="text-xs text-slate-500">Enter {t('quickAdd.toContinue', '로 연속 추가')} · Esc {t('quickAdd.toClose', '로 닫기')}</p>
              </div>
              {addedCount > 0 && (
                <span className="text-xs text-bridge-secondary font-medium">
                  +{addedCount}
                </span>
              )}
              <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-foreground transition-colors" aria-label="닫기">
                <X size={16} />
              </button>
            </div>

            <input
              ref={taskTitleRef}
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('quickAdd.quickPlaceholder', '할 일을 입력하세요...')}
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all text-sm"
              autoFocus
            />

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <ColorPickerPopover
                  colors={FEATURE_COLORS}
                  selectedColor={selectedColor}
                  onColorChange={setSelectedColor}
                  triggerSize="sm"
                  showCustomColor
                />
                <span className="text-xs text-slate-500">
                  {blockName && `→ ${blockName}`}
                </span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={!canSubmitSimple}
                className="px-4 py-1.5 bg-bridge-secondary/20 text-bridge-secondary text-xs font-bold rounded-lg hover:bg-bridge-secondary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '...' : 'Enter ↵'}
              </button>
            </div>
          </div>
      </MotionModal>
    );
  }

  // Standard Mode UI
  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-lg bg-bridge-obsidian p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-foreground/[0.08] bg-foreground/[0.03]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-bridge-accent/10 flex items-center justify-center">
              <Plus size={16} className="text-bridge-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('quickAdd.title', '카드 추가')}</h2>
              {blockName && (
                <p className="text-xs text-slate-400 mt-0.5">{blockName}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-5 pt-4 space-y-5" onKeyDown={handleKeyDown}>
          {/* Feature Selector */}
          <div className="space-y-2">
            <label className="kanban-label block flex items-center gap-1.5">
              <Layers size={12} className="text-slate-400" />
              {t('quickAdd.feature', 'Feature')} *
            </label>

            {features.length > 0 && !isCreatingFeature ? (
              <div className="space-y-2">
                <div className="relative">
                  <select
                    value={selectedFeatureId}
                    onChange={(e) => handleFeatureChange(e.target.value)}
                    className="w-full appearance-none bg-bridge-obsidian border border-foreground/10 rounded-xl px-4 py-3 pr-10 text-foreground focus:outline-none focus:border-bridge-accent/50 transition-all text-sm cursor-pointer"
                  >
                    {features.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title}
                      </option>
                    ))}
                    <option value="__new__">+ {t('quickAdd.newFeature', '새 Feature 만들기')}</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>

                {/* Selected feature color indicator */}
                {selectedFeature && (
                  <div className="flex items-center gap-2 px-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedFeature.color }}
                    />
                    <span className="text-xs text-slate-400">
                      {selectedFeature.total_tasks} {t('quickAdd.tasksCount', '개 태스크')}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  ref={featureTitleRef}
                  type="text"
                  value={newFeatureTitle}
                  onChange={(e) => setNewFeatureTitle(e.target.value)}
                  placeholder={t('quickAdd.featurePlaceholder', 'Feature 이름을 입력하세요')}
                  className="w-full bg-bridge-obsidian border border-foreground/10 rounded-xl p-3 text-foreground placeholder-slate-500 focus:outline-none focus:border-bridge-accent/50 transition-all text-sm"
                />
                {features.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingFeature(false);
                      setSelectedFeatureId(features[0].id);
                      setNewFeatureTitle('');
                    }}
                    className="text-xs text-slate-400 hover:text-bridge-secondary transition-colors"
                  >
                    {t('quickAdd.selectExisting', '← 기존 Feature 선택')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Task Title */}
          <div className="space-y-2">
            <label className="kanban-label block">{t('quickAdd.taskTitle', '태스크 제목')} *</label>
            <input
              ref={taskTitleRef}
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={t('quickAdd.taskPlaceholder', '태스크 제목을 입력하세요')}
              className="w-full bg-bridge-obsidian border border-foreground/10 rounded-xl p-3 text-foreground placeholder-slate-500 focus:outline-none focus:border-bridge-accent/50 transition-all text-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-foreground/[0.08] bg-foreground/[0.03] flex justify-end items-center gap-4">
          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-400 hover:text-foreground transition-all tracking-wider"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-6 py-2.5 bg-white text-black font-bold text-xs rounded-lg tracking-widest hover:bg-slate-200 transition-all flex items-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? t('common.processing') : t('common.add')}
            <CheckCircle2 size={14} className="text-bridge-accent" />
          </button>
        </div>
    </MotionModal>
  );
}
