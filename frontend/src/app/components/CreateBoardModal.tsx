import { useState } from 'react';
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

// 보드 색상 gradient 생성
const BOARD_GRADIENTS = [
  { name: 'Purple', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { name: 'Pink', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { name: 'Blue', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { name: 'Orange', value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { name: 'Teal', value: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)' },
  { name: 'Pastel', value: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' },
];

interface CreateBoardModalProps {
  open: boolean;
  onClose: () => void;
  onCreateBoard: (name: string, description?: string) => void;
}

export function CreateBoardModal({
  open,
  onClose,
  onCreateBoard,
}: CreateBoardModalProps) {
  const [boardName, setBoardName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(BOARD_GRADIENTS[0].value);

  const handleCreate = () => {
    if (boardName.trim()) {
      onCreateBoard(boardName.trim(), description.trim() || undefined);
      setBoardName('');
      setDescription('');
      setSelectedGradient(BOARD_GRADIENTS[0].value);
    }
  };

  const handleClose = () => {
    setBoardName('');
    setDescription('');
    setSelectedGradient(BOARD_GRADIENTS[0].value);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-bridge-obsidian text-foreground border-white/20 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create board</DialogTitle>
          <DialogDescription className="text-slate-400">
            Create a new kanban board for your team
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 보드 미리보기 */}
          <div className="space-y-2">
            <Label className="text-slate-300">Board preview</Label>
            <div
              className="h-28 rounded-lg flex items-center justify-center"
              style={{ background: selectedGradient }}
            >
              <span className="text-white font-semibold text-base px-4 py-2 bg-black/20 rounded">
                {boardName || 'Board name'}
              </span>
            </div>
          </div>

          {/* 보드 이름 */}
          <div className="space-y-2">
            <Label htmlFor="board-name" className="text-slate-300">
              Board name <span className="text-red-400">*</span>
            </Label>
            <Input
              id="board-name"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              placeholder="e.g., Project Management"
              className="bg-bridge-dark border-white/20 text-foreground placeholder:text-slate-400 focus:border-blue-500"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                  handleCreate();
                }
              }}
            />
          </div>

          {/* 설명 */}
          <div className="space-y-2">
            <Label htmlFor="board-description" className="text-slate-300">
              Description
            </Label>
            <Textarea
              id="board-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the board (optional)"
              className="bg-bridge-dark border-white/20 text-foreground placeholder:text-slate-400 focus:border-blue-500 resize-none"
              rows={3}
            />
          </div>

          {/* 색상 선택 (미리보기용) */}
          <div className="space-y-2">
            <Label className="text-slate-300">Background color</Label>
            <div className="grid grid-cols-3 gap-2">
              {BOARD_GRADIENTS.map((gradient) => (
                <button
                  key={gradient.name}
                  onClick={() => setSelectedGradient(gradient.value)}
                  className={`h-12 rounded-lg transition-all ${
                    selectedGradient === gradient.value
                      ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-bridge-obsidian scale-105'
                      : 'hover:scale-105'
                  }`}
                  style={{ background: gradient.value }}
                >
                  <span className="sr-only">{gradient.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex justify-end gap-2 pt-4 border-t border-white/20">
          <Button
            variant="outline"
            onClick={handleClose}
            className="border-white/20 text-slate-300 hover:bg-white/5 hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!boardName.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
