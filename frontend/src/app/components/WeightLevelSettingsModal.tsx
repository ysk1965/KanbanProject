import { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Check } from 'lucide-react';
import { statisticsService } from '../utils/services';

interface WeightLevel {
  id: string;
  name: string;
  weight: number;
  color: string;
  position: number;
  is_default: boolean;
}

interface WeightLevelSettingsModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  onSave: () => void;
}

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#14b8a6', // Teal
  '#3b82f6', // Blue
  '#64748b', // Slate
];

export function WeightLevelSettingsModal({
  open,
  onClose,
  boardId,
  onSave,
}: WeightLevelSettingsModalProps) {
  const [levels, setLevels] = useState<WeightLevel[]>([]);
  const [defaultLevelId, setDefaultLevelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadWeightLevels();
    }
  }, [open, boardId]);

  const loadWeightLevels = async () => {
    setIsLoading(true);
    try {
      const settings = await statisticsService.getWeightLevels(boardId);
      setLevels(settings.levels);
      setDefaultLevelId(settings.default_level_id);
    } catch (error) {
      console.error('Failed to load weight levels:', error);
      // 기본 레벨 설정
      setLevels([
        { id: 'temp-1', name: 'Standard', weight: 1.0, color: '#6366f1', position: 0, is_default: true }
      ]);
      setDefaultLevelId('temp-1');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddLevel = () => {
    const newPosition = levels.length;
    const newLevel: WeightLevel = {
      id: `temp-${Date.now()}`,
      name: `레벨 ${newPosition + 1}`,
      weight: 1.0,
      color: PRESET_COLORS[newPosition % PRESET_COLORS.length],
      position: newPosition,
      is_default: false,
    };
    setLevels([...levels, newLevel]);
  };

  const handleRemoveLevel = (id: string) => {
    if (levels.length <= 1) {
      alert('최소 1개의 가중치 레벨이 필요합니다.');
      return;
    }
    const updatedLevels = levels.filter((l) => l.id !== id);
    // 삭제된 레벨이 기본 레벨이면 첫 번째 레벨을 기본으로 설정
    if (defaultLevelId === id && updatedLevels.length > 0) {
      setDefaultLevelId(updatedLevels[0].id);
    }
    // position 재정렬
    const reorderedLevels = updatedLevels.map((l, i) => ({ ...l, position: i }));
    setLevels(reorderedLevels);
  };

  const handleUpdateLevel = (id: string, updates: Partial<WeightLevel>) => {
    setLevels(levels.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const handleSetDefault = (id: string) => {
    setDefaultLevelId(id);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await statisticsService.updateWeightLevels(boardId, {
        levels: levels.map((l) => ({
          id: l.id.startsWith('temp-') ? undefined : l.id,
          name: l.name,
          weight: l.weight,
          color: l.color,
          position: l.position,
        })),
        default_level_id: defaultLevelId?.startsWith('temp-') ? undefined : defaultLevelId || undefined,
      });
      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save weight levels:', error);
      alert('가중치 레벨 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bridge-obsidian rounded-2xl shadow-2xl w-full max-w-2xl border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">가중치 레벨 설정</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">로딩 중...</div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-400 mb-4">
                가중치 레벨을 설정하여 Task의 중요도를 구분할 수 있습니다.
                높은 가중치의 Task에 더 많은 시간을 투입하면 임팩트 점수가 높아집니다.
              </p>

              {/* Level List */}
              <div className="space-y-3">
                {levels.map((level, index) => (
                  <div
                    key={level.id}
                    className="flex items-center gap-3 p-4 bg-bridge-dark rounded-xl border border-white/5"
                  >
                    <GripVertical className="h-4 w-4 text-slate-600 cursor-grab" />

                    {/* Color Picker */}
                    <div className="relative">
                      <input
                        type="color"
                        value={level.color}
                        onChange={(e) => handleUpdateLevel(level.id, { color: e.target.value })}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                        style={{ padding: 0 }}
                      />
                    </div>

                    {/* Name */}
                    <input
                      type="text"
                      value={level.name}
                      onChange={(e) => handleUpdateLevel(level.id, { name: e.target.value })}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent"
                      placeholder="레벨 이름"
                    />

                    {/* Weight */}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">×</span>
                      <input
                        type="number"
                        value={level.weight}
                        onChange={(e) => handleUpdateLevel(level.id, { weight: parseFloat(e.target.value) || 1 })}
                        step="0.1"
                        min="0.1"
                        max="10"
                        className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent"
                      />
                    </div>

                    {/* Default Toggle */}
                    <button
                      onClick={() => handleSetDefault(level.id)}
                      className={`p-2 rounded-lg transition-all ${
                        defaultLevelId === level.id
                          ? 'bg-bridge-accent text-white'
                          : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                      title={defaultLevelId === level.id ? '기본 레벨' : '기본 레벨로 설정'}
                    >
                      <Check className="h-4 w-4" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleRemoveLevel(level.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Button */}
              <button
                onClick={handleAddLevel}
                className="w-full py-3 border border-dashed border-white/20 rounded-xl text-slate-400 hover:text-white hover:border-white/40 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                레벨 추가
              </button>

              {/* Preset Examples */}
              <div className="mt-6 p-4 bg-bridge-dark/50 rounded-xl">
                <p className="text-xs text-slate-500 mb-3">추천 프리셋</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setLevels([
                        { id: 'p1', name: 'Low', weight: 0.5, color: '#64748b', position: 0, is_default: false },
                        { id: 'p2', name: 'Standard', weight: 1.0, color: '#6366f1', position: 1, is_default: true },
                        { id: 'p3', name: 'High', weight: 1.5, color: '#f59e0b', position: 2, is_default: false },
                        { id: 'p4', name: 'Critical', weight: 2.0, color: '#ef4444', position: 3, is_default: false },
                      ]);
                      setDefaultLevelId('p2');
                    }}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                  >
                    4단계 (Low ~ Critical)
                  </button>
                  <button
                    onClick={() => {
                      setLevels([
                        { id: 'p1', name: '일반', weight: 1.0, color: '#6366f1', position: 0, is_default: true },
                        { id: 'p2', name: '중요', weight: 1.5, color: '#f59e0b', position: 1, is_default: false },
                        { id: 'p3', name: '긴급', weight: 2.0, color: '#ef4444', position: 2, is_default: false },
                      ]);
                      setDefaultLevelId('p1');
                    }}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                  >
                    3단계 (일반/중요/긴급)
                  </button>
                  <button
                    onClick={() => {
                      setLevels([
                        { id: 'p1', name: 'P0', weight: 3.0, color: '#ef4444', position: 0, is_default: false },
                        { id: 'p2', name: 'P1', weight: 2.0, color: '#f97316', position: 1, is_default: false },
                        { id: 'p3', name: 'P2', weight: 1.5, color: '#f59e0b', position: 2, is_default: true },
                        { id: 'p4', name: 'P3', weight: 1.0, color: '#10b981', position: 3, is_default: false },
                        { id: 'p5', name: 'P4', weight: 0.5, color: '#64748b', position: 4, is_default: false },
                      ]);
                      setDefaultLevelId('p3');
                    }}
                    className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                  >
                    5단계 (P0 ~ P4)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl font-medium hover:bg-white/10 transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
