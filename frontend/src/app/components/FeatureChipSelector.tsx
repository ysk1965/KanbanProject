import { Feature } from '../types';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FeatureChipSelectorProps {
  features: Feature[];
  selectedFeatureIds: string[];
  isAllSelected: boolean;
  onToggleFeature: (featureId: string) => void;
  onSelectAll: () => void;
  onFeatureInfoClick: (feature: Feature) => void;
  onAddFeature: () => void;
}

export function FeatureChipSelector({
  features,
  selectedFeatureIds,
  isAllSelected,
  onToggleFeature,
  onSelectAll,
  onFeatureInfoClick,
  onAddFeature,
}: FeatureChipSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="px-3 md:px-6 py-2 md:py-3 border-b border-kanban-border bg-kanban-bg">
      <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1 kanban-scrollbar">
        {/* 전체 보기 칩 */}
        <button
          onClick={onSelectAll}
          className={`flex flex-col items-center justify-center px-5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 min-w-[64px] ${
            isAllSelected
              ? 'bg-indigo-500/20 text-indigo-300 border-2 border-indigo-500/60 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
              : 'bg-kanban-surface border border-kanban-border text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
          }`}
        >
          <span className="text-sm font-bold">{t('common.all')}</span>
          <span className={`text-[10px] mt-0.5 ${isAllSelected ? 'text-indigo-400' : 'text-zinc-600'}`}>
            {t('featureChip.count', { count: features.length })}
          </span>
        </button>

        <div className="w-px bg-kanban-border flex-shrink-0 my-1" />

        {/* Feature 칩들 */}
        {features.map((feature) => {
          const isSelected = isAllSelected || selectedFeatureIds.includes(feature.id);
          const featureColor = feature.color || '#8B5CF6';
          const isCompleted = feature.progress_percentage === 100 && feature.total_tasks > 0;
          const progressColor = isCompleted ? '#22c55e' : featureColor;
          const progressPercent = feature.total_tasks > 0 ? Math.round(feature.progress_percentage) : 0;

          return (
            <div
              key={feature.id}
              className={`relative flex items-stretch rounded-xl text-xs whitespace-nowrap transition-all flex-shrink-0 overflow-hidden ${
                isSelected
                  ? 'border-2 shadow-lg'
                  : 'border border-kanban-border hover:border-zinc-600 opacity-60 hover:opacity-90'
              }`}
              style={isSelected ? {
                backgroundColor: `${featureColor}10`,
                borderColor: `${featureColor}66`,
                boxShadow: `0 0 16px ${featureColor}15`,
              } : {
                backgroundColor: 'var(--kanban-surface)',
              }}
            >
              {/* 좌측 컬러 바 */}
              <div
                className="w-1 flex-shrink-0"
                style={{ backgroundColor: isSelected ? featureColor : `${featureColor}40` }}
              />

              {/* 메인 영역 (클릭 = 상세 보기) */}
              <button
                onClick={() => onFeatureInfoClick(feature)}
                className="flex flex-col justify-center gap-1.5 pl-3 pr-2 py-2.5 min-w-[100px]"
              >
                {/* 타이틀 */}
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: featureColor }}
                  />
                  <span className={`font-bold text-[12px] max-w-[130px] truncate ${
                    isSelected ? 'text-foreground' : 'text-zinc-400'
                  }`}>
                    {feature.title}
                  </span>
                </div>

                {/* 진행률 바 + 텍스트 */}
                <div className="flex items-center gap-2 pl-3.5">
                  <div className="w-14 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${progressPercent}%`,
                        backgroundColor: isSelected ? progressColor : `${progressColor}60`,
                      }}
                    />
                  </div>
                  <span className={`text-[10px] font-semibold ${
                    isCompleted ? 'text-green-400' : isSelected ? 'text-zinc-300' : 'text-zinc-500'
                  }`}>
                    {feature.completed_tasks}/{feature.total_tasks}
                  </span>
                </div>
              </button>

              {/* 필터 토글 버튼 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFeature(feature.id);
                }}
                className={`flex items-center justify-center w-8 flex-shrink-0 transition-all border-l ${
                  isSelected
                    ? 'text-zinc-300 hover:text-white hover:bg-white/10 border-white/10'
                    : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/5 border-white/5'
                }`}
                title={isSelected ? t('featureChip.hideFilter') : t('featureChip.showFilter')}
              >
                {isSelected ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          );
        })}

        {/* Feature 추가 버튼 */}
        <button
          onClick={onAddFeature}
          className="flex items-center justify-center px-4 rounded-xl text-zinc-500 hover:text-white hover:bg-kanban-surface border border-dashed border-kanban-border hover:border-indigo-500/50 transition-all flex-shrink-0"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
