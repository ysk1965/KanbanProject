import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowRightLeft,
  Copy,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";

interface TaskHeaderActionsMenuProps {
  canEdit: boolean;
  hasMultipleFeatures: boolean;
  onMoveFeature: () => void;
  onMoveToBoard: () => void;
  onCopyToBoard: () => void;
  onDelete: () => void;
}

export function TaskHeaderActionsMenu({
  canEdit,
  hasMultipleFeatures,
  onMoveFeature,
  onMoveToBoard,
  onCopyToBoard,
  onDelete,
}: TaskHeaderActionsMenuProps) {
  const { t } = useTranslation();
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

  if (!canEdit) return null;

  const items = [
    ...(hasMultipleFeatures
      ? [{ icon: ArrowRightLeft, label: t("task.moveFeature"), onClick: onMoveFeature }]
      : []),
    { icon: ArrowRight, label: t("task.moveToBoard"), onClick: onMoveToBoard },
    { icon: Copy, label: t("task.copyToBoard"), onClick: onCopyToBoard },
  ];

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="sm"
        className="text-slate-400 hover:text-foreground hover:bg-foreground/10"
        title={t("task.moreActions")}
        aria-label={t("task.moreActions")}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl p-1">
          {items.map(({ icon: Icon, label, onClick }) => (
            <button
              key={label}
              onClick={() => { onClick(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-foreground/5 outline-none"
            >
              <Icon className="h-4 w-4 text-slate-400" />
              <span className="text-foreground">{label}</span>
            </button>
          ))}
          <div className="my-1 h-px bg-foreground/[0.08]" />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-red-500/10 outline-none text-red-400"
          >
            <Trash2 className="h-4 w-4" />
            <span>{t("common.delete")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
