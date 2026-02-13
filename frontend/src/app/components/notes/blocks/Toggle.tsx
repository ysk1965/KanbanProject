import { useState, useEffect, useRef } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { defaultProps } from '@blocknote/core';

export const Toggle = createReactBlockSpec(
  {
    type: 'toggle' as const,
    propSchema: {
      ...defaultProps,
    },
    content: 'inline',
  },
  {
    render: (props) => {
      const [isOpen, setIsOpen] = useState(true);
      const wrapperRef = useRef<HTMLDivElement>(null);

      useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const blockOuter = wrapper.closest('[class*="blockOuter"]');
        if (!blockOuter) return;

        const blockGroup = blockOuter.querySelector(':scope > [class*="blockGroup"]');
        if (blockGroup) {
          (blockGroup as HTMLElement).style.display = isOpen ? '' : 'none';
        }
      }, [isOpen]);

      return (
        <div ref={wrapperRef} className="bn-toggle" data-open={isOpen}>
          <button
            className="bn-toggle-btn"
            contentEditable={false}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              style={{
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s ease',
              }}
            >
              <path
                d="M6 4l4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="bn-toggle-content" ref={props.contentRef} />
        </div>
      );
    },
    toExternalHTML: (props) => (
      <details open data-block-type="toggle">
        <summary><span ref={props.contentRef} /></summary>
      </details>
    ),
    parse: (el) => {
      if (el.tagName === 'DETAILS') return {};
      if (el.getAttribute('data-block-type') === 'toggle') return {};
      return undefined;
    },
  }
);
