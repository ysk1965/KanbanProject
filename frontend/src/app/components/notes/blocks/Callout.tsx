import { createReactBlockSpec } from '@blocknote/react';
import { defaultProps } from '@blocknote/core';

const CALLOUT_TYPES = ['info', 'warning', 'success', 'error'] as const;
type CalloutType = typeof CALLOUT_TYPES[number];

const CALLOUT_ICONS: Record<CalloutType, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  success: '✅',
  error: '❌',
};

export const Callout = createReactBlockSpec(
  {
    type: 'callout' as const,
    propSchema: {
      ...defaultProps,
      type: {
        default: 'info' as const,
        values: CALLOUT_TYPES,
      },
    },
    content: 'inline',
  },
  {
    render: (props) => {
      const calloutType = (props.block.props as { type: CalloutType }).type;

      return (
        <div className={`bn-callout bn-callout-${calloutType}`} data-callout-type={calloutType}>
          <button
            className="bn-callout-icon"
            contentEditable={false}
            onClick={() => {
              const idx = CALLOUT_TYPES.indexOf(calloutType);
              const next = CALLOUT_TYPES[(idx + 1) % CALLOUT_TYPES.length];
              props.editor.updateBlock(props.block, {
                props: { type: next } as any,
              });
            }}
            title="Click to change type"
          >
            {CALLOUT_ICONS[calloutType]}
          </button>
          <div className="bn-callout-text" ref={props.contentRef} />
        </div>
      );
    },
    toExternalHTML: (props) => {
      const calloutType = (props.block.props as { type: CalloutType }).type;
      return (
        <div data-callout-type={calloutType} className={`bn-callout bn-callout-${calloutType}`}>
          <span className="bn-callout-icon">{CALLOUT_ICONS[calloutType]}</span>
          <span ref={props.contentRef} />
        </div>
      );
    },
    parse: (el) => {
      const type = el.getAttribute('data-callout-type');
      if (type && CALLOUT_TYPES.includes(type as CalloutType)) {
        return { type: type as CalloutType };
      }
      return undefined;
    },
  }
);
