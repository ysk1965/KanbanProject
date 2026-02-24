import { useState } from 'react';
import { Tag } from '../types';
import { FEATURE_COLORS } from '../constants';
import { X, Pencil, Trash2, Check, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MotionModal } from './ui/MotionModal';
import { ColorPickerPopover } from './ui/ColorPickerPopover';

interface TagManagementModalProps {
  open: boolean;
  onClose: () => void;
  tags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (tagId: string, data: { name?: string; color?: string }) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
}

export function TagManagementModal({
  open,
  onClose,
  tags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: TagManagementModalProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(FEATURE_COLORS[0]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await onUpdateTag(editingId, { name: editName.trim(), color: editColor });
    cancelEdit();
  };

  const handleDelete = async (tagId: string) => {
    await onDeleteTag(tagId);
    setDeleteConfirmId(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    await onCreateTag(newName.trim(), newColor);
    setNewName('');
    setNewColor(FEATURE_COLORS[0]);
    setIsCreating(false);
  };

  return (
    <MotionModal open={open} onClose={onClose}>
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-foreground text-lg font-semibold">{t('tags.management')}</h2>
        </div>

        {/* Tag list */}
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {tags.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">{t('tags.noTags')}</p>
          )}

          {tags.map((tag) => (
            <div key={tag.id}>
              {editingId === tag.id ? (
                /* Editing mode */
                <div className="p-3 rounded-xl bg-bridge-dark/50 border border-bridge-border/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 h-8 text-sm bg-foreground/5 border border-foreground/10 rounded-lg px-3 text-foreground focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                    />
                    <button
                      onClick={saveEdit}
                      className="w-8 h-8 rounded-lg bg-bridge-accent/20 text-bridge-accent hover:bg-bridge-accent/30 flex items-center justify-center transition-colors"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="w-8 h-8 rounded-lg bg-foreground/5 text-slate-400 hover:bg-foreground/10 hover:text-foreground flex items-center justify-center transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {t('tags.selectColor')}
                    </span>
                    <ColorPickerPopover
                      colors={FEATURE_COLORS}
                      selectedColor={editColor}
                      onColorChange={setEditColor}
                      triggerSize="sm"
                      triggerShape="circle"
                    />
                  </div>
                </div>
              ) : deleteConfirmId === tag.id ? (
                /* Delete confirmation */
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
                  <p className="text-xs text-red-300">{t('tags.deleteConfirm')}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="px-3 py-1.5 text-xs font-bold bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 hover:bg-red-500/30 transition-colors"
                    >
                      {t('common.delete')}
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-foreground transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal display */
                <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-foreground/5 group/tag transition-colors">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-sm text-foreground flex-1 truncate">{tag.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover/tag:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(tag)}
                      className="w-7 h-7 rounded-lg hover:bg-foreground/10 flex items-center justify-center text-slate-400 hover:text-foreground transition-colors"
                      title={t('tags.editTag')}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(tag.id)}
                      className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors"
                      title={t('tags.deleteTag')}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Create new tag */}
        <div className="pt-3 border-t border-bridge-border/50 space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {t('tags.createNew')}
          </span>
          <div className="flex items-center gap-2">
            <ColorPickerPopover
              colors={FEATURE_COLORS}
              selectedColor={newColor}
              onColorChange={setNewColor}
              triggerSize="lg"
              triggerShape="circle"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('tags.namePlaceholder')}
              className="flex-1 h-8 text-sm bg-foreground/5 border border-foreground/10 rounded-lg px-3 text-foreground placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') handleCreate();
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || isCreating}
              className="h-8 px-3 text-xs font-bold bg-bridge-accent text-white rounded-lg hover:bg-bridge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
            >
              <Plus size={12} />
              {t('common.add')}
            </button>
          </div>
        </div>
    </MotionModal>
  );
}
