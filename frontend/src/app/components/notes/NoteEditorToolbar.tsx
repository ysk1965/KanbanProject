import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Code, Minus, Link as LinkIcon,
  Image, AlignLeft, AlignCenter, AlignRight,
  Highlighter, Palette, Table as TableIcon,
  Undo2, Redo2,
} from 'lucide-react';
import { fileAPI } from '../../utils/api';

interface NoteEditorToolbarProps {
  editor: Editor | null;
}

const TEXT_COLORS = [
  '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#94a3b8', '#6366f1',
];

const HIGHLIGHT_COLORS = [
  'transparent', '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0',
  '#bfdbfe', '#ddd6fe', '#fbcfe8', '#e2e8f0', '#c7d2fe',
];

export function NoteEditorToolbar({ editor }: NoteEditorToolbarProps) {
  const { t } = useTranslation();

  const handleImageUpload = useCallback(async () => {
    if (!editor) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const result = await fileAPI.smartUpload(file);
        if (result.previewUrl) {
          editor.chain().focus().setImage({ src: result.previewUrl }).run();
        }
      } catch (err) {
        console.error('Image upload failed:', err);
      }
    };
    input.click();
  }, [editor]);

  const handleSetLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const handleInsertTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 flex-wrap px-4 py-2 border-b border-white/5 bg-bridge-obsidian/50">
      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo2 size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo2 size={14} />
      </ToolbarButton>

      <Divider />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      >
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      >
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="Underline"
      >
        <Underline size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough size={14} />
      </ToolbarButton>

      <Divider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <Heading1 size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <Heading3 size={14} />
      </ToolbarButton>

      <Divider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Ordered List"
      >
        <ListOrdered size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        title="Checklist"
      >
        <ListChecks size={14} />
      </ToolbarButton>

      <Divider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Quote"
      >
        <Quote size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code Block"
      >
        <Code size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Divider"
      >
        <Minus size={14} />
      </ToolbarButton>

      <Divider />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        active={editor.isActive({ textAlign: 'left' })}
        title="Align Left"
      >
        <AlignLeft size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        active={editor.isActive({ textAlign: 'center' })}
        title="Align Center"
      >
        <AlignCenter size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        active={editor.isActive({ textAlign: 'right' })}
        title="Align Right"
      >
        <AlignRight size={14} />
      </ToolbarButton>

      <Divider />

      {/* Colors */}
      <ColorPicker
        colors={TEXT_COLORS}
        icon={<Palette size={14} />}
        title="Text Color"
        onSelect={(color) => editor.chain().focus().setColor(color).run()}
      />
      <ColorPicker
        colors={HIGHLIGHT_COLORS}
        icon={<Highlighter size={14} />}
        title="Highlight"
        onSelect={(color) => {
          if (color === 'transparent') {
            editor.chain().focus().unsetHighlight().run();
          } else {
            editor.chain().focus().toggleHighlight({ color }).run();
          }
        }}
      />

      <Divider />

      {/* Insert */}
      <ToolbarButton onClick={handleSetLink} active={editor.isActive('link')} title="Link">
        <LinkIcon size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={handleImageUpload} title="Image">
        <Image size={14} />
      </ToolbarButton>
      <ToolbarButton onClick={handleInsertTable} title="Table">
        <TableIcon size={14} />
      </ToolbarButton>
    </div>
  );
}

// Sub-components

function ToolbarButton({ onClick, active, disabled, title, children }: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-bridge-accent/20 text-bridge-accent'
          : disabled
            ? 'text-slate-600 cursor-not-allowed'
            : 'text-slate-400 hover:text-white hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-white/10 mx-0.5" />;
}

function ColorPicker({ colors, icon, title, onSelect }: {
  colors: string[];
  icon: React.ReactNode;
  title: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="relative group">
      <button
        title={title}
        className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        {icon}
      </button>
      <div className="absolute top-full left-0 mt-1 hidden group-hover:grid grid-cols-5 gap-1 p-2 bg-bridge-obsidian border border-white/10 rounded-lg shadow-xl z-50 min-w-[120px]">
        {colors.map((color, i) => (
          <button
            key={i}
            onClick={() => onSelect(color)}
            className="w-5 h-5 rounded border border-white/10 hover:scale-110 transition-transform"
            style={{ backgroundColor: color === 'transparent' ? 'transparent' : color }}
          >
            {color === 'transparent' && <span className="text-[8px] text-slate-500">✕</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
