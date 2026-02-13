import { createReactInlineContentSpec } from '@blocknote/react';

export const Mention = createReactInlineContentSpec(
  {
    type: 'mention' as const,
    propSchema: {
      user: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <span
        className="bn-mention"
        data-user={props.inlineContent.props.user}
        contentEditable={false}
      >
        @{props.inlineContent.props.user}
      </span>
    ),
  }
);
