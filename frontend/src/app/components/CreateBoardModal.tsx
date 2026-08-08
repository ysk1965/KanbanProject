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

/**
 * 시작 방식 3택 — 개념 이름("스프린트 쓰실래요?")이 아니라 **일하는 방식**을 묻는다.
 * 스프린트를 아는 사람에게만 통하는 질문을 신규 유저에게 던지지 않기 위해서다.
 * 설계: docs/Design/level-onboarding-plan.html
 */
const START_STYLES: { level: 1 | 2 | 3; q: string; e: string }[] = [
  {
    level: 1,
    q: '할 일을 적고 하나씩 지워요',
    e: '목록과 체크박스면 충분합니다. 기간도 담기도 아직 없습니다.',
  },
  {
    level: 2,
    q: '주 단위로 끊어서 굴려요',
    e: '이번 주기에 할 것만 담고, 못 끝낸 건 다음 주기로 넘깁니다.',
  },
  {
    level: 3,
    q: '분기 계획이 있고 사람도 여럿이에요',
    e: '단계 안에 주기가 있고, 사람별로 나눠 봐야 합니다.',
  },
];

interface CreateBoardModalProps {
  open: boolean;
  onClose: () => void;
  /** uiLevel — 화면 복잡도. 생성 직후 보드 설정에 반영된다(기본 1). */
  onCreateBoard: (
    name: string,
    description?: string,
    backgroundGradient?: string,
    uiLevel?: 1 | 2 | 3,
  ) => void;
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
  const [uiLevel, setUiLevel] = useState<1 | 2 | 3>(1);

  const handleCreate = () => {
    if (boardName.trim()) {
      onCreateBoard(boardName.trim(), description.trim() || undefined, selectedGradient, uiLevel);
      setBoardName('');
      setDescription('');
      setSelectedGradient(BOARD_GRADIENTS[0].value);
      setUiLevel(1);
    }
  };

  const handleClose = () => {
    setBoardName('');
    setDescription('');
    setSelectedGradient(BOARD_GRADIENTS[0].value);
    setUiLevel(1);
    onClose();
  };

  return (
    <MotionModal open={open} onClose={handleClose} className="sm:max-w-lg">
          <div className="p-6">
            <div className="mb-4">
              <h2 className="text-foreground font-bold text-lg">{t('createBoard.title')}</h2>
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
                  <span className="text-white font-bold text-base px-4 py-2 bg-black/20 rounded">
                    {boardName || 'Board name'}
                  </span>
                </div>
              </div>

              {/* 시작 방식 — 나중에 언제든 바꿀 수 있으니 여기서 고민을 길게 만들지 않는다. */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">이 팀은 일을 어떻게 굴리나요?</Label>
                <div className="grid gap-2" role="radiogroup" aria-label="시작 방식">
                  {START_STYLES.map((s) => (
                    <button
                      key={s.level}
                      type="button"
                      role="radio"
                      aria-checked={uiLevel === s.level}
                      onClick={() => setUiLevel(s.level)}
                      className={`text-left rounded-xl border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                        uiLevel === s.level
                          ? 'border-bridge-accent bg-bridge-accent/10'
                          : 'border-foreground/10 hover:border-foreground/20 hover:bg-foreground/5'
                      }`}
                    >
                      <span className="block text-sm font-bold text-foreground">{s.q}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{s.e}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-600">
                  나중에 언제든 바꿀 수 있습니다. 지금 고른 것 때문에 못 하게 되는 일은 없습니다.
                </p>
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
