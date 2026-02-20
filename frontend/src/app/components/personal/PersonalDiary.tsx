import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, BookHeart, ChevronLeft, ChevronRight, Check, Sparkles, RotateCcw, BookOpen, Pencil, RefreshCw, AlertTriangle, X, CalendarIcon, Mic, Volume2, Play, Pause, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionModal } from '../ui/MotionModal';
import { useTranslation } from 'react-i18next';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday as isTodayFn,
  addMonths,
  subMonths,
} from 'date-fns';
import { diaryService } from '../../utils/services';
import { formatDate } from '../../utils/dateUtils';
import { useHolidays } from '../../hooks/useHolidays';
import type { DiaryDetail, DiaryMessage, DiarySimple } from '../../types';
import type { TFunction } from 'i18next';

const MOOD_ENTRIES = [
  { emoji: '\u{1F60A}', key: 'moodHappy', value: 'happy' },
  { emoji: '\u{1F60C}', key: 'moodCalm', value: 'calm' },
  { emoji: '\u{1F914}', key: 'moodThoughtful', value: 'thoughtful' },
  { emoji: '\u{1F614}', key: 'moodTired', value: 'tired' },
  { emoji: '\u{1F622}', key: 'moodSad', value: 'sad' },
  { emoji: '\u{1F620}', key: 'moodFrustrated', value: 'frustrated' },
  { emoji: '\u{1F929}', key: 'moodExcited', value: 'excited' },
  { emoji: '\u{1F971}', key: 'moodBored', value: 'bored' },
];

function getMoods(t: TFunction) {
  return MOOD_ENTRIES.map((m) => ({
    emoji: m.emoji,
    label: t(`personal.diary.${m.key}`),
    value: m.value,
  }));
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ============================
// Voice Recording States
// ============================
type VoiceState = 'idle' | 'recording' | 'processing' | 'ai-speaking';

export function PersonalDiary() {
  const { t, i18n } = useTranslation();
  const MOODS = useMemo(() => getMoods(t), [t]);
  const [currentDate, setCurrentDate] = useState(toDateString(new Date()));
  const [diary, setDiary] = useState<DiaryDetail | null>(null);
  const [diaryList, setDiaryList] = useState<DiarySimple[]>([]);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const voiceStateRef = useRef<VoiceState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [hasMicSupport, setHasMicSupport] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync wrapper: updates both state (for rendering) and ref (for synchronous checks in event handlers)
  const updateVoiceState = useCallback((newState: VoiceState) => {
    voiceStateRef.current = newState;
    setVoiceState(newState);
  }, []);

  const currentDateObj = new Date(currentDate + 'T00:00:00');
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(currentDateObj));

  // Check mic support
  useEffect(() => {
    setHasMicSupport(!!navigator.mediaDevices?.getUserMedia);
  }, []);

  // Sync calendar month when currentDate changes to a different month
  useEffect(() => {
    const dateMonth = startOfMonth(new Date(currentDate + 'T00:00:00'));
    if (!isSameMonth(dateMonth, calendarMonth)) {
      setCalendarMonth(dateMonth);
    }
  }, [currentDate]);

  const calendarYear = calendarMonth.getFullYear();
  const { holidayMap } = useHolidays(i18n.language, calendarYear);
  const calendarMonthNum = calendarMonth.getMonth() + 1;

  useEffect(() => {
    loadDiary();
  }, [currentDate]);

  useEffect(() => {
    loadDiaryList();
  }, [calendarYear, calendarMonthNum]);

  useEffect(() => {
    scrollToBottom();
  }, [diary?.messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      // Always stop stream tracks to release microphone
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadDiary = async () => {
    setIsLoading(true);
    try {
      const data = await diaryService.getByDate(currentDate);
      setDiary(data);
    } catch (error) {
      console.error('Failed to load diary:', error);
      setDiary(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDiaryList = async () => {
    try {
      const data = await diaryService.getList(calendarYear, calendarMonthNum);
      setDiaryList(data);
    } catch (error) {
      console.error('Failed to load diary list:', error);
    }
  };

  const handleStartDiary = async () => {
    try {
      const data = await diaryService.create(currentDate);
      setDiary(data);
    } catch (error) {
      console.error('Failed to create diary:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !diary || isSending) return;

    const content = message.trim();
    setMessage('');
    setIsSending(true);

    // Optimistic update - add user message immediately
    const tempUserMsg: DiaryMessage = {
      id: `temp-${Date.now()}`,
      role: 'USER',
      content,
      message_order: (diary.messages?.length || 0) + 1,
      created_at: new Date().toISOString(),
    };
    setDiary((prev) => prev ? { ...prev, messages: [...(prev.messages || []), tempUserMsg] } : prev);

    try {
      const reply = await diaryService.sendMessage(diary.id, content);
      // Replace temp message with actual and add AI reply
      setDiary((prev) => {
        if (!prev) return prev;
        const msgs = prev.messages.filter((m) => m.id !== tempUserMsg.id);
        return {
          ...prev,
          messages: [...msgs, reply.user_message, reply.ai_message],
        };
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Revert optimistic update
      setDiary((prev) => prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempUserMsg.id) } : prev);
      setMessage(content);
    } finally {
      setIsSending(false);
    }
  };

  // ============================
  // Voice Recording Handlers
  // ============================

  const stopStreamTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!diary || voiceStateRef.current !== 'idle') return;

    // Mark as recording immediately via ref so touchend can detect it synchronously
    voiceStateRef.current = 'recording';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // If stopRecording was called while awaiting getUserMedia, abort
      if (voiceStateRef.current !== 'recording') {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = supportedTypes.find((t) => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stopStreamTracks();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          handleVoiceSubmit(blob);
        } else {
          updateVoiceState('idle');
        }
      };

      mediaRecorder.onerror = () => {
        stopStreamTracks();
        updateVoiceState('idle');
      };

      mediaRecorder.start(500);
      mediaRecorderRef.current = mediaRecorder;
      updateVoiceState('recording');
      setRecordingDuration(0);

      if (navigator.vibrate) navigator.vibrate(50);

      timerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      stopStreamTracks();
      updateVoiceState('idle');

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert(t('personal.diary.voiceMicDenied', '마이크 접근이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.'));
      } else if (error.name === 'NotFoundError') {
        alert(t('personal.diary.voiceMicNotFound', '마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.'));
      }
    }
  }, [diary, stopStreamTracks, updateVoiceState, t]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      // onstop callback will call stopStreamTracks
    } else {
      // MediaRecorder not recording - clean up stream directly
      stopStreamTracks();
      updateVoiceState('idle');
    }
    if (navigator.vibrate) navigator.vibrate(30);
  }, [stopStreamTracks, updateVoiceState]);

  const handleVoiceSubmit = async (audioBlob: Blob) => {
    if (!diary) return;

    updateVoiceState('processing');
    setIsSending(true);

    // Optimistic: add placeholder user message
    const tempUserMsg: DiaryMessage = {
      id: `temp-voice-${Date.now()}`,
      role: 'USER',
      content: t('personal.diary.voiceProcessing'),
      message_order: (diary.messages?.length || 0) + 1,
      created_at: new Date().toISOString(),
    };
    setDiary((prev) => prev ? { ...prev, messages: [...(prev.messages || []), tempUserMsg] } : prev);

    try {
      const reply = await diaryService.sendVoiceMessage(diary.id, audioBlob);

      // Replace temp message with actual messages
      setDiary((prev) => {
        if (!prev) return prev;
        const msgs = prev.messages.filter((m) => m.id !== tempUserMsg.id);
        return {
          ...prev,
          messages: [...msgs, reply.user_message, reply.ai_message],
        };
      });

      // Auto-play AI voice response
      if (reply.ai_audio_url) {
        // Stop any existing playback first
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        updateVoiceState('ai-speaking');
        const audio = new Audio(reply.ai_audio_url);
        audioRef.current = audio;
        audio.onended = () => {
          updateVoiceState('idle');
          audioRef.current = null;
        };
        audio.onerror = () => {
          updateVoiceState('idle');
          audioRef.current = null;
        };
        audio.play().catch(() => {
          updateVoiceState('idle');
          audioRef.current = null;
        });
      } else {
        updateVoiceState('idle');
      }
    } catch (error) {
      console.error('Failed to process voice message:', error);
      setDiary((prev) => prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempUserMsg.id) } : prev);
      updateVoiceState('idle');
    } finally {
      setIsSending(false);
    }
  };

  const stopAiSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    updateVoiceState('idle');
  }, []);

  const formatRecordTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const [isCompleting, setIsCompleting] = useState(false);

  const handleCompleteDiary = async (mood?: string) => {
    if (!diary || isCompleting) return;
    setIsCompleting(true);
    try {
      const data = await diaryService.complete(diary.id, { mood });
      setDiary(data);
      loadDiaryList();
    } catch (error) {
      console.error('Failed to complete diary:', error);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleReopen = async () => {
    if (!diary) return;
    try {
      const data = await diaryService.reopen(diary.id);
      setDiary(data);
    } catch (error) {
      console.error('Failed to reopen diary:', error);
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = async () => {
    if (!diary) return;
    try {
      const data = await diaryService.reset(diary.id);
      setDiary(data);
      setShowResetConfirm(false);
      loadDiaryList();
    } catch (error) {
      console.error('Failed to reset diary:', error);
    }
  };

  const today = toDateString(new Date());
  const isToday = currentDate === today;

  // Diary dates for the mini calendar indicators
  const diaryDateMap = useMemo(() => {
    const map = new Map<string, DiarySimple>();
    diaryList.forEach((d) => map.set(d.diary_date, d));
    return map;
  }, [diaryList]);

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [calendarMonth]);

  const weekDays = [
    t('personal.diary.sun'),
    t('personal.diary.mon'),
    t('personal.diary.tue'),
    t('personal.diary.wed'),
    t('personal.diary.thu'),
    t('personal.diary.fri'),
    t('personal.diary.sat'),
  ];

  const handleCalendarDateClick = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    setCurrentDate(dateStr);
    if (!isSameMonth(day, calendarMonth)) {
      setCalendarMonth(startOfMonth(day));
    }
    setShowMobileSidebar(false);
  };

  const handlePrevMonth = () => setCalendarMonth(subMonths(calendarMonth, 1));
  const handleNextMonth = () => setCalendarMonth(addMonths(calendarMonth, 1));
  const handleCalendarToday = () => {
    const now = new Date();
    setCalendarMonth(startOfMonth(now));
    setCurrentDate(toDateString(now));
  };

  return (
    <div className="h-full flex relative">
      {/* Mobile Sidebar Toggle Button */}
      <button
        onClick={() => setShowMobileSidebar(true)}
        className="md:hidden fixed left-4 z-40 w-11 h-11 rounded-full bg-bridge-accent shadow-lg shadow-bridge-accent/30 flex items-center justify-center text-white hover:bg-bridge-accent/90 transition-colors"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <CalendarIcon size={18} />
      </button>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {showMobileSidebar && (
          <motion.div
            className="md:hidden fixed inset-0 z-50"
            onClick={() => setShowMobileSidebar(false)}
            initial={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
            animate={{ backgroundColor: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)' }}
            exit={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Calendar & Diary List */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-50 md:z-auto
        w-[300px] md:w-[340px] flex-shrink-0 border-r border-foreground/5 flex flex-col overflow-hidden
        bg-bridge-dark md:bg-transparent
        transition-transform duration-300 ease-in-out
        ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          {/* Title */}
          <div className="flex items-center gap-2.5 mb-4">
            <BookOpen size={18} className="text-bridge-accent" />
            <h2 className="text-base font-bold text-foreground">{t('personal.diary.title')}</h2>
            <button
              onClick={() => setShowMobileSidebar(false)}
              className="md:hidden ml-auto p-1.5 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">
              {format(calendarMonth, t('personal.diary.yearMonthFormat'))}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleCalendarToday}
                className="px-2 py-0.5 text-[10px] font-semibold rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                {t('personal.diary.today')}
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Mini Calendar Grid */}
        <div className="px-4 pb-4 flex-shrink-0">
          <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-3">
            {/* Weekday header */}
            <div className="grid grid-cols-7 mb-1">
              {weekDays.map((day, i) => (
                <div
                  key={day}
                  className={`text-center text-[10px] font-bold uppercase tracking-widest py-1 ${
                    i === 0 ? 'text-red-400/60' : i === 6 ? 'text-blue-400/60' : 'text-slate-500'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Date grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const diaryEntry = diaryDateMap.get(dateKey);
                const isCurrentMonth = isSameMonth(day, calendarMonth);
                const isSelected = dateKey === currentDate;
                const isTodayDate = isTodayFn(day);
                const dayOfWeek = day.getDay();
                const isHoliday = isCurrentMonth && holidayMap.has(dateKey);

                return (
                  <button
                    key={dateKey}
                    onClick={() => handleCalendarDateClick(day)}
                    className={`
                      relative flex flex-col items-center justify-center py-2 rounded-lg transition-all min-h-[44px]
                      ${isSelected
                        ? 'bg-bridge-accent/20 border border-bridge-accent/50'
                        : 'border border-transparent hover:bg-foreground/5'
                      }
                      ${!isCurrentMonth ? 'opacity-30' : ''}
                    `}
                  >
                    <span
                      className={`
                        text-xs font-medium leading-none
                        ${isTodayDate
                          ? 'bg-bridge-accent text-white rounded-full w-6 h-6 flex items-center justify-center text-[11px]'
                          : isSelected
                            ? 'text-foreground'
                            : isHoliday || dayOfWeek === 0
                              ? 'text-red-400/80'
                              : dayOfWeek === 6
                                ? 'text-blue-400/80'
                                : 'text-muted-foreground'
                        }
                      `}
                    >
                      {format(day, 'd')}
                    </span>
                    {diaryEntry && (
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full ${
                        diaryEntry.status === 'COMPLETED' ? 'bg-bridge-secondary' : 'bg-amber-400'
                      }`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Diary List for Current Month */}
        <div className="flex-1 overflow-auto px-4 pb-4 min-h-0 custom-scrollbar">
          <div className="flex items-center gap-2 mb-2">
            <BookHeart size={14} className="text-bridge-secondary" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {t('personal.diary.monthDiaries')}
            </span>
            {diaryList.length > 0 && (
              <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded">
                {diaryList.length}
              </span>
            )}
          </div>
          {diaryList.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-xs">{t('personal.diary.noMonthDiaries')}</p>
              <p className="text-slate-600 text-[10px] mt-1">{t('personal.diary.startToday')}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {diaryList.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { setCurrentDate(d.diary_date); setShowMobileSidebar(false); }}
                  className={`w-full text-left p-2.5 rounded-xl transition-all group ${
                    d.diary_date === currentDate
                      ? 'bg-bridge-accent/15 border border-bridge-accent/30'
                      : 'bg-white/[0.03] border border-foreground/5 hover:bg-white/[0.06] hover:border-foreground/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
                      d.status === 'COMPLETED' ? 'bg-bridge-secondary' : 'bg-amber-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-foreground truncate group-hover:text-bridge-accent transition-colors">
                          {d.title || format(new Date(d.diary_date + 'T00:00:00'), t('personal.diary.monthDayFormat'))}
                        </span>
                        <span className="text-sm flex-shrink-0 ml-2">
                          {d.mood ? MOODS.find((m) => m.value === d.mood)?.emoji || '' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          d.status === 'COMPLETED'
                            ? 'text-bridge-secondary/80 bg-bridge-secondary/10'
                            : 'text-amber-400/80 bg-amber-400/10'
                        }`}>
                          {d.status === 'COMPLETED' ? t('personal.diary.completed') : t('personal.diary.writing')}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {format(new Date(d.diary_date + 'T00:00:00'), t('personal.diary.dateShortFormat'))}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="w-4 h-4 border-2 border-bridge-accent/30 border-t-bridge-accent rounded-full animate-spin" />
              {t('personal.diary.loading')}
            </div>
          </div>
        ) : !diary ? (
          /* No diary for this date - Warm Welcome */
          <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="flex flex-col items-center gap-4 md:gap-5 max-w-md text-center"
            >
              {/* Greeting icon */}
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="relative"
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-bridge-accent/20 via-purple-500/15 to-bridge-secondary/20 border border-foreground/10 flex items-center justify-center">
                  <Pencil size={32} className="text-bridge-accent" />
                </div>
                <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-bridge-secondary/20 border border-bridge-secondary/30 flex items-center justify-center">
                  <Sparkles size={13} className="text-bridge-secondary" />
                </div>
              </motion.div>

              {/* Time-aware greeting */}
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {isToday ? (
                    <>
                      {new Date().getHours() < 12
                        ? t('personal.diary.morningGreeting')
                        : new Date().getHours() < 18
                          ? t('personal.diary.afternoonGreeting')
                          : t('personal.diary.eveningGreeting')}
                    </>
                  ) : (
                    t('personal.diary.dateRecord', { date: format(new Date(currentDate + 'T00:00:00'), t('personal.diary.monthDayFormat')) })
                  )}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {isToday
                    ? t('personal.diary.todayPrompt')
                    : t('personal.diary.pastPrompt')}
                </p>
              </div>

              {/* CTA Button */}
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleStartDiary}
                className="flex items-center gap-2.5 px-8 py-3.5 bg-gradient-to-r from-bridge-accent to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-bridge-accent/25 transition-shadow hover:shadow-bridge-accent/40"
              >
                <Sparkles size={18} />
                {isToday ? t('personal.diary.startDiary') : t('personal.diary.writeDiary')}
              </motion.button>

              {/* Subtle hint */}
              <p className="text-[11px] text-slate-600 mt-1">
                {t('personal.diary.canContinue')}
              </p>
            </motion.div>
          </div>
        ) : diary.status === 'COMPLETED' ? (
          /* Completed Diary View */
          <div className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4 md:mb-6 gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg md:text-2xl font-bold font-jakarta text-foreground mb-1 truncate">
                    {diary.title || t('personal.diary.diaryOf', { date: formatDate(diary.diary_date) })}
                  </h2>
                  {diary.mood && (
                    <span className="text-lg">
                      {MOODS.find((m) => m.value === diary.mood)?.emoji || diary.mood}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReopen}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-400 border border-foreground/10 rounded-xl hover:text-foreground hover:bg-foreground/5 transition-all"
                  >
                    <RotateCcw size={14} />
                    {t('personal.diary.continueWriting')}
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(true)}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-400 border border-foreground/10 rounded-xl hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/5 transition-all"
                  >
                    <RefreshCw size={14} />
                    {t('personal.diary.restartConversation')}
                  </button>
                </div>
              </div>

              <div className="bg-bridge-obsidian/60 rounded-2xl border border-foreground/5 p-6">
                <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {diary.content || t('personal.diary.noContent')}
                </div>
              </div>

              {/* Conversation History */}
              {diary.messages && diary.messages.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                    {t('personal.diary.conversationHistory')}
                  </h3>
                  <div className="space-y-3">
                    {diary.messages.map((msg) => (
                      <ChatBubble key={msg.id} message={msg} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : isCompleting ? (
          /* AI Generating Diary Content */
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-bridge-accent/20 via-purple-500/15 to-bridge-secondary/20 border border-foreground/10 flex items-center justify-center">
                  <Sparkles size={28} className="text-bridge-accent animate-pulse" />
                </div>
                <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-bridge-accent/30 border-t-bridge-accent animate-spin" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-foreground mb-1">{t('personal.diary.generating')}</h3>
                <p className="text-slate-400 text-sm">{t('personal.diary.generatingDesc')}</p>
              </div>
            </motion.div>
          </div>
        ) : (
          /* Chatting Mode */
          <>
            {/* Chat Messages */}
            <div className="flex-1 overflow-auto p-3 md:p-6 space-y-3 md:space-y-4 custom-scrollbar">
              <div className="max-w-2xl mx-auto space-y-3 md:space-y-4">
                {diary.messages?.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}
                {isSending && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={14} className="text-bridge-accent" />
                    </div>
                    <div className="bg-bridge-obsidian/60 border border-foreground/5 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex items-center gap-2">
                        {voiceState === 'processing' && (
                          <span className="text-xs text-slate-400 mr-1">{t('personal.diary.voiceListening')}</span>
                        )}
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Complete Button + Mood Selector */}
            {diary.messages && diary.messages.filter((m) => m.role === 'USER').length >= 5 && (
              <div className="border-t border-white/[0.06] px-3 md:px-6 py-2 md:py-3">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-widest text-slate-500 w-full md:w-auto">
                      {t('personal.diary.todaysMood')}
                    </span>
                    {MOODS.map((mood) => (
                      <button
                        key={mood.value}
                        onClick={() => handleCompleteDiary(mood.value)}
                        disabled={isCompleting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground/5 border border-foreground/10 rounded-full text-xs hover:bg-foreground/10 hover:border-bridge-border disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title={mood.label}
                      >
                        <span>{mood.emoji}</span>
                        <span className="text-muted-foreground">{mood.label}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => handleCompleteDiary()}
                      disabled={isCompleting}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-bridge-secondary/20 border border-bridge-secondary/30 text-bridge-secondary rounded-full text-xs font-bold hover:bg-bridge-secondary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <Check size={14} />
                      {t('personal.diary.completeDiary')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Input + Voice */}
            <div className="border-t border-white/[0.06] px-3 md:px-6 py-3 md:py-4">
              <div className="max-w-2xl mx-auto">
                {/* Recording indicator */}
                <AnimatePresence>
                  {voiceState === 'recording' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 flex items-center justify-center gap-3"
                    >
                      <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-sm font-bold text-red-400">{formatRecordTime(recordingDuration)}</span>
                        <span className="text-xs text-red-400/60">{t('personal.diary.voiceRecording')}</span>
                      </div>
                    </motion.div>
                  )}
                  {voiceState === 'ai-speaking' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 flex items-center justify-center gap-3"
                    >
                      <div className="flex items-center gap-2 px-4 py-2 bg-bridge-secondary/10 border border-bridge-secondary/20 rounded-xl">
                        <Volume2 size={16} className="text-bridge-secondary animate-pulse" />
                        <span className="text-sm text-bridge-secondary">{t('personal.diary.voiceAiSpeaking')}</span>
                        <button
                          onClick={stopAiSpeaking}
                          className="ml-2 p-1 bg-foreground/10 rounded-lg hover:bg-white/20 transition-colors"
                        >
                          <Square size={12} className="text-white" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-2 md:gap-3 items-center">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={t('personal.diary.inputPlaceholder')}
                    className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                    disabled={isSending || voiceState !== 'idle'}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim() || isSending || voiceState !== 'idle'}
                    className="p-3 bg-bridge-accent text-white rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <Send size={18} />
                  </button>

                  {/* Push-to-Talk Button */}
                  {hasMicSupport && (
                    <button
                      onMouseDown={() => { if (voiceStateRef.current === 'idle') startRecording(); }}
                      onMouseUp={() => { if (voiceStateRef.current === 'recording') stopRecording(); }}
                      onMouseLeave={() => { if (voiceStateRef.current === 'recording') stopRecording(); }}
                      onTouchStart={(e) => { e.preventDefault(); if (voiceStateRef.current === 'idle') startRecording(); }}
                      onTouchEnd={(e) => { e.preventDefault(); if (voiceStateRef.current === 'recording') stopRecording(); }}
                      onTouchCancel={(e) => { e.preventDefault(); if (voiceStateRef.current === 'recording') stopRecording(); }}
                      onClick={() => { if (voiceStateRef.current === 'ai-speaking') stopAiSpeaking(); }}
                      disabled={isSending && voiceState === 'idle'}
                      className={`
                        relative p-3 rounded-xl transition-all select-none touch-none
                        ${voiceState === 'recording'
                          ? 'bg-red-500 text-white scale-110 shadow-lg shadow-red-500/30'
                          : voiceState === 'processing'
                            ? 'bg-amber-500/20 text-amber-400 cursor-wait'
                            : voiceState === 'ai-speaking'
                              ? 'bg-bridge-secondary/20 text-bridge-secondary'
                              : 'bg-foreground/5 border border-foreground/10 text-slate-400 hover:text-foreground hover:bg-foreground/10 disabled:opacity-30 disabled:cursor-not-allowed'
                        }
                      `}
                      title={
                        voiceState === 'recording' ? t('personal.diary.voiceRelease') :
                        voiceState === 'ai-speaking' ? t('personal.diary.voiceStopAi') :
                        t('personal.diary.voiceHold')
                      }
                    >
                      {voiceState === 'recording' ? (
                        <Mic size={18} className="animate-pulse" />
                      ) : voiceState === 'processing' ? (
                        <div className="w-[18px] h-[18px] border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                      ) : voiceState === 'ai-speaking' ? (
                        <Volume2 size={18} className="animate-pulse" />
                      ) : (
                        <Mic size={18} />
                      )}

                      {/* Recording pulse ring */}
                      {voiceState === 'recording' && (
                        <span className="absolute inset-0 rounded-xl border-2 border-red-500 animate-ping opacity-30" />
                      )}
                    </button>
                  )}
                </div>

                {/* Voice hint */}
                {hasMicSupport && voiceState === 'idle' && !isSending && (
                  <p className="text-[10px] text-slate-600 text-center mt-2">
                    {t('personal.diary.voiceHint')}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Reset Confirm Modal */}
      <MotionModal open={showResetConfirm} onClose={() => setShowResetConfirm(false)} className="sm:max-w-sm p-6">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <AlertTriangle size={22} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-1">{t('personal.diary.resetTitle')}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-line">
                    {t('personal.diary.resetWarning')}
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full mt-1">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-bold text-muted-foreground bg-foreground/5 border border-foreground/10 rounded-xl hover:bg-foreground/10 transition-all"
                  >
                    {t('personal.diary.cancel')}
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-500/80 rounded-xl hover:bg-red-500 transition-all"
                  >
                    {t('personal.diary.restart')}
                  </button>
                </div>
              </div>
      </MotionModal>

    </div>
  );
}

// ============================
// Audio Playback Button
// ============================
function AudioPlayButton({ src }: { src: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (isPlaying && audioElRef.current) {
      audioElRef.current.pause();
      setIsPlaying(false);
      return;
    }

    const audio = new Audio(src);
    audioElRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
    audio.play().catch(() => setIsPlaying(false));
    setIsPlaying(true);
  };

  useEffect(() => {
    return () => {
      if (audioElRef.current) {
        audioElRef.current.pause();
      }
    };
  }, []);

  return (
    <button
      onClick={togglePlay}
      className="flex items-center gap-1.5 mt-1.5 px-2 py-1 bg-foreground/5 rounded-lg text-[11px] text-slate-400 hover:text-foreground hover:bg-foreground/10 transition-all"
    >
      {isPlaying ? <Pause size={11} /> : <Play size={11} />}
      <Volume2 size={11} />
    </button>
  );
}

// ============================
// Chat Bubble
// ============================
function ChatBubble({ message }: { message: DiaryMessage }) {
  const isAI = message.role === 'AI';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isAI ? '' : 'flex-row-reverse'}`}
    >
      {isAI && (
        <div className="w-8 h-8 rounded-full bg-bridge-accent/20 border border-bridge-accent/30 flex items-center justify-center flex-shrink-0">
          <Sparkles size={14} className="text-bridge-accent" />
        </div>
      )}
      <div
        className={`max-w-[90%] md:max-w-[80%] px-3 md:px-4 py-2.5 md:py-3 rounded-2xl text-sm leading-relaxed ${
          isAI
            ? 'bg-bridge-obsidian/60 border border-foreground/5 rounded-tl-sm text-muted-foreground'
            : 'bg-bridge-accent/15 border border-bridge-accent/20 rounded-tr-sm text-foreground'
        }`}
      >
        {message.content}
        {/* Show audio play button if message has audio */}
        {message.audio_url && <AudioPlayButton src={message.audio_url} />}
      </div>
    </motion.div>
  );
}
