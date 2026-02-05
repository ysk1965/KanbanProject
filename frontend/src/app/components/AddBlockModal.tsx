import { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';

interface AddBlockModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, color: string) => void;
  isEdit?: boolean;
  initialName?: string;
  initialColor?: string;
}

const COLORS = [
  { name: '빨강', value: '#EF4444' },
  { name: '주황', value: '#F59E0B' },
  { name: '노랑', value: '#EAB308' },
  { name: '초록', value: '#10B981' },
  { name: '파랑', value: '#3B82F6' },
  { name: '보라', value: '#8B5CF6' },
  { name: '인디고', value: '#6366F1' },
  { name: '회색', value: '#6B7280' },
];

export function AddBlockModal({
  open,
  onClose,
  onAdd,
  isEdit = false,
  initialName = '',
  initialColor = '#3B82F6',
}: AddBlockModalProps) {
  const [name, setName] = useState(initialName);
  const [selectedColor, setSelectedColor] = useState(initialColor);

  const handleSubmit = () => {
    if (name.trim()) {
      onAdd(name.trim(), selectedColor);
      setName('');
      setSelectedColor('#3B82F6');
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
        className="w-full max-w-md bg-kanban-bg text-zinc-300 rounded-2xl border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/15 bg-white/[0.02]">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? '블록 수정' : '새 블록 추가'}
          </h2>
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
            <label className="kanban-label block">블록 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: In Progress"
              className="w-full bg-kanban-input border border-white/15 rounded-xl p-3 text-white placeholder-zinc-400 focus:outline-none focus:border-indigo-500/50 transition-all text-sm"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') {
                  handleSubmit();
                }
              }}
              autoFocus
            />
          </div>

          <div className="space-y-3">
            <label className="kanban-label block">색상</label>
            <div className="flex gap-2.5 flex-wrap">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`w-8 h-8 rounded-full transition-all duration-300 ${
                    selectedColor === color.value
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-kanban-bg scale-110'
                      : 'opacity-50 hover:opacity-100 hover:scale-110'
                  }`}
                  style={{
                    backgroundColor: color.value,
                    boxShadow: selectedColor === color.value ? `0 0 15px ${color.value}` : 'none',
                  }}
                  onClick={() => setSelectedColor(color.value)}
                  title={color.name}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-5 border-t border-white/15 bg-white/[0.02] flex justify-end items-center gap-4">
          <button
            onClick={onClose}
            className="text-[11px] font-bold text-zinc-400 hover:text-foreground transition-all tracking-wider"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-6 py-2.5 bg-white text-black font-black text-[11px] rounded-lg tracking-widest hover:bg-zinc-200 transition-all flex items-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEdit ? '수정' : '추가'}
            <CheckCircle2 size={14} className="text-indigo-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
