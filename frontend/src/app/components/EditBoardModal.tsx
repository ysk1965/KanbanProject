import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Label } from './ui/label';
import type { Board } from '../types';

interface EditBoardModalProps {
  open: boolean;
  board: Board | null;
  onClose: () => void;
  onUpdateBoard: (boardId: string, name: string, description?: string) => void;
}

export function EditBoardModal({
  open,
  board,
  onClose,
  onUpdateBoard,
}: EditBoardModalProps) {
  const [boardName, setBoardName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (board) {
      setBoardName(board.name);
      setDescription(board.description || '');
    }
  }, [board]);

  const handleUpdate = () => {
    if (board && boardName.trim()) {
      onUpdateBoard(board.id, boardName.trim(), description.trim() || undefined);
      onClose();
    }
  };

  const handleClose = () => {
    setBoardName('');
    setDescription('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-bridge-obsidian text-foreground border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground font-serif">Edit Board</DialogTitle>
          <DialogDescription className="text-slate-400">
            Update your board information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 보드 이름 */}
          <div className="space-y-2">
            <Label htmlFor="edit-board-name" className="text-slate-300">
              Board name <span className="text-red-400">*</span>
            </Label>
            <Input
              id="edit-board-name"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              placeholder="e.g., Project Management"
              className="bg-white/5 border-white/10 text-foreground placeholder:text-slate-600 focus:border-bridge-accent focus:ring-bridge-accent/50"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                  handleUpdate();
                }
              }}
            />
          </div>

          {/* 설명 */}
          <div className="space-y-2">
            <Label htmlFor="edit-board-description" className="text-slate-300">
              Description
            </Label>
            <Textarea
              id="edit-board-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the board (optional)"
              className="bg-white/5 border-white/10 text-foreground placeholder:text-slate-600 focus:border-bridge-accent focus:ring-bridge-accent/50 resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
          <Button
            variant="outline"
            onClick={handleClose}
            className="border-white/10 text-slate-300 hover:bg-white/5 hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={!boardName.trim()}
            className="bg-bridge-accent hover:bg-bridge-accent/90 text-white disabled:opacity-50"
          >
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
