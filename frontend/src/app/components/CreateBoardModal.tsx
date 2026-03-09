import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MotionModal } from './ui/MotionModal';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Label } from './ui/label';

// 보드 색상 gradient 생성 (dashboard/CreateBoardModal과 동일)
const BOARD_GRADIENTS = [
  { name: 'Indigo Purple', value: 'linear-gradient(135deg, #6366F1 0%, #a855f7 100%)' },
  { name: 'Teal Cyan', value: 'linear-gradient(135deg, #2DD4BF 0%, #0891B2 100%)' },
  { name: 'Rose Orange', value: 'linear-gradient(135deg, #F43F5E 0%, #FB923C 100%)' },
  { name: 'Green Blue', value: 'linear-gradient(135deg, #10B981 0%, #3B82F6 100%)' },
  { name: 'Amber Red', value: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)' },
  { name: 'Violet Pink', value: 'linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%)' },
];

interface CreateBoardModalProps {
  open: boolean;
  onClose: () => void;
  onCreateBoard: (name: string, description?: string, backgroundGradient?: string) => void;
}

export function CreateBoardModal({
  open,
  onClose,
  onCreateBoard,
}: CreateBoardModalProps) {
  const { t } = useTranslation();
  const [boardName, setBoardName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(BOARD_GRADIENTS[0].value);

  const handleCreate = () => {
    if (boardName.trim()) {
      onCreateBoard(boardName.trim(), description.trim() || undefined, selectedGradient);
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
    <MotionModal open={open} onClose={handleClose} className="sm:max-w-lg">
          <div className="p-6">
            <div className="mb-4">
              <h2 className="text-foreground font-semibold text-lg">{t('createBoard.title')}</h2>
              <p className="text-slate-400 text-sm">{t('createBoard.description')}</p>
            </div>

            <div className="space-y-6 py-4">
              {/* 보드 미리보기 */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('createBoard.preview')}</Label>
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
                <Label htmlFor="board-name" className="text-muted-foreground">
                  {t('createBoard.nameLabel')} <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="board-name"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  placeholder={t('createBoard.namePlaceholder')}
                  className="bg-bridge-dark border-foreground/10 text-foreground placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
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
                <Label htmlFor="board-description" className="text-muted-foreground">
                  {t('createBoard.descriptionLabel')}
                </Label>
                <Textarea
                  id="board-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('createBoard.descriptionPlaceholder')}
                  className="bg-bridge-dark border-foreground/10 text-foreground placeholder:text-slate-500 focus:border-bridge-accent resize-none"
                  rows={3}
                />
              </div>

              {/* 색상 선택 (미리보기용) */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">{t('createBoard.bgColor')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {BOARD_GRADIENTS.map((gradient) => (
                    <button
                      key={gradient.name}
                      onClick={() => setSelectedGradient(gradient.value)}
                      className={`h-12 rounded-lg transition-all ${
                        selectedGradient === gradient.value
                          ? 'ring-2 ring-bridge-accent ring-offset-2 ring-offset-bridge-obsidian scale-105'
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
            <div className="flex justify-end gap-2 pt-4 border-t border-foreground/10">
              <Button
                variant="outline"
                onClick={handleClose}
                className="border-foreground/10 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!boardName.trim()}
                className="bg-bridge-accent hover:bg-bridge-accent/90 text-white disabled:opacity-50"
              >
                {t('common.create')}
              </Button>
            </div>
          </div>
    </MotionModal>
  );
}
