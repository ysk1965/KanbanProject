import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Clock, Tag as TagIcon, AlertCircle, ArrowLeft } from 'lucide-react';
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/shadcn/style.css';
import { publicNoteAPI } from '../utils/api';
import type { SharedNote } from '../utils/api';
import { formatDateTime } from '../utils/dateUtils';
import { Callout } from '../components/notes/blocks/Callout';
import { Toggle } from '../components/notes/blocks/Toggle';
import { Divider } from '../components/notes/blocks/Divider';
import { TableOfContents } from '../components/notes/blocks/TableOfContents';
import { Embed } from '../components/notes/blocks/Embed';
import { ColumnLayout, Column } from '../components/notes/blocks/ColumnLayout';
import { Mention } from '../components/notes/blocks/Mention';

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: Callout,
    toggle: Toggle,
    divider: Divider,
    tableOfContents: TableOfContents,
    embed: Embed,
    columnLayout: ColumnLayout,
    column: Column,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: Mention,
  },
});

export function SharedNotePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { t } = useTranslation();
  const [note, setNote] = useState<SharedNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const editor = useCreateBlockNote({
    schema,
    tables: {
      cellBackgroundColor: true,
      cellTextColor: true,
      headers: true,
      splitCells: true,
    },
  } as any);

  useEffect(() => {
    if (!shareToken) return;

    const loadNote = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await publicNoteAPI.getSharedNote(shareToken);
        setNote(data);
      } catch (err: any) {
        setError(err?.message || t('notes.shareNotFound', '문서를 찾을 수 없습니다'));
      } finally {
        setLoading(false);
      }
    };

    loadNote();
  }, [shareToken, t]);

  // Load content into editor when note arrives
  useEffect(() => {
    if (!note?.content?.trim() || !editor) return;

    const loadContent = async () => {
      try {
        const blocks = await editor.tryParseHTMLToBlocks(note.content!);
        editor.replaceBlocks(editor.document, blocks);
      } catch (err) {
        console.error('Failed to parse shared note content:', err);
      }
    };

    loadContent();
  }, [note, editor]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent mx-auto mb-4" />
          <p className="text-slate-400 text-sm">{t('app.loading', '로딩 중...')}</p>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            {t('notes.shareNotAvailable', '문서를 볼 수 없습니다')}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {t('notes.shareNotAvailableDesc', '이 공유 링크는 만료되었거나 문서가 삭제되었습니다.')}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl text-sm font-medium hover:bg-bridge-accent/90 transition-colors"
          >
            <ArrowLeft size={14} />
            {t('notes.shareGoHome', '홈으로 이동')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Top bar */}
      <header className="border-b border-foreground/5 bg-bridge-obsidian">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-slate-400 hover:text-foreground transition-colors"
          >
            <img src="/BridgeSpotsIcon.png" alt="BRIDGE" className="h-6 w-6" />
            <span className="text-sm font-semibold text-foreground">BRIDGE</span>
          </Link>
          <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-slate-500">
            <FileText size={12} />
            {t('notes.shareReadOnly', 'READ ONLY')}
          </div>
        </div>
      </header>

      {/* Note content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Title */}
        <h1 className="text-3xl font-bold text-foreground mb-3">
          {note.title}
        </h1>

        {/* Meta */}
        <div className="flex items-center flex-wrap gap-3 mb-6">
          {note.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {note.tags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                >
                  <TagIcon size={8} />
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Clock size={10} />
            {formatDateTime(note.updated_at)}
            {note.author_name && ` · ${note.author_name}`}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-foreground/5 mb-6" />

        {/* BlockNote viewer */}
        <div className="shared-note-viewer">
          <BlockNoteView
            editor={editor}
            theme="dark"
            editable={false}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-foreground/5 mt-16">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <span className="text-[10px] tracking-[0.3em] uppercase text-slate-600">
            Shared via BRIDGE
          </span>
          <a
            href="https://bridgespots.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-bridge-accent transition-colors"
          >
            bridgespots.com
          </a>
        </div>
      </footer>
    </div>
  );
}
