import { useEffect, useRef, useCallback } from 'react';
import { createReactBlockSpec } from '@blocknote/react';

export const Column = createReactBlockSpec(
  {
    type: 'column' as const,
    propSchema: {},
    content: 'inline',
  },
  {
    render: (props) => (
      <div className="bn-column-block">
        <div className="bn-column-content" ref={props.contentRef} />
      </div>
    ),
    toExternalHTML: (props) => (
      <div data-block-type="column">
        <div ref={props.contentRef} />
      </div>
    ),
    parse: (el) => {
      if (el.getAttribute('data-block-type') === 'column') return {};
      return undefined;
    },
  }
);

export const ColumnLayout = createReactBlockSpec(
  {
    type: 'columnLayout' as const,
    propSchema: {
      columns: {
        default: 2 as const,
        values: [2, 3] as const,
      },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const wrapperRef = useRef<HTMLDivElement>(null);
      const cols = (block.props as { columns: number }).columns;

      const applyLayout = useCallback(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const blockOuter = wrapper.closest('[class*="blockOuter"]');
        if (!blockOuter) return;

        const blockGroup = blockOuter.querySelector(':scope > [class*="blockGroup"]');
        if (blockGroup) {
          const el = blockGroup as HTMLElement;
          el.style.display = 'flex';
          el.style.gap = '12px';

          Array.from(el.children).forEach((child) => {
            const c = child as HTMLElement;
            c.style.flex = '1';
            c.style.minWidth = '0';
          });
        }
      }, []);

      useEffect(() => {
        applyLayout();

        // Re-apply when children change
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const blockOuter = wrapper.closest('[class*="blockOuter"]');
        if (!blockOuter) return;

        const blockGroup = blockOuter.querySelector(':scope > [class*="blockGroup"]');
        if (!blockGroup) return;

        const observer = new MutationObserver(applyLayout);
        observer.observe(blockGroup, { childList: true });
        return () => observer.disconnect();
      }, [applyLayout]);

      return (
        <div ref={wrapperRef} className="bn-column-layout" contentEditable={false}>
          <div className="bn-column-layout-header">
            <span className="bn-column-layout-label">{cols} Columns</span>
            <button
              className="bn-column-layout-toggle"
              onClick={() => {
                const next = cols === 2 ? 3 : 2;
                editor.updateBlock(block, {
                  props: { columns: next } as any,
                });
              }}
            >
              {cols === 2 ? '3열' : '2열'}
            </button>
          </div>
        </div>
      );
    },
    toExternalHTML: ({ block }) => {
      const cols = (block.props as { columns: number }).columns;
      return (
        <div
          data-block-type="columnLayout"
          data-columns={cols}
          style={{ display: 'flex', gap: '12px' }}
        />
      );
    },
    parse: (el) => {
      if (el.getAttribute('data-block-type') === 'columnLayout') {
        const cols = parseInt(el.getAttribute('data-columns') || '2', 10);
        return { columns: (cols === 3 ? 3 : 2) };
      }
      return undefined;
    },
  }
);
