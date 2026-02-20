import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle, Trash2, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { Board } from '../../types';
import { MotionModal } from '../ui/MotionModal';

const GRADIENTS = [
  'linear-gradient(135deg, #6366F1 0%, #a855f7 100%)',
  'linear-gradient(135deg, #2DD4BF 0%, #0891B2 100%)',
  'linear-gradient(135deg, #F43F5E 0%, #FB923C 100%)',
  'linear-gradient(135deg, #10B981 0%, #3B82F6 100%)',
  'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
  'linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%)',
];

// boardId를 기반으로 그라데이션 선택 (BoardCard와 동일한 로직)
function getGradient(boardId: string): string {
  let hash = 0;
  for (let i = 0; i < boardId.length; i++) {
    hash = boardId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

interface EditBoardModalProps {
  isOpen: boolean;
  board: Board | null;
  onClose: () => void;
  onUpdate: (boardId: string, name: string, description?: string, backgroundGradient?: string) => void;
  onDelete?: (boardId: string) => void;
}

export function EditBoardModal({ isOpen, board, onClose, onUpdate, onDelete }: EditBoardModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // 보드 데이터로 초기화
  useEffect(() => {
    if (board) {
      setName(board.name);
      setDescription(board.description || '');
      setSelectedColor(board.background_gradient || getGradient(board.id));
    }
  }, [board]);

  const handleClose = () => {
    setName('');
    setDescription('');
    setSelectedColor('');
    setShowDeleteConfirm(false);
    setDeleteConfirmText('');
    onClose();
  };

  const handleUpdate = () => {
    if (name.trim() && board) {
      onUpdate(board.id, name.trim(), description.trim() || undefined, selectedColor || undefined);
      handleClose();
    }
  };

  const handleDelete = () => {
    if (board && onDelete && deleteConfirmText === board.name) {
      onDelete(board.id);
      handleClose();
    }
  };

  if (!board) return null;

  const isOwner = board.role === 'OWNER';
  const isPremium = board.subscription?.status === 'ACTIVE';
  const canDelete = isOwner && onDelete;

  const currentGradient = selectedColor || getGradient(board.id);

  return (
    <MotionModal open={isOpen} onClose={handleClose} className="sm:max-w-lg p-0 overflow-hidden">
        {/* Preview Section */}
        <div
          className="h-32 w-full flex items-end p-6 relative overflow-hidden"
          style={{ background: currentGradient }}
        >
          <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
          <h3 className="text-xl font-bold text-white drop-shadow-md truncate relative z-10">
            {name || board.name}
          </h3>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-foreground">{t('board.editBoard')}</h2>
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
                placeholder={t('board.boardNamePlaceholder')}
                className="w-full bg-foreground/5 border border-bridge-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-bridge-accent focus:ring-2 focus:ring-bridge-accent/20 transition-all"
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter' && !e.shiftKey) {
                    handleUpdate();
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
                rows={3}
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
                    type="button"
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
              className="flex-1 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors border border-bridge-border rounded-xl hover:bg-foreground/5"
            >
              {t('common.cancel')}
            </button>
            <button
              disabled={!name.trim()}
              onClick={handleUpdate}
              className="flex-[2] py-3 bg-gradient-to-r from-bridge-accent to-purple-500 text-sm font-bold rounded-xl shadow-lg shadow-bridge-accent/20 disabled:opacity-50 disabled:grayscale hover:shadow-bridge-accent/40 transition-all"
            >
              {t('common.save')}
            </button>
          </div>

          {/* Delete Section - Owner Only */}
          {canDelete && (
            <div className="mt-6 pt-6 border-t border-bridge-border">
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors"
                >
                  <Trash2 size={16} />
                  {t('board.deleteBtn')}
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* Warning Box */}
                  <div className={`p-4 rounded-xl border ${isPremium ? 'bg-rose-500/10 border-rose-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={20} className={isPremium ? 'text-rose-500 shrink-0 mt-0.5' : 'text-amber-500 shrink-0 mt-0.5'} />
                      <div className="space-y-2">
                        <p className={`text-sm font-bold ${isPremium ? 'text-rose-400' : 'text-amber-400'}`}>
                          {isPremium ? `⚠️ ${t('board.premiumWarning')}` : `⚠️ ${t('board.deleteWarning')}`}
                        </p>
                        <ul className="text-xs text-slate-400 space-y-1">
                          <li>• {t('board.deleteDetail1')}</li>
                          <li>• {t('board.deleteDetail2')}</li>
                          <li>• {t('board.deleteDetail3')}</li>
                          {isPremium && (
                            <>
                              <li className="text-rose-400 font-bold">• {t('board.deleteDetail4')}</li>
                              <li className="text-rose-400 font-bold">• {t('board.deleteDetail5')}</li>
                            </>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Confirm Input */}
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400">
                      {t('board.deleteConfirmLabel', { name: board.name })}
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={board.name}
                      className="w-full bg-foreground/5 border border-rose-500/30 rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all"
                    />
                  </div>

                  {/* Delete Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText('');
                      }}
                      className="flex-1 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors border border-bridge-border rounded-xl hover:bg-foreground/5"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      disabled={deleteConfirmText !== board.name}
                      onClick={handleDelete}
                      className="flex-1 py-3 bg-rose-600 text-sm font-bold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed hover:bg-rose-500 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      {t('board.permanentDelete')}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
    </MotionModal>
  );
}
