import { useState, useEffect } from 'react';
import { createReactBlockSpec } from '@blocknote/react';

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

function findHeadings(blocks: any[]): HeadingItem[] {
  const headings: HeadingItem[] = [];

  const traverse = (list: any[]) => {
    for (const block of list) {
      if (block.type === 'heading') {
        const text = (block.content || [])
          .map((ic: any) => (ic.type === 'text' ? ic.text : ''))
          .join('');
        if (text.trim()) {
          headings.push({ id: block.id, text, level: block.props?.level ?? 1 });
        }
      }
      if (block.children?.length) {
        traverse(block.children);
      }
    }
  };

  traverse(blocks);
  return headings;
}

function scrollToBlock(blockId: string) {
  const el = document.querySelector(`[data-id="${blockId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export const TableOfContents = createReactBlockSpec(
  {
    type: 'tableOfContents' as const,
    propSchema: {},
    content: 'none',
  },
  {
    render: ({ editor }) => {
      const [headings, setHeadings] = useState<HeadingItem[]>([]);

      useEffect(() => {
        const update = () => setHeadings(findHeadings(editor.document));
        update();

        const tiptap = (editor as any)._tiptapEditor;
        if (tiptap) {
          tiptap.on('update', update);
          return () => tiptap.off('update', update);
        }
      }, [editor]);

      if (headings.length === 0) {
        return (
          <div className="bn-toc bn-toc-empty" contentEditable={false}>
            <span className="bn-toc-label">Table of Contents</span>
            <span className="bn-toc-hint">Add headings to populate this block</span>
          </div>
        );
      }

      return (
        <nav className="bn-toc" contentEditable={false}>
          <div className="bn-toc-label">Table of Contents</div>
          <ul className="bn-toc-list">
            {headings.map((h) => (
              <li
                key={h.id}
                className={`bn-toc-item bn-toc-level-${h.level}`}
                onClick={() => scrollToBlock(h.id)}
              >
                {h.text}
              </li>
            ))}
          </ul>
        </nav>
      );
    },
    toExternalHTML: ({ editor }) => {
      const headings = findHeadings(editor.document);
      return (
        <nav data-block-type="tableOfContents" className="bn-toc">
          <ul>
            {headings.map((h) => (
              <li key={h.id} style={{ marginLeft: `${(h.level - 1) * 16}px` }}>
                {h.text}
              </li>
            ))}
          </ul>
        </nav>
      );
    },
    parse: (el) => {
      if (el.getAttribute('data-block-type') === 'tableOfContents') return {};
      return undefined;
    },
  }
);
