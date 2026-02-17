import { useState } from 'react';
import { Tag } from '../types';
import { Tags, Check, Search, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { TagManagementModal } from './TagManagementModal';

interface TagPickerPopoverProps {
  selectedTagIds: string[];
  availableTags: Tag[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (tagId: string, data: { name?: string; color?: string }) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  disabled?: boolean;
}

export function TagPickerPopover({
  selectedTagIds,
  availableTags,
  onToggleTag,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  disabled = false,
}: TagPickerPopoverProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [showManagement, setShowManagement] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const filteredTags = availableTags.filter((tag) =>
    tag.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 text-slate-400 text-[10px] font-bold rounded-lg border border-white/10 hover:bg-white/10 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Tags size={12} />
            {t('task.addTag')}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 p-0 bg-bridge-surface border-bridge-border"
          align="start"
          sideOffset={8}
        >
          {/* Search */}
          <div className="p-2 border-b border-bridge-border/50">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white/5 rounded-lg">
              <Search size={12} className="text-slate-400 flex-shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('tags.searchPlaceholder')}
                className="flex-1 text-xs bg-transparent text-foreground placeholder:text-slate-500 focus:outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* Tag list */}
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filteredTags.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">{t('tags.noTags')}</p>
            ) : (
              filteredTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => onToggleTag(tag.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="text-xs text-foreground flex-1 truncate">{tag.name}</span>
                    {isSelected && (
                      <Check size={14} className="text-bridge-accent flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Manage tags link */}
          <div className="border-t border-bridge-border/50 p-1">
            <button
              onClick={() => {
                setIsOpen(false);
                setShowManagement(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <Settings size={12} />
              {t('tags.management')}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <TagManagementModal
        open={showManagement}
        onClose={() => setShowManagement(false)}
        tags={availableTags}
        onCreateTag={onCreateTag}
        onUpdateTag={onUpdateTag}
        onDeleteTag={onDeleteTag}
      />
    </>
  );
}
