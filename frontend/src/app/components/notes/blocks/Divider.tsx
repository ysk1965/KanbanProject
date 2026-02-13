import { createReactBlockSpec } from '@blocknote/react';

export const Divider = createReactBlockSpec(
  {
    type: 'divider' as const,
    propSchema: {},
    content: 'none',
  },
  {
    render: () => (
      <div className="bn-divider" contentEditable={false}>
        <hr />
      </div>
    ),
    toExternalHTML: () => (
      <hr data-block-type="divider" />
    ),
    parse: (el) => {
      if (el.tagName === 'HR') return {};
      if (el.getAttribute('data-block-type') === 'divider') return {};
      return undefined;
    },
  }
);
