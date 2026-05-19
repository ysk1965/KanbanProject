import { createReactBlockSpec } from "@blocknote/react";

export const Column = createReactBlockSpec(
  {
    type: "column" as const,
    propSchema: {},
    content: "inline",
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
      if (el.getAttribute("data-block-type") === "column") return {};
      return undefined;
    },
  },
);

// Layout is applied via CSS using :has() against BlockNote's stable public
// classes (.bn-block-outer + .bn-block-group). See blocknote-dark.css rules
// under "Column Layout Block". This replaces an earlier useEffect +
// MutationObserver + direct style assignment that crawled BlockNote's
// internal DOM structure with [class*="blockOuter"] substring matches —
// brittle against any CSS class rename.
export const ColumnLayout = createReactBlockSpec(
  {
    type: "columnLayout" as const,
    propSchema: {
      columns: {
        default: 2 as const,
        values: [2, 3] as const,
      },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const cols = (block.props as { columns: number }).columns;

      return (
        <div
          className="bn-column-layout"
          data-columns={cols}
          contentEditable={false}
        >
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
              {cols === 2 ? "3열" : "2열"}
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
          style={{ display: "flex", gap: "12px" }}
        />
      );
    },
    parse: (el) => {
      if (el.getAttribute("data-block-type") === "columnLayout") {
        const cols = parseInt(el.getAttribute("data-columns") || "2", 10);
        return { columns: cols === 3 ? 3 : 2 };
      }
      return undefined;
    },
  },
);
