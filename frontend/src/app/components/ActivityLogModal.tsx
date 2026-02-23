import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Activity, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { MotionModal } from './ui/MotionModal';
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
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

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
            <span className="text-slate-400">{t('activity.blockCreatedPrefix')}</span>
            <span className="font-medium text-purple-400">{metadata.blockName as string}</span>
            <span className="text-slate-400">{t('activity.blockCreatedSuffix')}</span>
          </>
        );
      case 'BLOCK_UPDATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.blockUpdatedPrefix')}</span>
            <span className="font-medium text-purple-400">{metadata.blockName as string}</span>
            <span className="text-slate-400">{t('activity.blockUpdatedSuffix')}</span>
          </>
        );
      case 'BLOCK_DELETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.blockDeletedPrefix')}</span>
            <span className="font-medium text-purple-400">{metadata.blockName as string}</span>
            <span className="text-slate-400">{t('activity.blockDeletedSuffix')}</span>
          </>
        );
      case 'FEATURE_CREATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.featureCreatedPrefix')}</span>
            <span className="font-medium text-indigo-400">{metadata.featureTitle as string}</span>
            <span className="text-slate-400">{t('activity.featureCreatedSuffix')}</span>
          </>
        );
      case 'FEATURE_UPDATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.featureUpdatedPrefix')}</span>
            <span className="font-medium text-indigo-400">{metadata.featureTitle as string}</span>
            <span className="text-slate-400">{t('activity.featureUpdatedSuffix')}</span>
          </>
        );
      case 'FEATURE_DELETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.featureDeletedPrefix')}</span>
            <span className="font-medium text-indigo-400">{metadata.featureTitle as string}</span>
            <span className="text-slate-400">{t('activity.featureDeletedSuffix')}</span>
          </>
        );
      case 'FEATURE_COMPLETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.featureCompletedPrefix')}</span>
            <span className="font-medium text-emerald-400">{metadata.featureTitle as string}</span>
            <span className="text-slate-400">{t('activity.featureCompletedSuffix')}</span>
          </>
        );
      case 'TASK_CREATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.taskCreatedPrefix')}</span>
            <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
            <span className="text-slate-400">{t('activity.taskCreatedSuffix')}</span>
          </>
        );
      case 'TASK_UPDATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.taskUpdatedPrefix')}</span>
            <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
            <span className="text-slate-400">{t('activity.taskUpdatedSuffix')}</span>
          </>
        );
      case 'TASK_DELETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.taskDeletedPrefix')}</span>
            <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
            <span className="text-slate-400">{t('activity.taskDeletedSuffix')}</span>
          </>
        );
      case 'TASK_MOVED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.taskMovedPrefix')}</span>
            <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
            <span className="text-slate-400">{t('activity.taskMovedFrom')}</span>
            <span className="font-medium text-green-400">{metadata.fromBlock as string}</span>
            <span className="text-slate-400">{t('activity.taskMovedTo')}</span>
            <span className="font-medium text-green-400">{metadata.toBlock as string}</span>
            <span className="text-slate-400">{t('activity.taskMovedSuffix')}</span>
          </>
        );
      case 'TASK_COMPLETED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.taskCompletedPrefix')}</span>
            <span className="font-medium text-emerald-400">{metadata.taskTitle as string}</span>
            <span className="text-slate-400">{t('activity.taskCompletedSuffix')}</span>
          </>
        );
      case 'CHECKLIST_CREATED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.checklistCreatedPrefix')}</span>
            <span className="font-medium text-indigo-400">{metadata.checklistTitle as string}</span>
            <span className="text-slate-400">{t('activity.checklistCreatedSuffix')}</span>
          </>
        );
      case 'CHECKLIST_CHECKED':
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.checklistCheckedPrefix')}</span>
            <span className="font-medium text-indigo-400">{metadata.checklistTitle as string}</span>
            <span className="text-slate-400">{t('activity.checklistCheckedSuffix', { status: metadata.isCompleted ? t('common.completed') : t('common.incomplete') })}</span>
          </>
        );
      default:
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-slate-400">{t('activity.defaultAction')}</span>
          </>
        );
    }
  };

  const getTimeAgo = (dateStr: string) => {
    return formatRelativeTime(dateStr);
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-2xl p-0 overflow-hidden bg-bridge-dark flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-bridge-border">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-400" />
            <h2 className="text-xl font-semibold text-foreground">{t('activity.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6">
          {activities.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('activity.noActivity')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex gap-4 p-4 bg-bridge-surface rounded-lg border border-bridge-border hover:border-foreground/10 transition-colors"
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
                    <div className="text-xs text-slate-400">
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
                  className="w-full border-bridge-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                >
                  {isLoading ? (
                    t('activity.loading')
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      {t('activity.loadMore')}
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-bridge-border p-4 bg-bridge-surface">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full border-bridge-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            {t('common.close')}
          </Button>
        </div>
    </MotionModal>
  );
}
