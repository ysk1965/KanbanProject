import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, FolderPlus, FilePlus, Search, List, FolderTree, Loader2, Menu } from 'lucide-react';
import { NoteTreeSidebar } from './NoteTreeSidebar';
import { NoteEditor } from './NoteEditor';
import { NoteListView } from './NoteListView';
import { noteService } from '../../utils/services';
import { useAuth } from '../../contexts/AuthContext';
import { useCollaboration } from '../../hooks/useCollaboration';
import { getAssigneeHex } from '../../utils/assigneeColor';
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet';
import type { NoteTreeItem, NoteDetail, NoteListItem, NoteTagInfo } from '../../utils/api';

interface NotesViewProps {
  boardId: string;
  currentUserRole: string;
}

export function NotesView({ boardId, currentUserRole }: NotesViewProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [tree, setTree] = useState<NoteTreeItem[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null);
  const [tags, setTags] = useState<NoteTagInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteLoading, setNoteLoading] = useState(false);
  const [viewType, setViewType] = useState<'tree' | 'list'>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const hasUnsavedChangesRef = useRef(false);

  const isViewer = currentUserRole === 'viewer';
  const canEdit = !isViewer;

  const userName = currentUser?.name || 'Anonymous';
  const userColor = useMemo(() => getAssigneeHex(userName), [userName]);

  // Real-time collaboration for the selected note
  const collaboration = useCollaboration({
    noteId: selectedNoteId || '',
    userName,
    userColor,
    enabled: !!selectedNoteId && selectedNote?.type === 'DOCUMENT',
  });

  const loadTree = useCallback(async () => {
    try {
      const data = await noteService.getTree(boardId);
      setTree(data);
    } catch (err) {
      console.error('Failed to load note tree:', err);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  const loadTags = useCallback(async () => {
    try {
      const data = await noteService.getTags(boardId);
      setTags(data);
    } catch (err) {
      console.error('Failed to load note tags:', err);
    }
  }, [boardId]);

  useEffect(() => {
    loadTree();
    loadTags();
  }, [loadTree, loadTags]);

  const handleDirtyChange = useCallback((isDirty: boolean) => {
    hasUnsavedChangesRef.current = isDirty;
  }, []);

  const handleSelectNote = useCallback(async (noteId: string) => {
    if (noteId === selectedNoteId) return;

    if (hasUnsavedChangesRef.current) {
      if (!window.confirm(t('notes.unsavedWarning', '저장하지 않은 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?'))) {
        return;
      }
    }

    setSelectedNoteId(noteId);
    setNoteLoading(true);
    setMobileSidebarOpen(false);
    try {
      const detail = await noteService.getDetail(boardId, noteId);
      setSelectedNote(detail);
    } catch (err) {
      console.error('Failed to load note detail:', err);
    } finally {
      setNoteLoading(false);
    }
  }, [boardId, selectedNoteId, t]);

  const handleCreateFolder = useCallback(async (parentId?: string | null) => {
    if (!canEdit) return;
    try {
      const title = t('notes.newFolder', '새 폴더');
      await noteService.create(boardId, {
        title,
        type: 'FOLDER',
        parentId: parentId || null,
      });
      await loadTree();
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, [boardId, canEdit, loadTree, t]);

  const handleCreateDocument = useCallback(async (parentId?: string | null) => {
    if (!canEdit) return;
    try {
      const title = t('notes.newDocument', '새 문서');
      const created = await noteService.create(boardId, {
        title,
        type: 'DOCUMENT',
        parentId: parentId || null,
      });
      await loadTree();
      hasUnsavedChangesRef.current = false;
      handleSelectNote(created.id);
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  }, [boardId, canEdit, loadTree, handleSelectNote, t]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    try {
      await noteService.delete(boardId, noteId);
      if (selectedNoteId === noteId) {
        setSelectedNoteId(null);
        setSelectedNote(null);
        hasUnsavedChangesRef.current = false;
      }
      await loadTree();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  }, [boardId, selectedNoteId, loadTree]);

  const handleRenameNote = useCallback(async (noteId: string, newTitle: string) => {
    try {
      await noteService.update(boardId, noteId, { title: newTitle }, false);
      await loadTree();
      if (selectedNoteId === noteId && selectedNote) {
        setSelectedNote({ ...selectedNote, title: newTitle });
      }
    } catch (err) {
      console.error('Failed to rename note:', err);
    }
  }, [boardId, selectedNoteId, selectedNote, loadTree]);

  const handleSaveNote = useCallback(async (
    noteId: string,
    data: { title?: string; content?: string; tagIds?: string[] },
    createVersion = true
  ) => {
    try {
      const updated = await noteService.update(boardId, noteId, data, createVersion);
      setSelectedNote(updated);
      await loadTree();
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }, [boardId, loadTree]);

  const handleMoveNote = useCallback(async (noteId: string, parentId: string | null, position: number) => {
    try {
      await noteService.move(boardId, noteId, { parentId, position });
      await loadTree();
    } catch (err) {
      console.error('Failed to move note:', err);
    }
  }, [boardId, loadTree]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  const sidebarContent = (
    <>
      {/* Sidebar Header */}
      <div className="p-4 border-b border-foreground/5 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <FileText size={18} className="text-bridge-accent" />
            {t('notes.title', '노트')}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewType('tree')}
              className={`p-1.5 rounded transition-colors ${viewType === 'tree' ? 'text-bridge-accent bg-bridge-accent/10' : 'text-slate-400 hover:text-foreground'}`}
              title={t('notes.treeView', '트리 뷰')}
            >
              <FolderTree size={16} />
            </button>
            <button
              onClick={() => setViewType('list')}
              className={`p-1.5 rounded transition-colors ${viewType === 'list' ? 'text-bridge-accent bg-bridge-accent/10' : 'text-slate-400 hover:text-foreground'}`}
              title={t('notes.listView', '리스트 뷰')}
            >
              <List size={16} />
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('notes.searchPlaceholder', '검색...')}
            className="w-full bg-foreground/5 border border-foreground/10 rounded-lg py-2 pl-9 pr-3 text-sm text-foreground placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
        {/* Create Actions */}
        {canEdit && (
          <div className="flex gap-1.5 mt-3">
            <button
              onClick={() => handleCreateDocument(null)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <FilePlus size={15} />
              {t('notes.newDocument', '새 문서')}
            </button>
            <button
              onClick={() => handleCreateFolder(null)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <FolderPlus size={15} />
              {t('notes.newFolder', '새 폴더')}
            </button>
          </div>
        )}
      </div>

      {/* Tree or List Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {viewType === 'tree' ? (
          <NoteTreeSidebar
            tree={tree}
            selectedNoteId={selectedNoteId}
            searchQuery={searchQuery}
            onSelect={handleSelectNote}
            onCreateFolder={handleCreateFolder}
            onCreateDocument={handleCreateDocument}
            onDelete={handleDeleteNote}
            onRename={handleRenameNote}
            onMove={handleMoveNote}
            canEdit={canEdit}
          />
        ) : (
          <NoteListView
            boardId={boardId}
            selectedNoteId={selectedNoteId}
            searchQuery={searchQuery}
            onSelect={handleSelectNote}
            tags={tags}
          />
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-[340px] flex-shrink-0 border-r border-foreground/5 bg-bridge-dark flex-col">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-bridge-dark border-foreground/10 flex flex-col">
          <SheetTitle className="sr-only">{t('notes.title', '노트')}</SheetTitle>
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Right Content - Editor */}
      <div className="flex-1 flex flex-col overflow-hidden bg-bridge-dark">
        {selectedNote ? (
          <>
            {/* Mobile top bar with sidebar toggle */}
            <div className="flex md:hidden items-center gap-2 px-3 py-2 border-b border-foreground/5">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <Menu size={18} />
              </button>
              <span className="text-sm text-foreground font-medium truncate">{selectedNote.title}</span>
            </div>
            <NoteEditor
              boardId={boardId}
              note={selectedNote}
              tags={tags}
              loading={noteLoading}
              canEdit={canEdit}
              onSave={handleSaveNote}
              onTagsChange={loadTags}
              onDirtyChange={handleDirtyChange}
              onNoteUpdate={(updated) => setSelectedNote(updated)}
              collaboration={collaboration}
              currentUserName={userName}
              currentUserColor={userColor}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            {/* Mobile: show sidebar toggle when no note selected */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden mb-4 p-2 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Menu size={24} />
            </button>
            <FileText size={48} className="mb-4 opacity-30" />
            <p className="text-sm">{t('notes.selectOrCreate', '문서를 선택하거나 새로 만들어주세요')}</p>
            {canEdit && (
              <button
                onClick={() => handleCreateDocument(null)}
                className="mt-4 px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-semibold hover:bg-bridge-accent/90 transition-all"
              >
                <FilePlus size={14} className="inline mr-1.5" />
                {t('notes.createFirstDocument', '첫 문서 만들기')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
