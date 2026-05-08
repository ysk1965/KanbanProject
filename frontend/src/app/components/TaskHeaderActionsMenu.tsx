import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowRightLeft,
  Copy,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

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

  if (!canEdit) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-foreground hover:bg-foreground/10"
          title={t("task.moreActions")}
          aria-label={t("task.moreActions")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-[200px] bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl p-1"
      >
        {hasMultipleFeatures && (
          <DropdownMenuItem
            onClick={onMoveFeature}
            className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-foreground/5 focus:bg-foreground/5 outline-none"
          >
            <ArrowRightLeft className="h-4 w-4 text-slate-400" />
            <span className="text-foreground">{t("task.moveFeature")}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={onMoveToBoard}
          className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-foreground/5 focus:bg-foreground/5 outline-none"
        >
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <span className="text-foreground">{t("task.moveToBoard")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onCopyToBoard}
          className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-foreground/5 focus:bg-foreground/5 outline-none"
        >
          <Copy className="h-4 w-4 text-slate-400" />
          <span className="text-foreground">{t("task.copyToBoard")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 h-px bg-foreground/[0.08]" />
        <DropdownMenuItem
          onClick={onDelete}
          className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg hover:bg-red-500/10 focus:bg-red-500/10 outline-none text-red-400"
        >
          <Trash2 className="h-4 w-4" />
          <span>{t("common.delete")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
