import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2 } from 'lucide-react';
import { MotionModal } from './ui/MotionModal';
import { ColorPickerPopover } from './ui/ColorPickerPopover';

interface AddBlockModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, color: string) => void;
  isEdit?: boolean;
  initialName?: string;
  initialColor?: string;
}

const COLORS = [
  { name: 'Red', value: '#EF4444' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Green', value: '#10B981' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Gray', value: '#6B7280' },
];

const BLOCK_COLOR_VALUES = COLORS.map(c => c.value);

export function AddBlockModal({
  open,
  onClose,
  onAdd,
  isEdit = false,
  initialName = '',
  initialColor = '#3B82F6',
}: AddBlockModalProps) {
  const { t } = useTranslation();
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

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md bg-bridge-dark p-0 overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-foreground/10 bg-white/[0.02]">
          <h2 className="text-lg font-bold text-foreground">
            {isEdit ? t('block.editTitle') : t('block.addTitle')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="px-6 py-6 space-y-6">
          <div className="space-y-2">
            <label className="kanban-label block">{t('block.nameLabel')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: In Progress"
              className="w-full bg-bridge-obsidian border border-foreground/10 rounded-xl p-3 text-foreground placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 transition-all text-sm"
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
            <div className="flex items-center gap-3">
              <label className="kanban-label">{t('block.colorLabel')}</label>
              <ColorPickerPopover
                colors={BLOCK_COLOR_VALUES}
                selectedColor={selectedColor}
                onColorChange={setSelectedColor}
              />
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-5 border-t border-foreground/10 bg-white/[0.02] flex justify-end items-center gap-4">
          <button
            onClick={onClose}
            className="text-[11px] font-bold text-slate-400 hover:text-foreground transition-all tracking-wider"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-6 py-2.5 bg-white text-black font-black text-[11px] rounded-lg tracking-widest hover:bg-zinc-200 transition-all flex items-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEdit ? t('common.edit') : t('common.add')}
            <CheckCircle2 size={14} className="text-indigo-600" />
          </button>
        </div>
    </MotionModal>
  );
}
