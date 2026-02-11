import { useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Trash2,
  TableCellsMerge,
  TableCellsSplit,
  PaintBucket,
  ToggleLeft,
  Rows3,
  Columns3,
} from 'lucide-react';

interface TableBubbleMenuProps {
  editor: Editor;
}

const CELL_BG_COLORS = [
  'transparent',
  'rgba(99,102,241,0.15)',
  'rgba(45,212,191,0.15)',
  'rgba(239,68,68,0.15)',
  'rgba(234,179,8,0.15)',
  'rgba(34,197,94,0.15)',
  'rgba(59,130,246,0.15)',
  'rgba(168,85,247,0.15)',
  'rgba(236,72,153,0.15)',
  'rgba(255,255,255,0.05)',
];

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  const shouldShow = useCallback(({ editor: e }: { editor: Editor }) => {
    return e.isActive('table');
  }, []);

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableBubbleMenu"
      shouldShow={shouldShow}
      updateDelay={100}
      options={{
        placement: 'bottom',
        offset: { mainAxis: 8, crossAxis: 0 },
      }}
      className="flex items-center gap-0.5 px-2 py-1.5 bg-bridge-obsidian border border-white/10 rounded-xl shadow-2xl z-50"
    >
      {/* Row operations */}
      <BtnIcon
        title="Add row before"
        icon={<ArrowUpToLine size={13} />}
        onClick={() => editor.chain().focus().addRowBefore().run()}
      />
      <BtnIcon
        title="Add row after"
        icon={<ArrowDownToLine size={13} />}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      />
      <BtnIcon
        title="Delete row"
        icon={<Rows3 size={13} />}
        onClick={() => editor.chain().focus().deleteRow().run()}
        danger
      />

      <Divider />

      {/* Column operations */}
      <BtnIcon
        title="Add column before"
        icon={<ArrowLeftToLine size={13} />}
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      />
      <BtnIcon
        title="Add column after"
        icon={<ArrowRightToLine size={13} />}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      />
      <BtnIcon
        title="Delete column"
        icon={<Columns3 size={13} />}
        onClick={() => editor.chain().focus().deleteColumn().run()}
        danger
      />

      <Divider />

      {/* Merge / Split */}
      <BtnIcon
        title="Merge cells"
        icon={<TableCellsMerge size={13} />}
        onClick={() => editor.chain().focus().mergeCells().run()}
        disabled={!editor.can().mergeCells()}
      />
      <BtnIcon
        title="Split cell"
        icon={<TableCellsSplit size={13} />}
        onClick={() => editor.chain().focus().splitCell().run()}
        disabled={!editor.can().splitCell()}
      />

      <Divider />

      {/* Cell background color */}
      <CellColorPicker editor={editor} />

      <Divider />

      {/* Header toggles */}
      <BtnIcon
        title="Toggle header row"
        icon={<ToggleLeft size={13} />}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        active={isHeaderRowActive(editor)}
      />
      <BtnIcon
        title="Toggle header column"
        icon={<ToggleLeft size={13} className="rotate-90" />}
        onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
        active={isHeaderColumnActive(editor)}
      />

      <Divider />

      {/* Delete table */}
      <BtnIcon
        title="Delete table"
        icon={<Trash2 size={13} />}
        onClick={() => editor.chain().focus().deleteTable().run()}
        danger
      />
    </BubbleMenu>
  );
}

function isHeaderRowActive(editor: Editor): boolean {
  return editor.isActive('tableHeader');
}

function isHeaderColumnActive(editor: Editor): boolean {
  // Check if the current resolved position is in a header cell in a non-first row context
  // Simple heuristic: just check if tableHeader is active
  return editor.isActive('tableHeader');
}

function BtnIcon({ icon, onClick, title, active, disabled, danger }: {
  icon: React.ReactNode;
  onClick: () => void;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        disabled
          ? 'text-slate-700 cursor-not-allowed'
          : active
            ? 'bg-bridge-accent/20 text-bridge-accent'
            : danger
              ? 'text-slate-400 hover:text-red-400 hover:bg-red-400/10'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
      }`}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-white/10 mx-0.5" />;
}

function CellColorPicker({ editor }: { editor: Editor }) {
  return (
    <div className="relative group">
      <button
        title="Cell color"
        className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
      >
        <PaintBucket size={13} />
      </button>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:grid grid-cols-5 gap-1 p-2 bg-bridge-obsidian border border-white/10 rounded-lg shadow-xl z-50 min-w-[120px]">
        {CELL_BG_COLORS.map((color, i) => (
          <button
            key={i}
            onClick={() => {
              if (color === 'transparent') {
                editor.chain().focus().setCellAttribute('backgroundColor', null).run();
              } else {
                editor.chain().focus().setCellAttribute('backgroundColor', color).run();
              }
            }}
            className="w-5 h-5 rounded border border-white/10 hover:scale-110 transition-transform"
            style={{ backgroundColor: color === 'transparent' ? 'transparent' : color }}
          >
            {color === 'transparent' && <span className="text-[8px] text-slate-500">&#x2715;</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
