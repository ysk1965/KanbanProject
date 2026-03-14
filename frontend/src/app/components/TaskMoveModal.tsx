import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ArrowRight, Copy, Loader2 } from 'lucide-react';
import { MotionModal } from './ui/MotionModal';
import { boardService, boardAPI } from '../utils/api';
import type { Block } from '../types';

interface BoardItem {
  id: string;
  name: string;
  board_type?: string;
}

interface TaskMoveModalProps {
  open: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle: string;
  currentBoardId: string;
  mode: 'move' | 'copy';
  onSuccess?: () => void;
}

export function TaskMoveModal({
  open,
  onClose,
  taskId,
  taskTitle,
  currentBoardId,
  mode,
  onSuccess,
}: TaskMoveModalProps) {
  const { t } = useTranslation();
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string>('');
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load boards
  useEffect(() => {
    if (!open) return;
    (async () => {
      setIsLoadingBoards(true);
      try {
        const allBoards = await boardAPI.getBoards();
        // Filter out current board for move, keep all for copy
        const filtered = mode === 'move'
          ? allBoards.filter((b: BoardItem) => b.id !== currentBoardId)
          : allBoards;
        setBoards(filtered);
        if (filtered.length > 0) {
          setSelectedBoardId(filtered[0].id);
        }
      } catch (error) {
        console.error('Failed to load boards:', error);
      } finally {
        setIsLoadingBoards(false);
      }
    })();
  }, [open, currentBoardId, mode]);

  // Load blocks when board selected
  useEffect(() => {
    if (!selectedBoardId) return;
    (async () => {
      setIsLoadingBlocks(true);
      try {
        const fullData = await boardAPI.getBoardFull(selectedBoardId);
        const sortedBlocks = (fullData.blocks || []).sort((a: Block, b: Block) => a.position - b.position);
        setBlocks(sortedBlocks);
        // Select the first task-type block (not feature block)
        const taskBlock = sortedBlocks.find((b: Block) => b.fixed_type === 'TASK') || sortedBlocks[0];
        if (taskBlock) {
          setSelectedBlockId(taskBlock.id);
        }
      } catch (error) {
        console.error('Failed to load blocks:', error);
      } finally {
        setIsLoadingBlocks(false);
      }
    })();
  }, [selectedBoardId]);

  const handleSubmit = async () => {
    if (!selectedBoardId || !selectedBlockId) return;
    setIsSubmitting(true);
    try {
      const data = {
        target_board_id: selectedBoardId,
        target_block_id: selectedBlockId,
      };
      if (mode === 'move') {
        await boardAPI.moveTask(taskId, data);
      } else {
        await boardAPI.copyTask(taskId, data);
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error(`Failed to ${mode} task:`, error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMove = mode === 'move';
  const Icon = isMove ? ArrowRight : Copy;

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md bg-bridge-dark p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10 bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${isMove ? 'bg-orange-500/10' : 'bg-bridge-secondary/10'} flex items-center justify-center`}>
              <Icon size={16} className={isMove ? 'text-orange-400' : 'text-bridge-secondary'} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {isMove ? t('task.moveToBoard', '다른 보드로 이동') : t('task.copyToBoard', '다른 보드로 복사')}
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-[200px]">{taskTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-foreground transition-colors" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {isLoadingBoards ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
            </div>
          ) : boards.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-400">
              {t('task.noOtherBoards', '이동할 수 있는 보드가 없습니다')}
            </div>
          ) : (
            <>
              {/* Board Selector */}
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                  {t('task.targetBoard', '대상 보드')}
                </label>
                <select
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                  className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-bridge-accent/50"
                >
                  {boards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.name} {board.board_type === 'PERSONAL' ? '(My Space)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Block Selector */}
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                  {t('task.targetBlock', '대상 블록')}
                </label>
                {isLoadingBlocks ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-xs text-slate-400">{t('common.loading', '로딩중...')}</span>
                  </div>
                ) : (
                  <select
                    value={selectedBlockId}
                    onChange={(e) => setSelectedBlockId(e.target.value)}
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-foreground text-sm focus:outline-none focus:border-bridge-accent/50"
                  >
                    {blocks.map((block) => (
                      <option key={block.id} value={block.id}>
                        {block.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {boards.length > 0 && (
          <div className="px-6 py-4 border-t border-foreground/10 bg-white/[0.03] flex justify-end items-center gap-3">
            <button
              onClick={onClose}
              className="text-xs font-bold text-slate-400 hover:text-foreground transition-all tracking-wider"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedBoardId || !selectedBlockId || isSubmitting}
              className={`px-5 py-2 text-xs font-bold rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                isMove
                  ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                  : 'bg-bridge-secondary/20 text-bridge-secondary hover:bg-bridge-secondary/30'
              }`}
            >
              {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <Icon size={14} />
              {isMove ? t('task.move', '이동') : t('task.copy', '복사')}
            </button>
          </div>
        )}
    </MotionModal>
  );
}
