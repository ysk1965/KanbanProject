import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, CheckCircle2, ChevronDown, Layers } from "lucide-react";
import type { Block } from "../types";

interface BlockStatusPickerProps {
  blocks: Block[];
  currentBlockId: string;
  currentBlockName?: string;
  canEdit: boolean;
  onSelectBlock: (blockId: string) => void;
  onSelectDone: () => void;
}

export function BlockStatusPicker({
  blocks,
  currentBlockId,
  currentBlockName,
  canEdit,
  onSelectBlock,
  onSelectDone,
}: BlockStatusPickerProps) {
  const { t } = useTranslation();

  const doneBlock = blocks.find((b) => b.fixed_type === "DONE");
  const isCurrentlyDone = doneBlock?.id === currentBlockId;
  const selectableBlocks = blocks.filter(
    (b) => b.fixed_type !== "FEATURE" && b.fixed_type !== "DONE",
  );

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!canEdit) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-foreground/10 text-muted-foreground border border-foreground/10">
        <Layers className="h-3 w-3" />
        {currentBlockName}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-foreground/10 text-foreground border border-foreground/10 hover:bg-foreground/[0.15] hover:border-foreground/15 transition-colors"
        title={t("task.changeStatus")}
        aria-label={t("task.changeStatus")}
      >
        <Layers className="h-3 w-3" />
        {currentBlockName}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[200px] bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl p-1">
          {selectableBlocks.map((block) => {
            const isCurrent = block.id === currentBlockId;
            return (
              <button
                key={block.id}
                disabled={isCurrent}
                onClick={() => {
                  if (!isCurrent) {
                    onSelectBlock(block.id);
                    setOpen(false);
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg outline-none ${
                  isCurrent
                    ? "text-foreground cursor-default"
                    : "text-foreground cursor-pointer hover:bg-foreground/5"
                }`}
              >
                {isCurrent ? (
                  <Check className="h-4 w-4 text-bridge-accent" />
                ) : (
                  <Layers className="h-4 w-4 text-slate-400" />
                )}
                <span>{block.name}</span>
              </button>
            );
          })}
          {doneBlock && (
            <>
              <div className="my-1 h-px bg-foreground/[0.08]" />
              <button
                disabled={isCurrentlyDone}
                onClick={() => {
                  if (!isCurrentlyDone) {
                    onSelectDone();
                    setOpen(false);
                  }
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg outline-none text-emerald-400 ${
                  isCurrentlyDone
                    ? "cursor-default opacity-70"
                    : "cursor-pointer hover:bg-emerald-500/10"
                }`}
              >
                {isCurrentlyDone ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                <span className="font-bold">{t("task.markComplete")}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
