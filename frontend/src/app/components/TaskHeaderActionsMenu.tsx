import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowRightLeft,
  Copy,
  MoreHorizontal,
  Sparkles,
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
  /** 이 카드를 맥에 맡긴다. 자동수정을 쓸 수 없는 보드에서는 undefined다. */
  onDelegate?: () => void;
  /** 러너가 지금 받을 수 있는 상태인가. false면 항목을 감추지 않고 사유와 함께 비활성으로 남긴다. */
  delegateReady?: boolean;
  /** 맡길 수 없을 때 항목 밑에 띄울 한 줄. */
  delegateHint?: string | null;
}

export function TaskHeaderActionsMenu({
  canEdit,
  hasMultipleFeatures,
  onMoveFeature,
  onMoveToBoard,
  onCopyToBoard,
  onDelete,
  onDelegate,
  delegateReady = true,
  delegateHint,
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
          {onDelegate && (
            <>
              <button
                onClick={() => { if (delegateReady) { onDelegate(); setOpen(false); } }}
                disabled={!delegateReady}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-foreground/5 outline-none disabled:opacity-50 disabled:cursor-default"
              >
                <Sparkles className="h-4 w-4 text-bridge-accent" />
                <span className="text-bridge-accent font-bold">
                  {t("autofix.delegateTask", "맥에 맡기기")}
                </span>
              </button>
              {/*
                맡길 수 없어도 항목을 감추지 않는다. 사라지면 기능이 없는 것처럼 보이고,
                사용자는 왜 안 되는지 물어볼 자리를 잃는다.
              */}
              {delegateHint && (
                <p className="px-3 pb-1.5 text-xs text-slate-500 leading-relaxed">
                  {delegateHint}
                </p>
              )}
              <div className="my-1 h-px bg-foreground/[0.08]" />
            </>
          )}
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
