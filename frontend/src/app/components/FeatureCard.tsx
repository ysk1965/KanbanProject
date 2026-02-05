import { Feature, Task, Milestone } from '../types';
import { Calendar, AlertCircle, ChevronDown, ChevronUp, ChevronRight, Flag } from 'lucide-react';
import { useState } from 'react';

interface FeatureCardProps {
  feature: Feature;
  onClick?: () => void;
  availableTags?: Array<{ id: string; name: string; color: string }>;
  tasks?: Task[];
  milestone?: Milestone;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const priorityInfo: Record<string, { color: string; bg: string; label: string }> = {
  HIGH: { color: 'text-red-400', bg: 'bg-red-500/10', label: '높음' },
  MEDIUM: { color: 'text-amber-400', bg: 'bg-amber-500/10', label: '보통' },
  LOW: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: '낮음' },
};

export function FeatureCard({ feature, onClick, availableTags = [], tasks = [], milestone, isExpanded: externalIsExpanded, onToggleExpand }: FeatureCardProps) {
  const progressPercent = feature.progress_percentage;
  const isCompleted = progressPercent === 100 && feature.total_tasks > 0;
  const featureTags = feature.tags || [];
  const featureColor = feature.color || '#8B5CF6';
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);
  const p = priorityInfo[feature.priority || 'MEDIUM'];

  // 외부 제어가 있으면 외부 상태 사용, 없으면 내부 상태 사용
  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalIsExpanded(!internalIsExpanded);
    }
  };

  return (
    <div
      onClick={onClick}
      className="group relative bg-kanban-card-hover rounded-2xl border border-kanban-border p-5 hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all cursor-pointer overflow-hidden kanban-glow"
    >
      {/* 좌측 컬러 바 */}
      <div
        className="absolute top-0 left-0 bottom-0 w-1.5"
        style={{ backgroundColor: featureColor }}
      />

      {/* 제목 영역 */}
      <div className="flex items-start justify-between mb-4 pl-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: featureColor }}
            />
            <h3 className="font-bold text-foreground text-[15px] group-hover:text-indigo-400 transition-colors">
              {feature.title}
            </h3>
          </div>

          {/* 마일스톤 뱃지 */}
          {milestone && (
            <div className="flex items-center gap-2 bg-kanban-card px-2 py-0.5 rounded-md border border-kanban-border mt-2">
              <Flag size={10} className="text-indigo-400" />
              <span className="text-[10px] text-indigo-400 font-bold">{milestone.title}</span>
            </div>
          )}
        </div>
      </div>

      {/* 태그 표시 */}
      {featureTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4 pl-2">
          {featureTags.map((tag) => (
            <span
              key={tag.id}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{
                backgroundColor: `${tag.color}15`,
                borderColor: `${tag.color}44`,
                color: tag.color,
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* 진행률 */}
      <div className="mb-4 pl-2">
        <div className="flex justify-between text-[11px] mb-1.5">
          <span className="text-zinc-400 font-medium">
            {feature.completed_tasks}/{feature.total_tasks} 완료
          </span>
          <span className={`font-bold ${isCompleted ? 'text-green-400' : 'text-foreground'}`}>
            {Math.round(progressPercent)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-kanban-surface rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-1000 ease-out rounded-full"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: isCompleted ? '#22c55e' : featureColor,
              boxShadow: `0 0 10px ${isCompleted ? '#22c55e' : featureColor}44`,
            }}
          />
        </div>
      </div>

      {/* 추가 정보 */}
      <div className="flex items-center justify-between border-t border-kanban-border pt-4 mt-1 pl-2">
        <div className="flex items-center gap-3">
          {feature.priority && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${p.bg}`}>
              <AlertCircle size={12} className={p.color} />
              <span className={`text-[10px] font-bold ${p.color}`}>{p.label}</span>
            </div>
          )}
          {feature.due_date && (
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Calendar size={12} />
              <span className="text-[10px] font-medium">{feature.due_date}</span>
            </div>
          )}
        </div>

        {tasks.length > 0 && (
          <button
            onClick={handleExpandClick}
            className="flex items-center gap-1 group/sub"
          >
            <span className="text-[10px] font-bold text-zinc-300 group-hover/sub:text-foreground transition-colors">
              서브태스크
            </span>
            {isExpanded ? (
              <ChevronDown size={14} className="text-zinc-400 group-hover/sub:text-foreground transition-all" />
            ) : (
              <ChevronRight size={14} className="text-zinc-400 group-hover/sub:text-foreground transition-all" />
            )}
          </button>
        )}
      </div>

      {/* 서브태스크 목록 */}
      {isExpanded && tasks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-kanban-border pl-2 space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-kanban-surface hover:bg-white/5 transition-colors"
            >
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                  task.completed ? 'bg-green-500' : 'bg-zinc-500'
                }`}
              >
                {task.completed && (
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span
                className={`text-xs flex-1 ${
                  task.completed ? 'text-zinc-400 line-through' : 'text-zinc-200'
                }`}
              >
                {task.title}
              </span>
              <span className="text-[10px] font-bold text-zinc-400 tracking-wider">
                → {task.block_name || task.block_id}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
