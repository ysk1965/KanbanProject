import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Trash2,
  RotateCcw,
  Loader2,
  X,
  ListChecks,
  Layers,
  GitBranch,
} from "lucide-react";
import { MotionModal } from "../ui/MotionModal";
import { IconButton } from "../ui/IconButton";
import { trashAPI } from "../../utils/api";
import { formatRelativeTime } from "../../utils/dateUtils";
import type {
  TrashListResponse,
  TrashFeatureItem,
  TrashTaskItem,
  TrashChecklistItemEntry,
} from "../../types";

type Tab = "features" | "tasks" | "checklists";

interface BoardTrashViewProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  /** 복구 후 부모에게 보드 데이터 재로딩 알림 */
  onRestored: () => void;
}

export function BoardTrashView({
  open,
  onClose,
  boardId,
  onRestored,
}: BoardTrashViewProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("features");
  const [data, setData] = useState<TrashListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const load = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const res = await trashAPI.list(boardId);
      setData(res);
    } catch (e) {
      console.error("Failed to load trash:", e);
      toast.error(t("trash.loadFailed", "휴지통을 불러오지 못했습니다"));
    } finally {
      setLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    if (open) {
      load();
    } else {
      setConfirmEmpty(false);
    }
  }, [open, load]);

  const counts = useMemo(
    () => ({
      features: data?.features.length ?? 0,
      tasks: data?.tasks.length ?? 0,
      checklists: data?.checklist_items.length ?? 0,
    }),
    [data],
  );

  const retentionDays = data?.retention_days ?? 30;

  const remainingDays = (deletedAt: string) => {
    const ms = Date.now() - new Date(deletedAt).getTime();
    const passed = Math.floor(ms / (1000 * 60 * 60 * 24));
    return Math.max(0, retentionDays - passed);
  };

  const handleRestore = async (kind: Tab, id: string) => {
    if (!boardId) return;
    setBusyId(id);
    try {
      if (kind === "features") await trashAPI.restoreFeature(boardId, id);
      else if (kind === "tasks") await trashAPI.restoreTask(boardId, id);
      else await trashAPI.restoreChecklistItem(boardId, id);
      toast.success(t("trash.toast.restored", "복구되었습니다"));
      await load();
      onRestored();
    } catch (e) {
      console.error("Restore failed:", e);
      toast.error(t("trash.toast.restoreFailed", "복구에 실패했습니다"));
    } finally {
      setBusyId(null);
    }
  };

  const handlePermanentDelete = async (kind: Tab, id: string) => {
    if (!boardId) return;
    if (
      !confirm(
        t(
          "trash.confirmPermanent",
          "영구 삭제하시겠습니까? 되돌릴 수 없습니다.",
        ),
      )
    )
      return;
    setBusyId(id);
    try {
      if (kind === "features")
        await trashAPI.permanentlyDeleteFeature(boardId, id);
      else if (kind === "tasks")
        await trashAPI.permanentlyDeleteTask(boardId, id);
      else await trashAPI.permanentlyDeleteChecklistItem(boardId, id);
      toast.success(t("trash.toast.permanentlyDeleted", "영구 삭제되었습니다"));
      await load();
    } catch (e) {
      console.error("Permanent delete failed:", e);
      toast.error(
        t("trash.toast.permanentDeleteFailed", "영구 삭제에 실패했습니다"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleEmptyAll = async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      await trashAPI.emptyTrash(boardId);
      toast.success(t("trash.toast.emptied", "휴지통을 비웠습니다"));
      await load();
    } catch (e) {
      console.error("Empty trash failed:", e);
      toast.error(t("trash.toast.emptyFailed", "휴지통 비우기에 실패했습니다"));
    } finally {
      setLoading(false);
      setConfirmEmpty(false);
    }
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className="w-full sm:max-w-2xl bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl"
      accentColor
      aria-label={t("trash.title", "휴지통")}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-bridge-accent" />
          <h2 className="text-sm font-bold text-foreground tracking-tight">
            {t("trash.title", "휴지통")}
          </h2>
          <span className="text-xs text-slate-500 ml-1">
            {t("trash.retentionInfo", "{{days}}일간 보관", {
              days: retentionDays,
            })}
          </span>
        </div>
        <IconButton aria-label={t("common.close", "닫기")} onClick={onClose}>
          <X className="w-4 h-4" />
        </IconButton>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 pt-3">
        {(
          [
            {
              key: "features",
              label: t("trash.tabs.features", "피처"),
              icon: Layers,
              count: counts.features,
            },
            {
              key: "tasks",
              label: t("trash.tabs.tasks", "태스크"),
              icon: GitBranch,
              count: counts.tasks,
            },
            {
              key: "checklists",
              label: t("trash.tabs.checklists", "체크리스트"),
              icon: ListChecks,
              count: counts.checklists,
            },
          ] as const
        ).map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === key
                ? "bg-bridge-accent/15 text-bridge-accent"
                : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            <span className="ml-0.5 text-xs font-bold opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : tab === "features" ? (
          <FeatureList
            items={data?.features ?? []}
            busyId={busyId}
            onRestore={(id) => handleRestore("features", id)}
            onPermanentDelete={(id) => handlePermanentDelete("features", id)}
            remainingDays={remainingDays}
          />
        ) : tab === "tasks" ? (
          <TaskList
            items={data?.tasks ?? []}
            busyId={busyId}
            onRestore={(id) => handleRestore("tasks", id)}
            onPermanentDelete={(id) => handlePermanentDelete("tasks", id)}
            remainingDays={remainingDays}
          />
        ) : (
          <ChecklistList
            items={data?.checklist_items ?? []}
            busyId={busyId}
            onRestore={(id) => handleRestore("checklists", id)}
            onPermanentDelete={(id) => handlePermanentDelete("checklists", id)}
            remainingDays={remainingDays}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          {t("trash.escClose", "Esc 닫기")}
        </span>
        {confirmEmpty ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {t("trash.emptyConfirm", "정말 모두 영구 삭제할까요?")}
            </span>
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors"
              onClick={() => setConfirmEmpty(false)}
            >
              {t("common.cancel", "취소")}
            </button>
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors"
              onClick={handleEmptyAll}
            >
              {t("trash.emptyConfirmYes", "모두 영구 삭제")}
            </button>
          </div>
        ) : (
          <button
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
            onClick={() => setConfirmEmpty(true)}
            disabled={counts.features + counts.tasks + counts.checklists === 0}
          >
            {t("trash.emptyAll", "휴지통 비우기")}
          </button>
        )}
      </div>
    </MotionModal>
  );
}

// ==================== Sub-components ====================

interface RowProps {
  busyId: string | null;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  remainingDays: (deletedAt: string) => number;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-slate-500 text-xs">{message}</div>
  );
}

function ItemRow({
  id,
  title,
  meta,
  deletedAt,
  busyId,
  onRestore,
  onPermanentDelete,
  remainingDays,
  disabledHint,
}: {
  id: string;
  title: string;
  meta: string;
  deletedAt: string;
  busyId: string | null;
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  remainingDays: (deletedAt: string) => number;
  disabledHint?: string;
}) {
  const { t } = useTranslation();
  const isBusy = busyId === id;
  const days = remainingDays(deletedAt);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-foreground truncate">
          {title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
          <span className="truncate">{meta}</span>
          <span aria-hidden>·</span>
          <span>{formatRelativeTime(deletedAt)}</span>
          <span aria-hidden>·</span>
          <span>{t("trash.daysRemaining", "{{days}}일 남음", { days })}</span>
        </div>
        {disabledHint && (
          <div className="mt-1 text-xs text-amber-500">{disabledHint}</div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onRestore(id)}
          disabled={isBusy || !!disabledHint}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-500 hover:bg-emerald-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isBusy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
          {t("trash.restore", "복구")}
        </button>
        <button
          onClick={() => onPermanentDelete(id)}
          disabled={isBusy}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
          aria-label={t("trash.permanentDelete", "영구 삭제")}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function FeatureList({
  items,
  ...props
}: RowProps & { items: TrashFeatureItem[] }) {
  const { t } = useTranslation();
  if (items.length === 0)
    return (
      <EmptyState
        message={t("trash.empty.features", "삭제된 피처가 없습니다")}
      />
    );
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <ItemRow
          key={it.id}
          id={it.id}
          title={it.title}
          meta={t("trash.featureMeta", "{{completed}}/{{total}} 태스크", {
            completed: it.completed_tasks,
            total: it.total_tasks,
          })}
          deletedAt={it.deleted_at}
          {...props}
        />
      ))}
    </div>
  );
}

function TaskList({ items, ...props }: RowProps & { items: TrashTaskItem[] }) {
  const { t } = useTranslation();
  if (items.length === 0)
    return (
      <EmptyState
        message={t("trash.empty.tasks", "삭제된 태스크가 없습니다")}
      />
    );
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <ItemRow
          key={it.id}
          id={it.id}
          title={it.title}
          meta={
            it.feature_title || t("trash.unknownFeature", "알 수 없는 피처")
          }
          deletedAt={it.deleted_at}
          disabledHint={
            it.part_of_deleted_feature
              ? t(
                  "trash.parentDeletedFeature",
                  "부모 피처가 삭제되어 있습니다. 피처를 먼저 복구하세요.",
                )
              : undefined
          }
          {...props}
        />
      ))}
    </div>
  );
}

function ChecklistList({
  items,
  ...props
}: RowProps & { items: TrashChecklistItemEntry[] }) {
  const { t } = useTranslation();
  if (items.length === 0)
    return (
      <EmptyState
        message={t("trash.empty.checklists", "삭제된 체크리스트가 없습니다")}
      />
    );
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <ItemRow
          key={it.id}
          id={it.id}
          title={it.title}
          meta={it.task_title || t("trash.unknownTask", "알 수 없는 태스크")}
          deletedAt={it.deleted_at}
          disabledHint={
            it.part_of_deleted_parent
              ? t(
                  "trash.parentDeletedTask",
                  "부모 태스크가 삭제되어 있습니다. 태스크를 먼저 복구하세요.",
                )
              : undefined
          }
          {...props}
        />
      ))}
    </div>
  );
}
