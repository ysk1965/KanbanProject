import { useTranslation } from "react-i18next";
import { MessageSquarePlus } from "lucide-react";
import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorContentOrSelectionChange,
} from "@blocknote/react";
import { useState } from "react";

interface NoteMemoToolbarButtonProps {
  /** Opens the memo composer for the editor's current selection. */
  onAddMemo: () => void;
}

/**
 * "메모 남기기" button inside BlockNote's own formatting toolbar.
 *
 * Edit mode already shows that toolbar whenever text is selected, so adding a
 * button to it avoids a second floating toolbar fighting it for the same
 * selection (read mode has no formatting toolbar and uses its own).
 */
export function NoteMemoToolbarButton({
  onAddMemo,
}: NoteMemoToolbarButtonProps) {
  const { t } = useTranslation();
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const [enabled, setEnabled] = useState(false);

  useEditorContentOrSelectionChange(() => {
    const sel = editor.prosemirrorView?.state.selection;
    setEnabled(!!sel && !sel.empty);
  }, editor);

  if (!Components) return null;

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      label={t("notes.inlineMemo.add", "메모 남기기")}
      mainTooltip={t("notes.inlineMemo.add", "메모 남기기")}
      icon={<MessageSquarePlus size={16} />}
      isDisabled={!enabled}
      onClick={onAddMemo}
    />
  );
}
