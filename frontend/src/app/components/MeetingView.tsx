import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Users, X, Loader2, ChevronDown, RotateCw, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { meetingAPI, MeetingSummary } from '../utils/api';
import { BoardMember } from './ShareBoardModal';
import { MeetingDetailPanel } from './MeetingDetailModal';

interface MeetingViewProps {
  boardId: string;
  selectedDate: Date;
  boardMembers: BoardMember[];
  onRefreshSchedule: () => void;
  refreshTrigger?: number;
  onOpenCalendar?: () => void;
}

export function MeetingView({ boardId, selectedDate, boardMembers, onRefreshSchedule, refreshTrigger, onOpenCalendar }: MeetingViewProps) {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadMeetings = useCallback(async () => {
    if (!boardId) return;
    setIsLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const data = await meetingAPI.getMeetings(boardId, dateStr);
      setMeetings(data);
    } catch (error) {
      console.error('Failed to load meetings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, selectedDate]);

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  // WebSocket 이벤트로 인한 리프레시
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadMeetings();
    }
  }, [refreshTrigger]);

  const handleMeetingCreated = () => {
    setShowCreateModal(false);
    loadMeetings();
    onRefreshSchedule();
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {onOpenCalendar && (
            <button
              onClick={onOpenCalendar}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Calendar size={18} />
            </button>
          )}
          <h3 className="text-base font-semibold text-white">
            {format(selectedDate, 'M월 d일 (E)', { locale: ko })}
          </h3>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 md:px-4 bg-bridge-accent text-white rounded-xl text-sm font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('meeting.addMeeting')}</span>
          <span className="sm:hidden">{t('meeting.addMeeting')}</span>
        </button>
      </div>

      {/* Meeting List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          {t('common.loading')}
        </div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
            <Users className="h-8 w-8 text-slate-400" />
          </div>
          <p className="text-slate-400 text-sm">{t('meeting.noMeetings')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map(meeting => {
            const isExpanded = expandedId === meeting.id;
            return (
              <div
                key={meeting.id}
                className={`bg-bridge-obsidian rounded-xl border transition-all ${
                  isExpanded ? 'border-white/10' : 'border-white/5 hover:bg-white/[0.03] hover:border-white/10'
                }`}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
                  className="w-full text-left px-4 py-3 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate transition-colors ${
                        isExpanded ? 'text-bridge-accent' : 'text-white group-hover:text-bridge-accent'
                      }`}>
                        {meeting.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {meeting.recurrence_group_id && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            <RotateCw className="h-2.5 w-2.5" />
                            {t('meeting.recurring', '반복')}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {t('meeting.participantCount', { count: meeting.participant_count })}
                        </span>
                        {meeting.start_time && (
                          <span className="text-xs text-slate-500">
                            {meeting.start_time.slice(0, 5)}
                            {meeting.end_time ? ` - ${meeting.end_time.slice(0, 5)}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform flex-shrink-0 ${
                      isExpanded ? 'rotate-180' : ''
                    }`} />
                  </div>
                </button>

                {isExpanded && (
                  <MeetingDetailPanel
                    boardId={boardId}
                    meetingId={meeting.id}
                    onDeleted={() => {
                      setExpandedId(null);
                      loadMeetings();
                      onRefreshSchedule();
                    }}
                    onUpdated={() => {
                      loadMeetings();
                      onRefreshSchedule();
                    }}
                    refreshTrigger={refreshTrigger}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <MeetingCreateModal
          boardId={boardId}
          selectedDate={selectedDate}
          boardMembers={boardMembers}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleMeetingCreated}
        />
      )}
    </div>
  );
}

// ============================
// Meeting Create Modal
// ============================

interface MeetingCreateModalProps {
  boardId: string;
  selectedDate: Date;
  boardMembers: BoardMember[];
  onClose: () => void;
  onCreated: () => void;
}

function MeetingCreateModal({ boardId, selectedDate, onClose, onCreated }: MeetingCreateModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState<string>('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const canSubmit = title.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await meetingAPI.createMeeting(boardId, {
        title: title.trim(),
        meeting_date: format(selectedDate, 'yyyy-MM-dd'),
        memo: memo || undefined,
        recurrence_rule: recurrenceRule || null,
        recurrence_end_date: recurrenceEndDate || null,
      });
      onCreated();
    } catch (error) {
      console.error('Failed to create meeting:', error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-bridge-obsidian rounded-2xl shadow-2xl w-[480px] max-w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">{t('meeting.addMeeting')}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              {t('meeting.title')}
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('meeting.titlePlaceholder')}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            />
          </div>

          {/* Memo */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              {t('meeting.memo')}
            </label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder={t('meeting.memoPlaceholder')}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
            />
          </div>

          {/* Recurrence */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              {t('meeting.recurrence', '반복')}
            </label>
            <select
              value={recurrenceRule}
              onChange={e => setRecurrenceRule(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            >
              <option value="">{t('meeting.noRecurrence', '반복 안 함')}</option>
              <option value="WEEKLY">{t('meeting.recurrenceWeekly', '매주')}</option>
              <option value="BIWEEKLY">{t('meeting.recurrenceBiweekly', '격주')}</option>
              <option value="MONTHLY">{t('meeting.recurrenceMonthly', '매월')}</option>
            </select>
          </div>

          {recurrenceRule && (
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t('meeting.recurrenceEndDate', '반복 종료일')}
              </label>
              <input
                type="date"
                value={recurrenceEndDate}
                onChange={e => setRecurrenceEndDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
              <p className="mt-1 text-xs text-slate-500">
                {t('meeting.recurrenceEndDateHint', '비워두면 계속 반복됩니다')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors border border-white/10 rounded-xl hover:bg-white/5"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="flex-1 py-3 bg-gradient-to-r from-bridge-accent to-purple-500 text-sm font-bold text-white rounded-xl shadow-lg shadow-bridge-accent/20 disabled:opacity-50 disabled:grayscale hover:shadow-bridge-accent/40 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('common.processing')}
              </>
            ) : (
              t('meeting.create')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
