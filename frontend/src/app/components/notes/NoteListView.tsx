import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Tag as TagIcon, Loader2 } from 'lucide-react';
import { noteService } from '../../utils/services';
import { formatDate } from '../../utils/dateUtils';
import type { NoteListItem, NoteTagInfo } from '../../utils/api';

interface NoteListViewProps {
  boardId: string;
  selectedNoteId: string | null;
  searchQuery: string;
  onSelect: (noteId: string) => void;
  tags: NoteTagInfo[];
}

export function NoteListView({ boardId, selectedNoteId, searchQuery, onSelect, tags }: NoteListViewProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTagId, setFilterTagId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const data = await noteService.getList(boardId);
      setItems(data);
    } catch (err) {
      console.error('Failed to load note list:', err);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTag = !filterTagId || item.tags?.some(t => t.id === filterTagId);
    return matchesSearch && matchesTag;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Tag filter */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-2 px-1">
          <button
            onClick={() => setFilterTagId(null)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              !filterTagId ? 'bg-bridge-accent/20 text-bridge-accent' : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            {t('notes.allTags', '전체')}
          </button>
          {tags.map(tag => (
            <button
              key={tag.id}
              onClick={() => setFilterTagId(filterTagId === tag.id ? null : tag.id)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                filterTagId === tag.id
                  ? 'text-white'
                  : 'text-slate-400 hover:text-foreground'
              }`}
              style={filterTagId === tag.id ? { backgroundColor: `${tag.color}30`, color: tag.color } : {}}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {/* List items */}
      {filteredItems.length === 0 ? (
        <div className="text-center text-slate-500 text-xs py-8">
          {searchQuery || filterTagId ? '검색 결과가 없습니다' : '문서가 없습니다'}
        </div>
      ) : (
        filteredItems.map(item => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${
              selectedNoteId === item.id
                ? 'bg-bridge-accent/15 text-foreground'
                : 'text-muted-foreground hover:bg-foreground/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText size={12} className="flex-shrink-0 text-slate-400" />
              <span className="text-xs font-medium truncate flex-1">{item.title}</span>
              <span className="text-xs text-slate-500 flex-shrink-0">
                {formatDate(item.updated_at)}
              </span>
            </div>
            {(item.parent_title || item.tags.length > 0) && (
              <div className="flex items-center gap-2 mt-1 ml-5">
                {item.parent_title && (
                  <span className="text-xs text-slate-500 truncate">{item.parent_title}</span>
                )}
                {item.tags.map(tag => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-xs"
                    style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
                  >
                    <TagIcon size={7} />
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))
      )}
    </div>
  );
}
