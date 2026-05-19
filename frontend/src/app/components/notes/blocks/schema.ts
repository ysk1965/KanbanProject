import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { Callout } from "./Callout";
import { Toggle } from "./Toggle";
import { Divider } from "./Divider";
import { TableOfContents } from "./TableOfContents";
import { Embed } from "./Embed";
import { ColumnLayout, Column } from "./ColumnLayout";
import { Mention } from "./Mention";

// Single source of truth for the BlockNote schema used across the note editor,
// the read-only shared page, and version history conversion. Keeping this in
// one module guarantees that JSON written by the editor round-trips through
// every consumer (custom blocks resolve to their specs instead of silently
// downgrading to generic paragraph/div).
export const noteSchema = BlockNoteSchema.create({
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
