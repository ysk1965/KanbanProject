import { useState } from 'react';
import { X, CheckCircle2, ChevronDown, Calendar } from 'lucide-react';
import { Priority } from '../types';

interface AddFeatureModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: {
    title: string;
    description?: string;
    priority?: Priority;
    dueDate?: string;
  }) => void;
}

export function AddFeatureModal({ open, onClose, onAdd }: AddFeatureModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = () => {
    if (title.trim()) {
      onAdd({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
      });
      setTitle('');
      setDescription('');
      setPriority('medium');
      setDueDate('');
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-kanban-bg text-zinc-300 rounded-2xl border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/15 bg-white/[0.03]">
          <h2 className="text-lg font-bold text-foreground">새 Feature 추가</h2>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="px-6 py-6 space-y-6">
          <div className="space-y-2">
            <label className="kanban-label block">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 로그인 기능 구현"
              className="w-full bg-kanban-input border border-white/15 rounded-xl p-3 text-foreground placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 transition-all text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="kanban-label block">설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Feature에 대한 자세한 설명..."
              rows={3}
              className="w-full bg-kanban-input border border-white/15 rounded-xl p-3 text-foreground placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 transition-all resize-none text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="kanban-label block">우선순위</label>
              <div className="relative">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full bg-kanban-card-hover border border-white/15 rounded-lg px-4 py-2.5 appearance-none focus:outline-none focus:border-indigo-500/50 text-xs font-bold text-zinc-200"
                >
                  <option value="high" className="bg-kanban-bg">높음</option>
                  <option value="medium" className="bg-kanban-bg">보통</option>
                  <option value="low" className="bg-kanban-bg">낮음</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="kanban-label block">마감일</label>
              <div className="relative">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-kanban-card-hover border border-white/15 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/50 text-xs font-bold text-zinc-200"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
              </div>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-5 border-t border-white/15 bg-white/[0.03] flex justify-end items-center gap-4">
          <button
            onClick={onClose}
            className="text-[11px] font-bold text-zinc-400 hover:text-foreground transition-all tracking-wider"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-6 py-2.5 bg-white text-black font-black text-[11px] rounded-lg tracking-widest hover:bg-zinc-200 transition-all flex items-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            추가
            <CheckCircle2 size={14} className="text-indigo-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
