import { Feature } from '../types';
import { Check, Eye, EyeOff, Plus, ListTodo, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect, useState, memo } from 'react';
import { CompletionParticles } from './CompletionParticles';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { formatDate } from '../utils/dateUtils';

interface FeatureChipSelectorProps {
  features: Feature[];
  selectedFeatureIds: string[];
  isAllSelected: boolean;
  onToggleFeature: (featureId: string) => void;
  onSelectAll: () => void;
  onFeatureInfoClick: (feature: Feature) => void;
  onAddFeature: () => void;
  cascadeFeatureId?: string | null;
}

function useCompletionPulse(progressPercent: number, totalTasks: number) {
  const [justCompleted, setJustCompleted] = useState(false);
  const prevRef = useRef(progressPercent);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = progressPercent;
    if (prev < 100 && progressPercent === 100 && totalTasks > 0) {
      // 칩 프로그레스 바 transition(duration-500)이 끝에 도달하는 시점에 맞춤
      const arriveTimer = setTimeout(() => {
        setJustCompleted(true);
      }, 450);
      const clearTimer = setTimeout(() => {
        setJustCompleted(false);
      }, 450 + 1500);
      return () => { clearTimeout(arriveTimer); clearTimeout(clearTimer); };
    }
  }, [progressPercent, totalTasks]);

  return justCompleted;
}

const FeatureChip = memo(function FeatureChip({
  feature,
  isSelected,
  onFeatureInfoClick,
  onToggleFeature,
  isCascading,
  t,
}: {
  feature: Feature;
  isSelected: boolean;
  onFeatureInfoClick: (feature: Feature) => void;
  onToggleFeature: (featureId: string) => void;
  isCascading?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const featureColor = feature.color || '#8B5CF6';
  const isCompleted = feature.progress_percentage === 100 && feature.total_tasks > 0;
  const progressColor = isCompleted ? '#22c55e' : featureColor;
  const progressPercent = feature.total_tasks > 0 ? Math.round(feature.progress_percentage) : 0;
  const justCompleted = useCompletionPulse(feature.progress_percentage, feature.total_tasks);

  return (
    <div
      className={`relative flex items-stretch rounded-xl text-xs whitespace-nowrap transition-all flex-shrink-0 overflow-hidden ${
        justCompleted ? 'feature-complete-pulse' : ''
      } ${
        isSelected
          ? 'border-2 shadow-lg'
          : 'border border-bridge-border hover:border-zinc-600 opacity-60 hover:opacity-90'
      }`}
      style={isSelected ? {
        backgroundColor: justCompleted ? 'rgba(34, 197, 94, 0.08)' : `${featureColor}10`,
        borderColor: justCompleted ? 'rgba(34, 197, 94, 0.6)' : `${featureColor}66`,
        boxShadow: justCompleted ? '0 0 20px rgba(34, 197, 94, 0.2)' : `0 0 16px ${featureColor}15`,
      } : {
        backgroundColor: 'var(--bridge-surface-hover)',
      }}
    >
      {/* 좌측 컬러 바 */}
      <div
        className="w-1 flex-shrink-0 transition-colors duration-500"
        style={{ backgroundColor: isCompleted ? '#22c55e' : isSelected ? featureColor : `${featureColor}40` }}
      />

      {/* 메인 영역 (클릭 = 상세 보기) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onFeatureInfoClick(feature)}
            className="flex flex-col justify-center gap-1 md:gap-1.5 pl-2 md:pl-3 pr-1.5 md:pr-2 py-2 md:py-2.5 min-w-[80px] md:min-w-[100px]"
          >
            {/* 타이틀 */}
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-500"
                style={{ backgroundColor: isCompleted ? '#22c55e' : featureColor }}
              />
              <span className={`font-bold text-[12px] max-w-[130px] truncate ${
                isSelected ? 'text-foreground' : 'text-zinc-400'
              }`}>
                {feature.title}
              </span>
            </div>

            {/* 진행률 바 + 텍스트 */}
            <div className="flex items-center gap-2 pl-3.5">
              <div className="relative w-14 h-1.5 bg-foreground/5 rounded-full overflow-visible">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${justCompleted ? 'progress-bar-inner' : ''} ${isCascading ? 'cascade-pulse-feature' : ''}`}
                  style={{
                    width: `${progressPercent}%`,
                    backgroundColor: isSelected ? progressColor : `${progressColor}60`,
                  }}
                />
                <CompletionParticles active={justCompleted} count={8} variant="chip" />
              </div>
              <span className={`text-xs font-medium flex items-center gap-0.5 ${
                isCompleted ? 'text-green-400' : isSelected ? 'text-foreground/80' : 'text-zinc-500'
              } ${justCompleted ? 'progress-text-bounce' : ''}`}>
                {feature.completed_tasks}/{feature.total_tasks}
                {isCompleted && (
                  <Check size={10} className={`text-green-400 ${justCompleted ? 'progress-check-pop' : ''}`} strokeWidth={3} />
                )}
              </span>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={8} className="bg-bridge-obsidian border border-foreground/10 text-foreground px-3 py-2.5 rounded-xl shadow-xl">
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <ListTodo size={12} className="text-bridge-accent" />
              <span className="font-medium">
                Task {feature.completed_tasks}/{feature.total_tasks} {t('featureChip.tooltipCompleted', { defaultValue: '완료' })}
              </span>
            </div>
            {(feature.start_date || feature.due_date) && (
              <div className="flex items-center gap-1.5 text-slate-400">
                <Calendar size={12} />
                <span>
                  {feature.start_date ? formatDate(feature.start_date) : '–'} ~ {feature.due_date ? formatDate(feature.due_date) : '–'}
                </span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      {/* 필터 토글 버튼 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFeature(feature.id);
        }}
        className={`flex items-center justify-center w-8 flex-shrink-0 transition-all border-l ${
          isSelected
            ? 'text-muted-foreground hover:text-foreground hover:bg-white/10 border-foreground/10'
            : 'text-zinc-600 hover:text-foreground hover:bg-foreground/5 border-foreground/5'
        }`}
        title={isSelected ? t('featureChip.hideFilter') : t('featureChip.showFilter')}
      >
        {isSelected ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
    </div>
  );
});

export const FeatureChipSelector = memo(function FeatureChipSelector({
  features,
  selectedFeatureIds,
  isAllSelected,
  onToggleFeature,
  onSelectAll,
  onFeatureInfoClick,
  onAddFeature,
  cascadeFeatureId,
}: FeatureChipSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="px-3 md:px-6 py-2 md:py-3 border-b border-bridge-border bg-bridge-dark shrink-0">
      <div className="flex items-stretch gap-1.5 md:gap-2.5 overflow-x-auto pb-1 custom-scrollbar">
        {/* 전체 보기 칩 */}
        <button
          onClick={onSelectAll}
          className={`flex flex-col items-center justify-center px-3 md:px-5 py-2 md:py-2.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 min-w-[52px] md:min-w-[64px] ${
            isAllSelected
              ? 'bg-indigo-500/20 text-indigo-300 border-2 border-indigo-500/60 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
              : 'bg-bridge-surface-hover border border-bridge-border text-zinc-500 hover:text-foreground hover:border-zinc-600'
          }`}
        >
          <span className="text-sm font-bold">{t('common.all')}</span>
          <span className={`text-xs mt-0.5 ${isAllSelected ? 'text-indigo-400' : 'text-zinc-600'}`}>
            {t('featureChip.count', { count: features.length })}
          </span>
        </button>

        <div className="w-px bg-bridge-border flex-shrink-0 my-1" />

        {/* Feature 칩들 */}
        {features.map((feature) => (
          <FeatureChip
            key={feature.id}
            feature={feature}
            isSelected={isAllSelected || selectedFeatureIds.includes(feature.id)}
            onFeatureInfoClick={onFeatureInfoClick}
            onToggleFeature={onToggleFeature}
            isCascading={feature.id === cascadeFeatureId}
            t={t}
          />
        ))}

        {/* Feature 추가 버튼 */}
        <button
          onClick={onAddFeature}
          className="flex items-center justify-center px-4 rounded-xl text-zinc-500 hover:text-foreground hover:bg-bridge-surface-hover border border-dashed border-bridge-border hover:border-indigo-500/50 transition-all flex-shrink-0"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
});
