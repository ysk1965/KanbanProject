import { useState, useEffect } from 'react';
import { Feature, Task, Tag, Priority } from '../types';
import { FEATURE_COLORS } from '../constants';
import { X, Trash2, ChevronDown, Calendar, Plus, ClipboardList, CheckCircle2 } from 'lucide-react';

interface FeatureDetailModalProps {
  feature: Feature | null;
  tasks: Task[];
  blocks: Array<{ id: string; name: string }>;
  open: boolean;
  onClose: () => void;
  onAddSubtask: (title: string) => void;
  onUpdateFeature: (feature: Partial<Feature>) => void;
  onDelete: (featureId: string) => void;
  availableTags: Tag[];
  onCreateTag: (name: string, color: string) => void;
}

export function FeatureDetailModal({
  feature,
  tasks,
  blocks,
  open,
  onClose,
  onAddSubtask,
  onUpdateFeature,
  onDelete,
  availableTags,
  onCreateTag,
}: FeatureDetailModalProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [initialFeature, setInitialFeature] = useState<Feature | null>(null);
  const [editedFeature, setEditedFeature] = useState<Feature | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (feature && open) {
      setInitialFeature(JSON.parse(JSON.stringify(feature)));
      setEditedFeature(JSON.parse(JSON.stringify(feature)));
      setHasChanges(false);
    }
  }, [feature, open]);

  useEffect(() => {
    if (initialFeature && editedFeature) {
      const changed = JSON.stringify(initialFeature) !== JSON.stringify(editedFeature);
      setHasChanges(changed);
    }
  }, [initialFeature, editedFeature]);

  if (!open || !feature || !editedFeature) return null;

  const progressPercent = feature.progress_percentage;
  const completedCount = feature.completed_tasks;
  const totalCount = feature.total_tasks;

  const handleClose = () => {
    if (hasChanges) {
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    if (hasChanges && editedFeature) {
      onUpdateFeature(editedFeature);
      setHasChanges(false);
    }
    onClose();
  };

  const handleDiscardAndClose = () => {
    setShowConfirmDialog(false);
    onClose();
  };

  const handleSaveAndClose = () => {
    if (editedFeature) {
      onUpdateFeature(editedFeature);
    }
    setShowConfirmDialog(false);
    onClose();
  };

  const updateEditedFeature = (updates: Partial<Feature>) => {
    setEditedFeature((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      onAddSubtask(newSubtaskTitle.trim());
      setNewSubtaskTitle('');
    }
  };

  const handleAddTag = (tagId: string) => {
    const currentTags = editedFeature.tags || [];
    const tagToAdd = availableTags.find((t) => t.id === tagId);
    if (tagToAdd && !currentTags.some((t) => t.id === tagId)) {
      updateEditedFeature({ tags: [...currentTags, tagToAdd] });
    }
  };

  const handleRemoveTag = (tagId: string) => {
    const currentTags = editedFeature.tags || [];
    updateEditedFeature({ tags: currentTags.filter((t) => t.id !== tagId) });
  };

  const handleCreateNewTag = () => {
    if (newTagName.trim()) {
      const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      onCreateTag(newTagName.trim(), randomColor);
      setNewTagName('');
      setShowTagInput(false);
    }
  };

  const getBlockName = (blockId: string) => {
    return blocks.find((b) => b.id === blockId)?.name || blockId;
  };

  const featureTags = editedFeature.tags || [];
  const availableTagsToAdd = availableTags.filter(
    (tag) => !featureTags.some((t) => t.id === tag.id)
  );
  const selectedColor = editedFeature.color || '#8B5CF6';

  return (
    <>
      {/* Main Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
        onClick={handleClose}
      >
        <div
          className="w-full max-w-xl bg-kanban-bg text-zinc-300 rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Control Bar */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3 flex-1">
              <div
                className="w-5 h-5 rounded-md shadow-lg flex-shrink-0 transition-all duration-300"
                style={{
                  backgroundColor: selectedColor,
                  boxShadow: `0 0 15px ${selectedColor}88`,
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              />
              <input
                type="text"
                value={editedFeature.title}
                onChange={(e) => updateEditedFeature({ title: e.target.value })}
                className="text-lg font-bold bg-transparent border-none focus:outline-none rounded w-full text-foreground placeholder-zinc-600"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={18} />
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button
                onClick={handleClose}
                className="p-2 text-zinc-500 hover:text-foreground transition-colors"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          <div className="px-6 py-6 space-y-8 max-h-[80vh] overflow-y-auto kanban-scrollbar">
            {/* Description Module */}
            <section>
              <label className="kanban-label block mb-3">설명</label>
              <textarea
                placeholder="FEATURE 설명을 입력하세요..."
                value={editedFeature.description || ''}
                onChange={(e) => updateEditedFeature({ description: e.target.value })}
                className="w-full min-h-[100px] bg-kanban-input border border-white/5 rounded-xl p-4 text-zinc-300 focus:outline-none focus:border-indigo-500/50 transition-all resize-none text-sm leading-relaxed"
              />
            </section>

            {/* Core Specs Grid */}
            <div className="grid grid-cols-2 gap-6">
              <section>
                <label className="kanban-label block mb-3">우선순위</label>
                <div className="relative">
                  <select
                    value={editedFeature.priority || 'MEDIUM'}
                    onChange={(e) => updateEditedFeature({ priority: e.target.value as Priority })}
                    className="w-full bg-kanban-card-hover border border-white/5 rounded-lg px-4 py-2.5 appearance-none focus:outline-none focus:border-indigo-500/50 text-xs font-bold text-zinc-200"
                  >
                    <option value="HIGH" className="bg-kanban-bg">높음</option>
                    <option value="MEDIUM" className="bg-kanban-bg">보통</option>
                    <option value="LOW" className="bg-kanban-bg">낮음</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" size={14} />
                </div>
              </section>
              <section>
                <label className="kanban-label block mb-3">마감일</label>
                <div className="relative">
                  <input
                    type="date"
                    value={editedFeature.due_date || ''}
                    onChange={(e) => updateEditedFeature({ due_date: e.target.value })}
                    className="w-full bg-kanban-card-hover border border-white/5 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/50 text-xs font-bold text-zinc-200"
                  />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" size={14} />
                </div>
              </section>
            </div>

            {/* Color Spectrum Selection */}
            <section>
              <label className="kanban-label block mb-4">FEATURE 색상</label>
              <div className="flex flex-wrap gap-2.5">
                {FEATURE_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => updateEditedFeature({ color })}
                    className={`w-7 h-7 rounded-full transition-all duration-300 ${
                      selectedColor === color
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-kanban-bg scale-110'
                        : 'opacity-40 hover:opacity-100 hover:scale-110'
                    }`}
                    style={{
                      backgroundColor: color,
                      boxShadow: selectedColor === color ? `0 0 15px ${color}` : 'none',
                    }}
                  />
                ))}
              </div>
            </section>

            {/* Tags Section */}
            <section>
              <label className="kanban-label block mb-3">태그</label>
              <div className="flex flex-wrap gap-2">
                {featureTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5"
                    style={{
                      backgroundColor: `${tag.color}15`,
                      borderColor: `${tag.color}44`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                    <button
                      onClick={() => handleRemoveTag(tag.id)}
                      className="hover:opacity-80"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}

                {showTagInput ? (
                  <div className="flex gap-1.5 items-center">
                    <input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="태그 이름"
                      className="h-7 w-24 text-xs bg-kanban-input border border-white/10 rounded-lg px-2 focus:outline-none focus:border-indigo-500/50"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateNewTag();
                      }}
                    />
                    <button
                      onClick={handleCreateNewTag}
                      className="px-2 py-1 bg-indigo-600/20 text-indigo-400 text-[10px] font-bold rounded-lg border border-indigo-500/20 hover:bg-indigo-600/30"
                    >
                      생성
                    </button>
                    <button
                      onClick={() => {
                        setShowTagInput(false);
                        setNewTagName('');
                      }}
                      className="text-zinc-500 hover:text-foreground text-xs"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    {availableTagsToAdd.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) handleAddTag(e.target.value);
                          e.target.value = '';
                        }}
                        className="h-7 text-xs bg-kanban-card border border-white/10 rounded-lg px-2 focus:outline-none appearance-none cursor-pointer"
                      >
                        <option value="">태그 추가</option>
                        {availableTagsToAdd.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => setShowTagInput(true)}
                      className="px-2.5 py-1 bg-white/5 text-zinc-400 text-[10px] font-bold rounded-lg border border-white/10 hover:bg-white/10 hover:text-foreground flex items-center gap-1"
                    >
                      <Plus size={10} />새 태그
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Subtask Module */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                  <ClipboardList size={14} className="text-indigo-400" />
                  <span className="kanban-label">서브태스크 리스트</span>
                </div>
                <span className="text-[11px] font-bold text-indigo-400 tabular-nums">
                  {completedCount}/{totalCount} 완료
                </span>
              </div>

              <div className="bg-kanban-input border border-white/5 rounded-xl overflow-hidden">
                {/* Progress Bar */}
                <div className="p-5">
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-1000 ease-out"
                      style={{
                        width: `${progressPercent}%`,
                        boxShadow: '0 0 15px rgba(99,102,241,0.5)',
                      }}
                    />
                  </div>
                  <div className="mt-2 text-right">
                    <span className="text-[9px] font-black text-zinc-600 tracking-tighter uppercase">
                      {Math.round(progressPercent)}% PROGRESS
                    </span>
                  </div>
                </div>

                {/* Task Entries */}
                <div className="border-t border-white/5 divide-y divide-white/5">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: selectedColor,
                            boxShadow: `0 0 8px ${selectedColor}44`,
                          }}
                        />
                        <span className="text-xs font-semibold text-zinc-300 group-hover:text-foreground transition-colors">
                          {task.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-black text-zinc-600">
                        <span className="tracking-widest group-hover:text-indigo-400 transition-colors">
                          → {getBlockName(task.block_id).toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quick Add Dock */}
                <div className="bg-white/[0.02] p-2 flex gap-2 border-t border-white/5">
                  <input
                    type="text"
                    placeholder="새 서브태스크 추가..."
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddSubtask();
                    }}
                    className="flex-1 bg-transparent border-none rounded-lg px-3 py-2 text-xs focus:outline-none text-zinc-300 placeholder-zinc-600"
                  />
                  <button
                    onClick={handleAddSubtask}
                    className="px-4 py-2 bg-indigo-600/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-lg border border-indigo-500/20 hover:bg-indigo-600/20 hover:text-foreground transition-all active:scale-95"
                  >
                    ADD
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Action Footer */}
          <div className="px-6 py-5 border-t border-white/5 bg-white/[0.02] flex justify-end items-center gap-4">
            <button
              onClick={handleClose}
              className="text-[11px] font-bold text-zinc-500 hover:text-foreground transition-all tracking-wider"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-white text-black font-black text-[11px] rounded-lg tracking-widest hover:bg-zinc-200 transition-all flex items-center gap-2 active:scale-[0.98]"
            >
              변경사항 저장
              <CheckCircle2 size={14} className="text-indigo-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-kanban-bg rounded-2xl border border-white/10 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground mb-2">변경사항을 저장하시겠습니까?</h3>
            <p className="text-sm text-zinc-400 mb-6">
              저장하지 않은 변경사항이 있습니다. 저장하지 않고 닫으면 변경사항이 사라집니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDiscardAndClose}
                className="flex-1 py-3 text-sm font-bold text-zinc-400 hover:text-foreground transition-colors border border-white/10 rounded-xl hover:bg-white/5"
              >
                저장 안 함
              </button>
              <button
                onClick={handleSaveAndClose}
                className="flex-1 py-3 bg-indigo-600 text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors text-white"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-kanban-bg rounded-2xl border border-white/10 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-foreground mb-2">이 기능을 삭제하시겠습니까?</h3>
            <p className="text-sm text-zinc-400 mb-6">
              이 기능과 모든 서브태스크가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="flex-1 py-3 text-sm font-bold text-zinc-400 hover:text-foreground transition-colors border border-white/10 rounded-xl hover:bg-white/5"
              >
                취소
              </button>
              <button
                onClick={() => {
                  onDelete(feature.id);
                  onClose();
                }}
                className="flex-1 py-3 bg-red-500 text-sm font-bold rounded-xl hover:bg-red-600 transition-colors text-white"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
