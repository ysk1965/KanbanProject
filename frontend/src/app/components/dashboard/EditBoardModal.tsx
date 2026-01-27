import { useState, useEffect } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Board } from '../../types';

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
  onUpdate: (boardId: string, name: string, description?: string) => void;
  onDelete?: (boardId: string) => void;
}

export function EditBoardModal({ isOpen, board, onClose, onUpdate, onDelete }: EditBoardModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // 보드 데이터로 초기화
  useEffect(() => {
    if (board) {
      setName(board.name);
      setDescription(board.description || '');
    }
  }, [board]);

  const handleClose = () => {
    setName('');
    setDescription('');
    setShowDeleteConfirm(false);
    setDeleteConfirmText('');
    onClose();
  };

  const handleUpdate = () => {
    if (name.trim() && board) {
      onUpdate(board.id, name.trim(), description.trim() || undefined);
      handleClose();
    }
  };

  const handleDelete = () => {
    if (board && onDelete && deleteConfirmText === board.name) {
      onDelete(board.id);
      handleClose();
    }
  };

  if (!isOpen || !board) return null;

  const isOwner = board.role === 'OWNER';
  const isPremium = board.subscription?.status === 'ACTIVE';
  const canDelete = isOwner && onDelete;

  const gradient = getGradient(board.id);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-lg bg-bridge-obsidian rounded-2xl overflow-hidden shadow-2xl border border-white/10"
        >
          {/* Preview Section */}
          <div
            className="h-32 w-full flex items-end p-6 relative overflow-hidden"
            style={{ background: gradient }}
          >
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            <h3 className="text-xl font-bold text-white drop-shadow-md truncate relative z-10">
              {name || board.name}
            </h3>
          </div>

          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">보드 수정</h2>
              <button
                onClick={handleClose}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Board Name */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Board Name <span className="text-rose-500">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="보드 이름을 입력하세요"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-bridge-accent focus:ring-2 focus:ring-bridge-accent/20 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      handleUpdate();
                    }
                  }}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="보드에 대한 간단한 설명 (선택)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-bridge-accent focus:ring-2 focus:ring-bridge-accent/20 transition-all resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleClose}
                className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors border border-white/10 rounded-xl hover:bg-white/5"
              >
                취소
              </button>
              <button
                disabled={!name.trim()}
                onClick={handleUpdate}
                className="flex-[2] py-3 bg-gradient-to-r from-bridge-accent to-purple-500 text-sm font-bold rounded-xl shadow-lg shadow-bridge-accent/20 disabled:opacity-50 disabled:grayscale hover:shadow-bridge-accent/40 transition-all"
              >
                저장
              </button>
            </div>

            {/* Delete Section - Owner Only */}
            {canDelete && (
              <div className="mt-6 pt-6 border-t border-white/5">
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors"
                  >
                    <Trash2 size={16} />
                    보드 삭제
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
                            {isPremium ? '⚠️ 프리미엄 구독 중인 보드입니다!' : '⚠️ 주의: 이 작업은 되돌릴 수 없습니다'}
                          </p>
                          <ul className="text-xs text-slate-400 space-y-1">
                            <li>• 모든 Feature와 Task가 영구 삭제됩니다</li>
                            <li>• 멤버 데이터 및 활동 기록이 삭제됩니다</li>
                            <li>• 스케줄 및 체크리스트가 삭제됩니다</li>
                            {isPremium && (
                              <>
                                <li className="text-rose-400 font-bold">• 구독이 즉시 취소되며 환불되지 않습니다</li>
                                <li className="text-rose-400 font-bold">• 결제 정보 및 구독 혜택이 사라집니다</li>
                              </>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Confirm Input */}
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400">
                        삭제하려면 보드 이름 <span className="font-bold text-white">"{board.name}"</span>을 입력하세요
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder={board.name}
                        className="w-full bg-white/5 border border-rose-500/30 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all"
                      />
                    </div>

                    {/* Delete Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeleteConfirmText('');
                        }}
                        className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors border border-white/10 rounded-xl hover:bg-white/5"
                      >
                        취소
                      </button>
                      <button
                        disabled={deleteConfirmText !== board.name}
                        onClick={handleDelete}
                        className="flex-1 py-3 bg-rose-600 text-sm font-bold rounded-xl disabled:opacity-30 disabled:cursor-not-allowed hover:bg-rose-500 transition-all flex items-center justify-center gap-2"
                      >
                        <Trash2 size={16} />
                        영구 삭제
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
