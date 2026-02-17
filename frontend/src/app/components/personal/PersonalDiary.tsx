import { useState, useEffect, useRef } from 'react';
import { Send, BookHeart, ChevronLeft, ChevronRight, Check, Sparkles, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { diaryService } from '../../utils/services';
import { formatDate } from '../../utils/dateUtils';
import type { DiaryDetail, DiaryMessage, DiarySimple } from '../../types';

const MOODS = [
  { emoji: '\u{1F60A}', label: 'Happy', value: 'happy' },
  { emoji: '\u{1F60C}', label: 'Calm', value: 'calm' },
  { emoji: '\u{1F914}', label: 'Thoughtful', value: 'thoughtful' },
  { emoji: '\u{1F614}', label: 'Tired', value: 'tired' },
  { emoji: '\u{1F622}', label: 'Sad', value: 'sad' },
  { emoji: '\u{1F620}', label: 'Frustrated', value: 'frustrated' },
  { emoji: '\u{1F929}', label: 'Excited', value: 'excited' },
  { emoji: '\u{1F971}', label: 'Bored', value: 'bored' },
];

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function PersonalDiary() {
  const [currentDate, setCurrentDate] = useState(toDateString(new Date()));
  const [diary, setDiary] = useState<DiaryDetail | null>(null);
  const [diaryList, setDiaryList] = useState<DiarySimple[]>([]);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const currentDateObj = new Date(currentDate + 'T00:00:00');
  const year = currentDateObj.getFullYear();
  const month = currentDateObj.getMonth() + 1;

  useEffect(() => {
    loadDiary();
    loadDiaryList();
  }, [currentDate]);

  useEffect(() => {
    scrollToBottom();
  }, [diary?.messages]);

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
      const data = await diaryService.getList(year, month);
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

  const handleCompleteDiary = async (mood?: string) => {
    if (!diary) return;
    try {
      const data = await diaryService.complete(diary.id, { mood });
      setDiary(data);
      loadDiaryList();
    } catch (error) {
      console.error('Failed to complete diary:', error);
    }
  };

  const handleReopen = async () => {
    if (!diary) return;
    try {
      const data = await diaryService.update(diary.id, {});
      // Reopen by changing status back to CHATTING
      setDiary({ ...data, status: 'CHATTING' });
      loadDiary();
    } catch (error) {
      console.error('Failed to reopen diary:', error);
    }
  };

  const navigateDate = (direction: number) => {
    const d = new Date(currentDate + 'T00:00:00');
    d.setDate(d.getDate() + direction);
    setCurrentDate(toDateString(d));
  };

  const today = toDateString(new Date());
  const isToday = currentDate === today;

  // Diary dates for the mini calendar indicators
  const diaryDates = new Set(diaryList.map((d) => d.diary_date));

  return (
    <div className="h-full flex">
      {/* Sidebar - Mini Calendar & Diary List */}
      <div className="w-64 border-r border-white/[0.06] bg-bridge-obsidian/40 flex flex-col">
        {/* Date Navigation */}
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => navigateDate(-1)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold text-white">{formatDate(currentDate)}</span>
            <button onClick={() => navigateDate(1)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          {!isToday && (
            <button
              onClick={() => setCurrentDate(today)}
              className="w-full py-1.5 text-xs font-bold text-bridge-secondary border border-bridge-secondary/30 rounded-lg hover:bg-bridge-secondary/10 transition-colors"
            >
              Go to Today
            </button>
          )}
        </div>

        {/* Diary List for Current Month */}
        <div className="flex-1 overflow-auto p-3 space-y-2 custom-scrollbar">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 px-1">
            {currentDateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          {diaryList.length === 0 && (
            <div className="text-center text-slate-500 text-xs py-8">No diary entries this month</div>
          )}
          {diaryList.map((d) => (
            <button
              key={d.id}
              onClick={() => setCurrentDate(d.diary_date)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${
                d.diary_date === currentDate
                  ? 'bg-bridge-accent/15 border border-bridge-accent/30'
                  : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{d.diary_date.slice(5)}</span>
                <span className="text-xs">
                  {d.mood ? MOODS.find((m) => m.value === d.mood)?.emoji || '' : ''}
                </span>
              </div>
              {d.title && (
                <div className="text-[11px] text-slate-400 mt-1 truncate">{d.title}</div>
              )}
              <div className={`text-[10px] mt-1 ${d.status === 'COMPLETED' ? 'text-bridge-secondary' : 'text-amber-400'}`}>
                {d.status === 'COMPLETED' ? 'Completed' : 'In progress...'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-slate-400 text-sm">Loading...</div>
          </div>
        ) : !diary ? (
          /* No diary for this date - Start Button */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-bridge-accent/20 to-purple-500/20 border border-bridge-accent/30 flex items-center justify-center">
              <BookHeart size={36} className="text-bridge-accent" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-white mb-2">
                {isToday ? "Start Today's Diary" : `Diary for ${formatDate(currentDate)}`}
              </h3>
              <p className="text-slate-400 text-sm max-w-sm">
                AI will ask you questions about your day. Through our conversation, your diary will be completed naturally.
              </p>
            </div>
            <button
              onClick={handleStartDiary}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-bridge-accent to-purple-500 text-white font-bold rounded-xl shadow-lg shadow-bridge-accent/20 hover:scale-105 active:scale-95 transition-all"
            >
              <Sparkles size={18} />
              Start Conversation
            </button>
          </div>
        ) : diary.status === 'COMPLETED' ? (
          /* Completed Diary View */
          <div className="flex-1 overflow-auto p-8 custom-scrollbar">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold font-serif text-white mb-1">
                    {diary.title || `${formatDate(diary.diary_date)}'s Diary`}
                  </h2>
                  {diary.mood && (
                    <span className="text-lg">
                      {MOODS.find((m) => m.value === diary.mood)?.emoji || diary.mood}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleReopen}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-400 border border-white/10 rounded-xl hover:text-white hover:bg-white/5 transition-all"
                >
                  <RotateCcw size={14} />
                  Continue
                </button>
              </div>

              <div className="bg-bridge-obsidian/60 rounded-2xl border border-white/5 p-6">
                <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {diary.content || 'No content yet.'}
                </div>
              </div>

              {/* Conversation History */}
              {diary.messages && diary.messages.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                    Conversation
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
        ) : (
          /* Chatting Mode */
          <>
            {/* Chat Messages */}
            <div className="flex-1 overflow-auto p-6 space-y-4 custom-scrollbar">
              <div className="max-w-2xl mx-auto space-y-4">
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
                    <div className="bg-bridge-obsidian/60 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Complete Button + Mood Selector */}
            {diary.messages && diary.messages.filter((m) => m.role === 'USER').length >= 2 && (
              <div className="border-t border-white/[0.06] px-6 py-3">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      Complete with mood:
                    </span>
                    {MOODS.map((mood) => (
                      <button
                        key={mood.value}
                        onClick={() => handleCompleteDiary(mood.value)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-xs hover:bg-white/10 hover:border-white/20 transition-all"
                        title={mood.label}
                      >
                        <span>{mood.emoji}</span>
                        <span className="text-slate-300">{mood.label}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => handleCompleteDiary()}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-bridge-secondary/20 border border-bridge-secondary/30 text-bridge-secondary rounded-full text-xs font-bold hover:bg-bridge-secondary/30 transition-all"
                    >
                      <Check size={14} />
                      Complete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-white/[0.06] px-6 py-4">
              <div className="max-w-2xl mx-auto flex gap-3">
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
                  placeholder="Tell me about your day..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  disabled={isSending}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || isSending}
                  className="p-3 bg-bridge-accent text-white rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </div>
  );
}

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
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isAI
            ? 'bg-bridge-obsidian/60 border border-white/5 rounded-tl-sm text-slate-300'
            : 'bg-bridge-accent/15 border border-bridge-accent/20 rounded-tr-sm text-white'
        }`}
      >
        {message.content}
      </div>
    </motion.div>
  );
}
