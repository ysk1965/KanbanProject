import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Tag as TagIcon, Plus, X, Check } from "lucide-react";
import { noteService } from "../../utils/services";
import { ColorPickerPopover } from "../ui/ColorPickerPopover";
import type { NoteTagInfo } from "../../utils/api";

const TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
];

interface NoteTagManagerProps {
  boardId: string;
  noteId: string;
  noteTags: NoteTagInfo[];
  allTags: NoteTagInfo[];
  canEdit: boolean;
  onSave: (tagIds: string[]) => void;
  onTagsChange: () => void;
}

export function NoteTagManager({
  boardId,
  noteId,
  noteTags,
  allTags,
  canEdit,
  onSave,
  onTagsChange,
}: NoteTagManagerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const currentTagIds = new Set(noteTags.map((t) => t.id));

  const handleToggleTag = useCallback(
    (tagId: string) => {
      const newIds = new Set(currentTagIds);
      if (newIds.has(tagId)) {
        newIds.delete(tagId);
      } else {
        newIds.add(tagId);
      }
      onSave(Array.from(newIds));
    },
    [currentTagIds, onSave],
  );

  const handleCreateTag = useCallback(async () => {
    if (!newTagName.trim()) return;
    try {
      const created = await noteService.createTag(boardId, {
        name: newTagName.trim(),
        color: newTagColor,
      });
      onTagsChange();
      // Auto-add to note
      const newIds = new Set(currentTagIds);
      newIds.add(created.id);
      onSave(Array.from(newIds));
      setNewTagName("");
      setCreating(false);
    } catch (err) {
      console.error("Failed to create tag:", err);
    }
  }, [boardId, newTagName, newTagColor, currentTagIds, onSave, onTagsChange]);

  const handleDeleteTag = useCallback(
    async (tagId: string) => {
      try {
        await noteService.deleteTag(boardId, tagId);
        onTagsChange();
        const newIds = new Set(currentTagIds);
        newIds.delete(tagId);
        onSave(Array.from(newIds));
      } catch (err) {
        console.error("Failed to delete tag:", err);
      }
    },
    [boardId, currentTagIds, onSave, onTagsChange],
  );

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded transition-colors"
      >
        <TagIcon size={10} />
        <span className="hidden lg:inline">{t("notes.tags", "태그")}</span>
        {noteTags.length > 0 && (
          <span className="text-bridge-accent font-semibold">
            {noteTags.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false);
              setCreating(false);
            }}
          />
          <div className="absolute right-0 top-full mt-1 z-50 bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl w-56 overflow-hidden">
            <div className="p-2 border-b border-foreground/5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {t("notes.tags", "태그")}
              </span>
            </div>

            {/* Tag list */}
            <div className="max-h-48 overflow-y-auto p-1">
              {allTags.length === 0 && !creating ? (
                <p className="text-center text-[10px] text-slate-500 py-4">
                  {t("notes.noTags", "태그가 없습니다")}
                </p>
              ) : (
                allTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-foreground/5 group"
                  >
                    <button
                      onClick={() => canEdit && handleToggleTag(tag.id)}
                      className="flex items-center gap-2 flex-1 min-w-0"
                      disabled={!canEdit}
                    >
                      <div
                        className="w-3 h-3 rounded-sm flex-shrink-0 flex items-center justify-center"
                        style={{
                          backgroundColor: currentTagIds.has(tag.id)
                            ? tag.color
                            : "transparent",
                          border: `1.5px solid ${tag.color}`,
                        }}
                      >
                        {currentTagIds.has(tag.id) && (
                          <Check size={8} className="text-white" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">
                        {tag.name}
                      </span>
                    </button>
                    {canEdit && (
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-all"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Create new tag */}
            {canEdit && (
              <div className="border-t border-foreground/5 p-2">
                {creating ? (
                  <div className="space-y-2">
                    <input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateTag();
                      }}
                      placeholder={t("notes.tagName", "태그 이름")}
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                      autoFocus
                    />
                    <ColorPickerPopover
                      colors={TAG_COLORS}
                      selectedColor={newTagColor}
                      onColorChange={setNewTagColor}
                      triggerSize="sm"
                      triggerShape="circle"
                      showCustomColor={false}
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={handleCreateTag}
                        disabled={!newTagName.trim()}
                        className="flex-1 px-2 py-1 bg-bridge-accent text-white rounded text-[10px] font-semibold hover:bg-bridge-accent/90 disabled:opacity-50"
                      >
                        {t("notes.createTag", "만들기")}
                      </button>
                      <button
                        onClick={() => {
                          setCreating(false);
                          setNewTagName("");
                        }}
                        className="px-2 py-1 text-slate-400 hover:text-foreground text-[10px]"
                      >
                        {t("common.cancel", "취소")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreating(true)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                  >
                    <Plus size={12} />
                    {t("notes.addTag", "태그 추가")}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
