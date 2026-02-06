import { useState, useEffect } from 'react';
import { X, Activity, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { ActivityLog } from '../utils/api';
import { getInitials } from '../utils/assigneeColor';
import { formatRelativeTime } from '../utils/dateUtils';

interface ActivityLogModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  activities: ActivityLog[];
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
}

export function ActivityLogModal({
  open,
  onClose,
  boardId,
  activities,
  hasMore,
  onLoadMore,
}: ActivityLogModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  if (!open) return null;

  const handleLoadMore = async () => {
    setIsLoading(true);
    try {
      await onLoadMore();
    } catch (error) {
      console.error('Failed to load more activities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionText = (activity: ActivityLog) => {
    const { action, user, metadata } = activity;

    switch (action) {
      case 'BLOCK_CREATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 블록 </span>
            <span className="font-medium text-purple-400">{metadata.blockName as string}</span>
            <span className="text-zinc-400">을 생성했습니다</span>
          </>
        );
      case 'BLOCK_UPDATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 블록 </span>
            <span className="font-medium text-purple-400">{metadata.blockName as string}</span>
            <span className="text-zinc-400">을 수정했습니다</span>
          </>
        );
      case 'BLOCK_DELETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 블록 </span>
            <span className="font-medium text-purple-400">{metadata.blockName as string}</span>
            <span className="text-zinc-400">을 삭제했습니다</span>
          </>
        );
      case 'FEATURE_CREATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 Feature </span>
            <span className="font-medium text-indigo-400">{metadata.featureTitle as string}</span>
            <span className="text-zinc-400">를 생성했습니다</span>
          </>
        );
      case 'FEATURE_UPDATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 Feature </span>
            <span className="font-medium text-indigo-400">{metadata.featureTitle as string}</span>
            <span className="text-zinc-400">를 수정했습니다</span>
          </>
        );
      case 'FEATURE_DELETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 Feature </span>
            <span className="font-medium text-indigo-400">{metadata.featureTitle as string}</span>
            <span className="text-zinc-400">를 삭제했습니다</span>
          </>
        );
      case 'FEATURE_COMPLETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 Feature </span>
            <span className="font-medium text-emerald-400">{metadata.featureTitle as string}</span>
            <span className="text-zinc-400">를 완료했습니다</span>
          </>
        );
      case 'TASK_CREATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 Task </span>
            <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
            <span className="text-zinc-400">를 생성했습니다</span>
          </>
        );
      case 'TASK_UPDATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 Task </span>
            <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
            <span className="text-zinc-400">를 수정했습니다</span>
          </>
        );
      case 'TASK_DELETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 Task </span>
            <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
            <span className="text-zinc-400">를 삭제했습니다</span>
          </>
        );
      case 'TASK_MOVED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 </span>
            <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
            <span className="text-zinc-400">를 </span>
            <span className="font-medium text-green-400">{metadata.fromBlock as string}</span>
            <span className="text-zinc-400">에서 </span>
            <span className="font-medium text-green-400">{metadata.toBlock as string}</span>
            <span className="text-zinc-400">로 이동했습니다</span>
          </>
        );
      case 'TASK_COMPLETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 Task </span>
            <span className="font-medium text-emerald-400">{metadata.taskTitle as string}</span>
            <span className="text-zinc-400">를 완료했습니다</span>
          </>
        );
      case 'CHECKLIST_CREATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 체크리스트 </span>
            <span className="font-medium text-indigo-400">{metadata.checklistTitle as string}</span>
            <span className="text-zinc-400">를 생성했습니다</span>
          </>
        );
      case 'CHECKLIST_CHECKED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 체크리스트 </span>
            <span className="font-medium text-indigo-400">{metadata.checklistTitle as string}</span>
            <span className="text-zinc-400">를 {metadata.isCompleted ? '완료' : '미완료'}했습니다</span>
          </>
        );
      default:
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-zinc-400">님이 작업을 수행했습니다</span>
          </>
        );
    }
  };

  const getTimeAgo = (dateStr: string) => {
    return formatRelativeTime(dateStr);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-kanban-bg rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-kanban-border">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-400" />
            <h2 className="text-xl font-semibold text-foreground">활동 로그</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activities.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>아직 활동 기록이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex gap-4 p-4 bg-kanban-card rounded-lg border border-kanban-border hover:border-white/20 transition-colors"
                >
                  {/* 아바타 */}
                  <div className="flex-shrink-0">
                    {activity.user.avatar ? (
                      <img
                        src={activity.user.avatar}
                        alt={activity.user.name}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-medium">
                        {getInitials(activity.user.name)}
                      </div>
                    )}
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm mb-1">{getActionText(activity)}</div>
                    <div className="text-xs text-zinc-400">
                      {getTimeAgo(activity.createdAt)}
                    </div>
                  </div>
                </div>
              ))}

              {/* 더 불러오기 버튼 */}
              {hasMore && (
                <Button
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full border-kanban-border text-zinc-300 hover:bg-white/5 hover:text-white"
                >
                  {isLoading ? (
                    '불러오는 중...'
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      더 보기
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-kanban-border p-4 bg-kanban-card">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full border-kanban-border text-zinc-300 hover:bg-white/5 hover:text-white"
          >
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
