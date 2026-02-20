import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Flag, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { MotionModal } from './ui/MotionModal';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Milestone, Feature } from '../types';

interface MilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone?: Milestone | null;
  features: Feature[];
  featureMilestoneCountMap?: Record<string, number>;
  onSave: (data: {
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    feature_ids?: string[];
  }) => Promise<void>;
  onDelete?: (milestoneId: string) => Promise<void>;
}

export function MilestoneModal({
  isOpen,
  onClose,
  milestone,
  features,
  featureMilestoneCountMap = {},
  onSave,
  onDelete,
}: MilestoneModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const isEditMode = !!milestone;

  useEffect(() => {
    if (milestone) {
      setTitle(milestone.title);
      setDescription(milestone.description || '');
      setStartDate(new Date(milestone.start_date));
      setEndDate(new Date(milestone.end_date));
      setSelectedFeatureIds(new Set(milestone.features?.map((f) => f.id) || []));
    } else {
      setTitle('');
      setDescription('');
      setStartDate(undefined);
      setEndDate(undefined);
      setSelectedFeatureIds(new Set());
    }
  }, [milestone, isOpen]);

  const handleSave = async () => {
    if (!title.trim() || !startDate || !endDate) {
      alert(t('milestone.requiredFields'));
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        feature_ids: Array.from(selectedFeatureIds),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save milestone:', error);
      alert(t('milestone.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!milestone || !onDelete) return;

    if (!confirm(t('milestone.deleteConfirm'))) return;

    try {
      await onDelete(milestone.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete milestone:', error);
      alert(t('milestone.deleteFailed'));
    }
  };

  const toggleFeature = (featureId: string) => {
    setSelectedFeatureIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(featureId)) {
        newSet.delete(featureId);
      } else {
        newSet.add(featureId);
      }
      return newSet;
    });
  };

  // Feature 정렬: 현재 마일스톤 연결 우선 → 연결 수 적은 순
  const sortedFeatures = useMemo(() => {
    return [...features].sort((a, b) => {
      const aSelected = selectedFeatureIds.has(a.id) ? 0 : 1;
      const bSelected = selectedFeatureIds.has(b.id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      const aCount = featureMilestoneCountMap[a.id] || 0;
      const bCount = featureMilestoneCountMap[b.id] || 0;
      return aCount - bCount;
    });
  }, [features, selectedFeatureIds, featureMilestoneCountMap]);

  return (
    <MotionModal open={isOpen} onClose={onClose} className="sm:max-w-lg bg-bridge-dark p-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-bridge-border bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-foreground">
              {isEditMode ? t('milestone.editTitle') : t('milestone.newTitle')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 제목 */}
          <div className="space-y-2">
            <label className="kanban-label block">{t('milestone.titleLabel')} *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('milestone.titlePlaceholder')}
              className="bg-bridge-obsidian border-foreground/10 text-foreground placeholder-slate-400 focus:border-indigo-500/50 rounded-xl"
            />
          </div>

          {/* 설명 */}
          <div className="space-y-2">
            <label className="kanban-label block">{t('milestone.descriptionLabel')}</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('milestone.descriptionPlaceholder')}
              rows={3}
              className="bg-bridge-obsidian border-foreground/10 text-foreground placeholder-slate-400 resize-none focus:border-indigo-500/50 rounded-xl"
            />
          </div>

          {/* 기간 */}
          <div className="space-y-2">
            <label className="kanban-label block">{t('milestone.periodLabel')} *</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-10 justify-start text-left font-normal bg-bridge-surface-hover border-foreground/10 text-foreground hover:bg-bridge-surface-hover hover:border-indigo-500/50 rounded-xl"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                  {startDate && endDate ? (
                    <>
                      {format(startDate, 'yyyy. MM. dd.', { locale: ko })}
                      {' ~ '}
                      {format(endDate, 'yyyy. MM. dd.', { locale: ko })}
                    </>
                  ) : (
                    <span className="text-slate-400">{t('milestone.selectPeriod')}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-bridge-surface border-bridge-border" align="start">
                <Calendar
                  mode="range"
                  selected={{
                    from: startDate,
                    to: endDate,
                  }}
                  onSelect={(range) => {
                    setStartDate(range?.from);
                    setEndDate(range?.to);
                  }}
                  numberOfMonths={2}
                  locale={ko}
                  className="text-foreground"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Feature 연결 */}
          <div className="space-y-2">
            <label className="kanban-label block">{t('milestone.linkedFeatures')}</label>
            <div className="max-h-48 overflow-y-auto space-y-1 bg-bridge-surface rounded-xl p-2 border border-foreground/10">
              {sortedFeatures.length > 0 ? (
                sortedFeatures.map((feature) => {
                  const milestoneCount = featureMilestoneCountMap[feature.id] || 0;
                  return (
                    <label
                      key={feature.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-bridge-surface-hover cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFeatureIds.has(feature.id)}
                        onChange={() => toggleFeature(feature.id)}
                        className="w-4 h-4 rounded border-foreground/10 bg-bridge-obsidian text-indigo-500 focus:ring-indigo-500"
                      />
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: feature.color }}
                      />
                      <span className="text-sm text-foreground truncate flex-1">
                        {feature.title}
                      </span>
                      {milestoneCount > 0 && (
                        <span className="text-[10px] text-slate-500 flex-shrink-0 tabular-nums">
                          {t('milestone.linkedCount', { count: milestoneCount })}
                        </span>
                      )}
                    </label>
                  );
                })
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">
                  {t('milestone.noFeatures')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between p-5 border-t border-bridge-border bg-white/[0.02]">
          <div>
            {isEditMode && onDelete && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                {t('common.delete')}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="text-[11px] font-bold text-slate-400 hover:text-foreground transition-all tracking-wider"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 bg-white text-black font-black text-[11px] rounded-lg tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? t('milestone.saving') : isEditMode ? t('common.edit') : t('common.create')}
            </button>
          </div>
        </div>
    </MotionModal>
  );
}
