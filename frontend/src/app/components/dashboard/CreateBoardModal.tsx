import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { GradientPickerPopover } from '../ui/GradientPickerPopover';
import { MotionModal } from '../ui/MotionModal';

const GRADIENTS = [
  'linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)',
  'linear-gradient(135deg, #F43F5E 0%, #FB923C 100%)',
  'linear-gradient(135deg, #F97316 0%, #FBBF24 100%)',
  'linear-gradient(135deg, #EAB308 0%, #84CC16 100%)',
  'linear-gradient(135deg, #059669 0%, #34D399 100%)',
  'linear-gradient(135deg, #10B981 0%, #2DD4BF 100%)',
  'linear-gradient(135deg, #2DD4BF 0%, #0891B2 100%)',
  'linear-gradient(135deg, #0EA5E9 0%, #3B82F6 100%)',
  'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
  'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
  'linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%)',
  'linear-gradient(135deg, #D946EF 0%, #EC4899 100%)',
];

interface CreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description?: string, backgroundGradient?: string) => void;
}

export function CreateBoardModal({ isOpen, onClose, onCreate }: CreateBoardModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(GRADIENTS[0]);

  const handleClose = () => {
    setName('');
    setDescription('');
    setSelectedColor(GRADIENTS[0]);
    onClose();
  };

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), description.trim() || undefined, selectedColor);
      handleClose();
    }
  };

  return (
    <MotionModal open={isOpen} onClose={handleClose} className="sm:max-w-lg p-0 overflow-hidden">
          <>
            {/* Preview Section */}
            <div
              className="h-32 w-full flex items-end p-6 relative overflow-hidden"
              style={{ background: selectedColor }}
            >
              <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
              <h3 className="text-xl font-bold text-white drop-shadow-md truncate relative z-10">
                {name || '새로운 보드'}
              </h3>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{t('createBoard.title', '새 보드 만들기')}</h2>
                <button
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Board Name */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    {t('dashboard.boardName')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="보드 이름을 입력하세요"
                    className="w-full bg-foreground/5 border border-bridge-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-bridge-accent focus:ring-2 focus:ring-bridge-accent/20 transition-all"
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter' && !e.shiftKey) {
                        handleCreate();
                      }
                    }}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    {t('dashboard.description')}
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('board.boardDescPlaceholder')}
                    className="w-full bg-foreground/5 border border-bridge-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-bridge-accent focus:ring-2 focus:ring-bridge-accent/20 transition-all resize-none"
                  />
                </div>

                {/* Background Color */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {t('dashboard.backgroundColor')}
                    </label>
                    <GradientPickerPopover
                      gradients={GRADIENTS}
                      selectedGradient={selectedColor}
                      onGradientChange={setSelectedColor}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleClose}
                  className="flex-1 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('dashboard.cancel')}
                </button>
                <button
                  disabled={!name.trim()}
                  onClick={handleCreate}
                  className="flex-[2] py-3 bg-gradient-to-r from-bridge-accent to-purple-500 text-sm font-bold rounded-xl shadow-lg shadow-bridge-accent/20 disabled:opacity-50 disabled:grayscale hover:shadow-bridge-accent/40 transition-all"
                >
                  {t('dashboard.createBoard')}
                </button>
              </div>
            </div>
          </>
    </MotionModal>
  );
}
