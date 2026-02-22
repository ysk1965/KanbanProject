import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check, User, Users, ArrowLeft, CalendarDays, BookHeart, Sparkles, Columns3, MessageSquare, BarChart3 } from 'lucide-react';
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
  hasPersonalSpace: boolean;
  onActivatePersonalSpace: () => void;
}

export function CreateBoardModal({ isOpen, onClose, onCreate, hasPersonalSpace, onActivatePersonalSpace }: CreateBoardModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(GRADIENTS[0]);
  const [step, setStep] = useState<'select' | 'form'>('select');

  // hasPersonalSpace가 true면 바로 form으로
  useEffect(() => {
    if (isOpen) {
      setStep(hasPersonalSpace ? 'form' : 'select');
    }
  }, [isOpen, hasPersonalSpace]);

  const handleClose = () => {
    setName('');
    setDescription('');
    setSelectedColor(GRADIENTS[0]);
    setStep(hasPersonalSpace ? 'form' : 'select');
    onClose();
  };

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), description.trim() || undefined, selectedColor);
      handleClose();
    }
  };

  const handleActivatePersonalSpace = () => {
    handleClose();
    onActivatePersonalSpace();
  };

  return (
    <MotionModal open={isOpen} onClose={handleClose} className="sm:max-w-lg p-0 overflow-hidden">

        {step === 'select' ? (
          /* Step 1: 개인/팀 선택 */
          <div className="p-6 sm:p-10 space-y-6 sm:space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">{t('createBoard.selectType', '어떤 보드를 만들까요?')}</h2>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {/* 나만을 위한 보드 (My Space) */}
              <button
                onClick={handleActivatePersonalSpace}
                className="group relative overflow-hidden rounded-2xl border border-bridge-border hover:border-bridge-secondary/50 transition-all text-left"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-bridge-secondary/10 via-purple-500/5 to-bridge-accent/10 opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="relative p-6 sm:p-9 flex flex-row sm:flex-col items-center sm:text-center gap-4 sm:gap-5">
                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-bridge-secondary/20 border border-bridge-secondary/30 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <User size={28} className="text-bridge-secondary sm:hidden" />
                    <User size={36} className="text-bridge-secondary hidden sm:block" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-foreground mb-1 sm:mb-2 group-hover:text-bridge-secondary transition-colors">
                      {t('createBoard.personalTitle', '나만을 위한 보드')}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      {t('createBoard.personalDesc', '개인 일정, 습관 트래커, AI 다이어리를 한곳에서 관리하세요')}
                    </p>
                    <div className="flex items-center sm:justify-center gap-3 mt-3 sm:mt-4 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <CalendarDays size={14} /> {t('createBoard.personalFeature1', '일정')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <BookHeart size={14} /> {t('createBoard.personalFeature2', 'AI 다이어리')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Sparkles size={14} /> {t('createBoard.personalFeature3', '습관')}
                      </span>
                    </div>
                  </div>
                </div>
              </button>

              {/* 팀과 협업하는 보드 */}
              <button
                onClick={() => setStep('form')}
                className="group relative overflow-hidden rounded-2xl border border-bridge-border hover:border-bridge-accent/50 transition-all text-left"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-bridge-accent/10 via-indigo-500/5 to-purple-500/10 opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="relative p-6 sm:p-9 flex flex-row sm:flex-col items-center sm:text-center gap-4 sm:gap-5">
                  <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-bridge-accent/20 border border-bridge-accent/30 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    <Users size={28} className="text-bridge-accent sm:hidden" />
                    <Users size={36} className="text-bridge-accent hidden sm:block" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-foreground mb-1 sm:mb-2 group-hover:text-bridge-accent transition-colors">
                      {t('createBoard.teamTitle', '팀과 협업하는 보드')}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                      {t('createBoard.teamDesc', '팀원을 초대하고 칸반 보드로 프로젝트를 함께 관리하세요')}
                    </p>
                    <div className="flex items-center sm:justify-center gap-3 mt-3 sm:mt-4 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Columns3 size={14} /> {t('createBoard.teamFeature1', '칸반')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <MessageSquare size={14} /> {t('createBoard.teamFeature2', '협업')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <BarChart3 size={14} /> {t('createBoard.teamFeature3', '통계')}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: 팀 보드 생성 폼 (기존) */
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
                <div className="flex items-center gap-2">
                  {!hasPersonalSpace && (
                    <button
                      onClick={() => setStep('select')}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <ArrowLeft size={18} />
                    </button>
                  )}
                  <h2 className="text-lg font-bold text-foreground">{t('createBoard.title', '새 보드 만들기')}</h2>
                </div>
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
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    {t('dashboard.backgroundColor')}
                  </label>
                  <div className="grid grid-cols-6 gap-3">
                    {GRADIENTS.map((color, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedColor(color)}
                        className="h-10 rounded-lg relative overflow-hidden transition-transform active:scale-90 hover:scale-105"
                        style={{ background: color }}
                      >
                        {selectedColor === color && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Check size={16} className="text-white" />
                          </div>
                        )}
                      </button>
                    ))}
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
        )}
    </MotionModal>
  );
}
