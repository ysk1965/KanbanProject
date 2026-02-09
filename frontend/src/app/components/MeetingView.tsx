import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Bell, Trash2, ChevronDown, ChevronUp, Users, X, Loader2, Sparkles, Mic, Square, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { meetingAPI, MeetingSummary, MeetingDetail } from '../utils/api';
import { BoardMember } from './ShareBoardModal';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';
import MeetingAISuggestionModal from './MeetingAISuggestionModal';

// ============================
// Audio Recorder Hook
// ============================

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const mediaRecorder = new MediaRecorder(stream, { mimeType });

    chunksRef.current = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setAudioBlob(blob);
      stream.getTracks().forEach((t) => t.stop());
    };

    mediaRecorder.start(1000);
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setRecordingDuration(0);
    setAudioBlob(null);

    timerRef.current = setInterval(() => {
      setRecordingDuration((d) => d + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearRecording = () => {
    setAudioBlob(null);
    setRecordingDuration(0);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return { isRecording, recordingDuration, audioBlob, startRecording, stopRecording, clearRecording };
}

const MEETING_COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#6366F1', '#14B8A6'];

interface MeetingViewProps {
  boardId: string;
  selectedDate: Date;
  boardMembers: BoardMember[];
  onRefreshSchedule: () => void;
}

export function MeetingView({ boardId, selectedDate, boardMembers, onRefreshSchedule }: MeetingViewProps) {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [meetingDetails, setMeetingDetails] = useState<Record<string, MeetingDetail>>({});
  const [editingMemo, setEditingMemo] = useState<Record<string, string>>({});
  const [editingTranscript, setEditingTranscript] = useState<Record<string, string>>({});
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState<string | null>(null);

  const { isRecording, recordingDuration, audioBlob, startRecording, stopRecording, clearRecording } = useAudioRecorder();
  const hasMicSupport = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

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

  const loadMeetingDetail = useCallback(async (meetingId: string) => {
    try {
      const detail = await meetingAPI.getMeetingDetail(boardId, meetingId);
      setMeetingDetails(prev => ({ ...prev, [meetingId]: detail }));
      setEditingMemo(prev => ({ ...prev, [meetingId]: detail.memo || '' }));
      setEditingTranscript(prev => ({ ...prev, [meetingId]: detail.transcript || '' }));
    } catch (error) {
      console.error('Failed to load meeting detail:', error);
    }
  }, [boardId]);

  const handleToggleExpand = (meetingId: string) => {
    if (expandedId === meetingId) {
      setExpandedId(null);
    } else {
      setExpandedId(meetingId);
      if (!meetingDetails[meetingId]) {
        loadMeetingDetail(meetingId);
      }
    }
  };

  const handleMemoSave = async (meetingId: string) => {
    const memo = editingMemo[meetingId];
    if (memo === undefined) return;
    try {
      await meetingAPI.updateMeeting(boardId, meetingId, { memo });
      setMeetingDetails(prev => ({
        ...prev,
        [meetingId]: { ...prev[meetingId], memo },
      }));
    } catch (error) {
      console.error('Failed to save memo:', error);
    }
  };

  const handleDelete = async (meetingId: string) => {
    if (!confirm(t('meeting.deleteConfirm'))) return;
    try {
      await meetingAPI.deleteMeeting(boardId, meetingId);
      setMeetings(prev => prev.filter(m => m.id !== meetingId));
      if (expandedId === meetingId) setExpandedId(null);
      onRefreshSchedule();
    } catch (error) {
      console.error('Failed to delete meeting:', error);
    }
  };

  const handleNotify = async (meetingId: string) => {
    if (!confirm(t('meeting.notifyConfirm'))) return;
    try {
      await meetingAPI.notifyParticipants(boardId, meetingId);
      alert(t('meeting.notifySuccess'));
    } catch (error) {
      console.error('Failed to notify participants:', error);
    }
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch {
      alert(t('meeting.microphoneAccessDenied'));
    }
  };

  const handleTranscribe = async (meetingId: string) => {
    if (!audioBlob) return;
    if (audioBlob.size > 25 * 1024 * 1024) {
      alert(t('meeting.transcriptFileTooLarge'));
      return;
    }
    setIsTranscribing(true);
    try {
      const result = await meetingAPI.transcribeAudio(boardId, meetingId, audioBlob);
      setMeetingDetails(prev => ({
        ...prev,
        [meetingId]: { ...prev[meetingId], transcript: result.transcript },
      }));
      setEditingTranscript(prev => ({ ...prev, [meetingId]: result.transcript }));
      clearRecording();
    } catch (error) {
      console.error('Transcription failed:', error);
      alert(t('meeting.transcriptionError'));
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTranscriptSave = async (meetingId: string) => {
    const transcript = editingTranscript[meetingId];
    if (transcript === undefined) return;
    try {
      await meetingAPI.updateTranscript(boardId, meetingId, transcript);
      setMeetingDetails(prev => ({
        ...prev,
        [meetingId]: { ...prev[meetingId], transcript },
      }));
    } catch (error) {
      console.error('Failed to save transcript:', error);
    }
  };

  const handleMeetingCreated = () => {
    setShowCreateModal(false);
    loadMeetings();
    onRefreshSchedule();
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">
          {t('meeting.tab')}
        </h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-bridge-accent text-white rounded-xl text-sm font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
        >
          <Plus className="h-4 w-4" />
          {t('meeting.addMeeting')}
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
        <div className="space-y-3">
          {meetings.map(meeting => {
            const isExpanded = expandedId === meeting.id;
            const detail = meetingDetails[meeting.id];

            return (
              <div
                key={meeting.id}
                className="bg-bridge-obsidian rounded-2xl border border-white/5 overflow-hidden transition-all"
              >
                {/* Card Header */}
                <button
                  onClick={() => handleToggleExpand(meeting.id)}
                  className="w-full px-5 py-4 flex items-center gap-3 hover:bg-white/[0.02] transition-colors text-left"
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: meeting.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {meeting.title}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {meeting.start_time && (
                        <span className="text-xs text-slate-400">
                          {meeting.start_time.slice(0, 5)}
                          {meeting.end_time ? ` - ${meeting.end_time.slice(0, 5)}` : ''}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {t('meeting.participantCount', { count: meeting.participant_count })}
                      </span>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-white/5 pt-4 space-y-4">
                    {!detail ? (
                      <div className="flex items-center justify-center py-4 text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t('common.loading')}
                      </div>
                    ) : (
                      <>
                        {/* Participants */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            {t('meeting.participants')}
                          </label>
                          {detail.participants.length === 0 ? (
                            <p className="text-xs text-slate-400">{t('meeting.noParticipants')}</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {detail.participants.map(p => (
                                <div key={p.id} className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2.5 py-1.5">
                                  {p.profile_image ? (
                                    <img src={p.profile_image} alt={p.name} className="w-5 h-5 rounded-full" />
                                  ) : (
                                    <div
                                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-medium"
                                      style={{ backgroundColor: getAssigneeHex(p.name) }}
                                    >
                                      {getInitials(p.name)}
                                    </div>
                                  )}
                                  <span className="text-xs text-slate-300">{p.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Memo */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            {t('meeting.memo')}
                          </label>
                          <textarea
                            value={editingMemo[meeting.id] ?? detail.memo ?? ''}
                            onChange={e =>
                              setEditingMemo(prev => ({ ...prev, [meeting.id]: e.target.value }))
                            }
                            onBlur={() => handleMemoSave(meeting.id)}
                            placeholder={t('meeting.memoPlaceholder')}
                            rows={4}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
                          />
                        </div>

                        {/* Transcript */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            {t('meeting.transcript')}
                          </label>

                          {/* Recording Controls */}
                          {hasMicSupport && (
                            <div className="flex items-center gap-2 mb-2">
                              {!isRecording ? (
                                <button
                                  onClick={handleStartRecording}
                                  disabled={isTranscribing}
                                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                >
                                  <Mic className="h-3.5 w-3.5" />
                                  {t('meeting.startRecording')}
                                </button>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-lg">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-xs text-red-400 font-mono">
                                      {formatDuration(recordingDuration)}
                                    </span>
                                  </div>
                                  <button
                                    onClick={stopRecording}
                                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                                  >
                                    <Square className="h-3 w-3" />
                                    {t('meeting.stopRecording')}
                                  </button>
                                </>
                              )}

                              {audioBlob && !isTranscribing && (
                                <button
                                  onClick={() => handleTranscribe(meeting.id)}
                                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-bridge-secondary bg-bridge-secondary/10 rounded-lg hover:bg-bridge-secondary/20 transition-colors"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  {t('meeting.transcribe')}
                                </button>
                              )}

                              {isTranscribing && (
                                <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  {t('meeting.transcribing')}
                                </div>
                              )}
                            </div>
                          )}

                          {audioBlob && audioBlob.size > 24 * 1024 * 1024 && (
                            <p className="text-xs text-amber-400 mb-2">
                              {t('meeting.transcriptFileTooLarge')}
                            </p>
                          )}

                          <textarea
                            value={editingTranscript[meeting.id] ?? detail.transcript ?? ''}
                            onChange={e =>
                              setEditingTranscript(prev => ({ ...prev, [meeting.id]: e.target.value }))
                            }
                            onBlur={() => handleTranscriptSave(meeting.id)}
                            placeholder={t('meeting.transcriptPlaceholder')}
                            rows={4}
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          {(editingMemo[meeting.id]?.trim() || detail.memo?.trim() ||
                            editingTranscript[meeting.id]?.trim() || detail.transcript?.trim()) && (
                            <button
                              onClick={() => setShowAIModal(meeting.id)}
                              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-bridge-secondary bg-bridge-secondary/10 rounded-lg hover:bg-bridge-secondary/20 transition-colors"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {t('meeting.aiOrganize')}
                            </button>
                          )}
                          {detail.participants.length > 0 && (
                            <button
                              onClick={() => handleNotify(meeting.id)}
                              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-bridge-accent bg-bridge-accent/10 rounded-lg hover:bg-bridge-accent/20 transition-colors"
                            >
                              <Bell className="h-3.5 w-3.5" />
                              {t('meeting.notify')}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(meeting.id)}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors ml-auto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('meeting.delete')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
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

      {/* AI Suggestion Modal */}
      {showAIModal && (
        <MeetingAISuggestionModal
          boardId={boardId}
          meetingId={showAIModal}
          meetingTitle={meetings.find(m => m.id === showAIModal)?.title ?? ''}
          onClose={() => setShowAIModal(null)}
          onApplied={() => {
            setShowAIModal(null);
          }}
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
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [memo, setMemo] = useState('');
  const [color, setColor] = useState(MEETING_COLORS[0]);
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
        start_time: startTime || undefined,
        end_time: endTime || undefined,
        memo: memo || undefined,
        color,
      });
      onCreated();
    } catch (error) {
      console.error('Failed to create meeting:', error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-bridge-obsidian rounded-2xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden border border-white/10">
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

          {/* Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t('meeting.startTime')}
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t('meeting.endTime')}
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              {t('meeting.color')}
            </label>
            <div className="flex gap-2">
              {MEETING_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-bridge-obsidian scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
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
