import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { notificationPreferenceAPI } from '../utils/api';
import { NotificationPreferences } from '../types';

interface NotificationPreferencesPanelProps {
  boardId: string;
  hasSlack: boolean;
}

const NOTIFICATION_TYPES = [
  { key: 'comment_mention', labelKey: 'notificationPreferences.commentMention', descKey: 'notificationPreferences.commentMentionDesc' },
  { key: 'checklist_assigned', labelKey: 'notificationPreferences.checklistAssigned', descKey: 'notificationPreferences.checklistAssignedDesc' },
  { key: 'task_comment', labelKey: 'notificationPreferences.taskComment', descKey: 'notificationPreferences.taskCommentDesc' },
] as const;

type PrefKey = typeof NOTIFICATION_TYPES[number]['key'];

export function NotificationPreferencesPanel({ boardId, hasSlack }: NotificationPreferencesPanelProps) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      const prefData = await notificationPreferenceAPI.getMyPreferences(boardId);
      setPrefs(prefData);
    } catch {
      setPrefs({
        id: null,
        board_id: boardId,
        comment_mention_enabled: true,
        checklist_assigned_enabled: true,
        task_comment_enabled: true,
        slack_comment_mention_enabled: true,
        slack_checklist_assigned_enabled: true,
        slack_task_comment_enabled: true,
        created_at: null,
        updated_at: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const savePreferences = useCallback(async (updatedPrefs: NotificationPreferences) => {
    try {
      await notificationPreferenceAPI.upsertMyPreferences(boardId, {
        commentMentionEnabled: updatedPrefs.comment_mention_enabled,
        checklistAssignedEnabled: updatedPrefs.checklist_assigned_enabled,
        taskCommentEnabled: updatedPrefs.task_comment_enabled,
        slackCommentMentionEnabled: updatedPrefs.slack_comment_mention_enabled,
        slackChecklistAssignedEnabled: updatedPrefs.slack_checklist_assigned_enabled,
        slackTaskCommentEnabled: updatedPrefs.slack_task_comment_enabled,
      });
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
    }
  }, [boardId]);

  const handleToggle = (key: PrefKey, channel: 'inapp' | 'slack') => {
    if (!prefs) return;

    const fieldKey = channel === 'inapp'
      ? `${key}_enabled` as keyof NotificationPreferences
      : `slack_${key}_enabled` as keyof NotificationPreferences;

    const updatedPrefs = {
      ...prefs,
      [fieldKey]: !prefs[fieldKey],
    };
    setPrefs(updatedPrefs);

    // Debounced save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      savePreferences(updatedPrefs);
    }, 500);
  };

  if (isLoading || !prefs) return null;

  return (
    <div className="mx-3 mb-2 bg-white/[0.03] rounded-xl border border-foreground/10 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-foreground/5 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Settings size={12} className="text-slate-400" />
          <span className="text-[11px] font-medium text-muted-foreground">{t('notificationPreferences.title')}</span>
        </div>
        {isOpen ? (
          <ChevronUp size={12} className="text-slate-400" />
        ) : (
          <ChevronDown size={12} className="text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 border-t border-foreground/5">
          {/* Header row */}
          <div className="flex items-center gap-2 pt-2 pb-1.5">
            <div className="flex-1" />
            <div className="w-10 text-center">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">{t('notificationPreferences.inApp')}</span>
            </div>
            <div className="w-10 text-center">
              <span className={`text-[9px] uppercase tracking-wider ${hasSlack ? 'text-slate-500' : 'text-slate-600'}`}>
                Slack
              </span>
            </div>
          </div>

          {/* Toggle rows */}
          <div className="space-y-1">
            {NOTIFICATION_TYPES.map(({ key, labelKey, descKey }) => (
              <div key={key} className="flex items-center gap-2 py-1.5 group">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-muted-foreground">{t(labelKey)}</div>
                  <div className="text-[9px] text-slate-500 leading-tight">{t(descKey)}</div>
                </div>
                {/* In-app toggle */}
                <div className="w-10 flex justify-center">
                  <button
                    onClick={() => handleToggle(key, 'inapp')}
                    className={`w-7 h-4 rounded-full transition-colors relative ${
                      prefs[`${key}_enabled` as keyof NotificationPreferences]
                        ? 'bg-bridge-accent'
                        : 'bg-foreground/10'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                        prefs[`${key}_enabled` as keyof NotificationPreferences]
                          ? 'translate-x-3.5'
                          : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                {/* Slack toggle */}
                <div className="w-10 flex justify-center">
                  <button
                    onClick={() => handleToggle(key, 'slack')}
                    disabled={!hasSlack}
                    className={`w-7 h-4 rounded-full transition-colors relative ${
                      !hasSlack
                        ? 'bg-foreground/5 cursor-not-allowed opacity-40'
                        : prefs[`slack_${key}_enabled` as keyof NotificationPreferences]
                          ? 'bg-bridge-accent'
                          : 'bg-foreground/10'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                        prefs[`slack_${key}_enabled` as keyof NotificationPreferences]
                          ? 'translate-x-3.5'
                          : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!hasSlack && (
            <p className="text-[9px] text-slate-600 mt-2">
              {t('notificationPreferences.slackRequiresConnection')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
