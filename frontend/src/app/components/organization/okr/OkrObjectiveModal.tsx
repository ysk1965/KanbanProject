import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Target,
  Building2,
  Layers,
  User,
  PlusCircle,
  Trash2,
  Edit3,
  Loader2,
  BarChart3,
} from "lucide-react";
import { MotionModal } from "../../ui/MotionModal";
import { okrService } from "../../../utils/services";
import type { OkrObjective, OkrKeyResult, OkrCheckIn } from "../../../types";
import { OkrProgressBar } from "./OkrProgressBar";
import { OkrConfidenceBadge } from "./OkrConfidenceBadge";
import { formatRelativeTime } from "../../../utils/dateUtils";

interface OkrObjectiveModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  objectiveId: string;
  objectives: OkrObjective[];
  onCheckIn: (krId: string) => void;
  onEdit: (objectiveId: string) => void;
  onRefresh: () => void;
  isAdmin: boolean;
}

const levelIcons: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  COMPANY: Building2,
  DEPARTMENT: Layers,
  INDIVIDUAL: User,
};

function findObjective(
  objectives: OkrObjective[],
  id: string,
): OkrObjective | null {
  for (const obj of objectives) {
    if (obj.id === id) return obj;
    if (obj.children) {
      const found = findObjective(obj.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function OkrObjectiveModal({
  open,
  onClose,
  orgId,
  objectiveId,
  objectives,
  onCheckIn,
  onEdit,
  onRefresh,
  isAdmin,
}: OkrObjectiveModalProps) {
  const { t } = useTranslation();
  const [checkIns, setCheckIns] = useState<Record<string, OkrCheckIn[]>>({});
  const [loadingCheckIns, setLoadingCheckIns] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const objective = findObjective(objectives, objectiveId);
  if (!objective) return null;

  const LevelIcon = levelIcons[objective.level] || Target;

  // Load check-in history for a KR
  const loadCheckIns = async (krId: string) => {
    if (checkIns[krId]) return;
    setLoadingCheckIns(krId);
    try {
      const data = await okrService.getCheckIns(orgId, krId);
      setCheckIns((prev) => ({ ...prev, [krId]: data }));
    } catch (e) {
      console.warn("Failed to load check-ins:", e);
    } finally {
      setLoadingCheckIns(null);
    }
  };

  // Delete objective
  const handleDelete = async () => {
    if (
      !confirm(t("okr.confirmDelete", "Are you sure you want to delete?"))
    )
      return;
    setDeleting(true);
    try {
      await okrService.deleteObjective(orgId, objectiveId);
      onRefresh();
      onClose();
    } catch (e) {
      console.warn("Failed to delete objective:", e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose} accentColor className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-10 h-10 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
          <LevelIcon size={18} className="text-bridge-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-foreground truncate">
            {objective.title}
          </div>
          <div className="text-[11px] text-slate-400">
            {objective.department_name ||
              t(
                `okr.level.${objective.level.toLowerCase()}`,
                objective.level,
              )}
            {objective.owner &&
              ` · ${t("okr.owner", "Owner")}: ${objective.owner.user_name}`}
          </div>
        </div>
        <OkrConfidenceBadge confidence={objective.confidence} size="md" />
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {t("okr.progress", "Progress")}
            </span>
            <span className="text-sm font-bold text-foreground">
              {Math.round(objective.progress)}%
            </span>
          </div>
          <OkrProgressBar progress={objective.progress} size="lg" animated />
        </div>

        {/* Description */}
        {objective.description && (
          <p className="text-sm text-slate-400">{objective.description}</p>
        )}

        {/* Key Results */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            {t("okr.keyResult", "Key Results")} (
            {objective.key_results?.length || 0})
          </div>
          <div className="space-y-3">
            {objective.key_results?.map((kr, idx) => (
              <KrDetailCard
                key={kr.id}
                kr={kr}
                idx={idx}
                orgId={orgId}
                checkIns={checkIns[kr.id]}
                loadingCheckIns={loadingCheckIns === kr.id}
                onLoadCheckIns={() => loadCheckIns(kr.id)}
                onCheckIn={onCheckIn}
                isAdmin={isAdmin}
              />
            ))}
            {(!objective.key_results || objective.key_results.length === 0) && (
              <div className="text-xs text-slate-500 text-center py-4">
                {t("okr.noKeyResults", "No key results")}
              </div>
            )}
          </div>
        </div>

        {/* Child Objectives */}
        {objective.children && objective.children.length > 0 && (
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              {t("okr.childObjectives", "Child Objectives")} (
              {objective.children.length})
            </div>
            <div className="space-y-2">
              {objective.children.map((child) => {
                const ChildIcon = levelIcons[child.level] || Target;
                return (
                  <div
                    key={child.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-foreground/5 cursor-pointer transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-bridge-accent/10 flex items-center justify-center shrink-0">
                      <ChildIcon
                        size={10}
                        className="text-bridge-accent"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold text-foreground truncate">
                        {child.title}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {child.department_name || child.owner?.user_name}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-foreground">
                      {Math.round(child.progress)}%
                    </span>
                    <OkrConfidenceBadge
                      confidence={child.confidence}
                      size="sm"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-[10px] text-slate-500">
          Esc {t("okr.cancel", "Cancel")}
        </span>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                {deleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
              <button
                onClick={() => {
                  onEdit(objectiveId);
                  onClose();
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-foreground
                  bg-foreground/5 hover:bg-foreground/10 rounded-lg transition-colors"
              >
                <Edit3 size={12} />
                {t("okr.editObjective", "Edit")}
              </button>
            </>
          )}
        </div>
      </div>
    </MotionModal>
  );
}

// --- KR Detail Card with check-in history ---

function KrDetailCard({
  kr,
  idx,
  orgId,
  checkIns,
  loadingCheckIns,
  onLoadCheckIns,
  onCheckIn,
  isAdmin,
}: {
  kr: OkrKeyResult;
  idx: number;
  orgId: string;
  checkIns?: OkrCheckIn[];
  loadingCheckIns: boolean;
  onLoadCheckIns: () => void;
  onCheckIn: (krId: string) => void;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();

  const progress =
    kr.target_value === kr.start_value
      ? 0
      : Math.min(
          100,
          Math.max(
            0,
            ((kr.current_value - kr.start_value) /
              (kr.target_value - kr.start_value)) *
              100,
          ),
        );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04 }}
      className="bg-foreground/[0.03] rounded-xl border border-foreground/[0.08] p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <BarChart3
              size={12}
              className="text-bridge-secondary shrink-0"
            />
            <span className="text-xs font-bold text-foreground truncate">
              {idx + 1}. {kr.title}
            </span>
          </div>
          {kr.owner && (
            <div className="text-[10px] text-slate-400 mt-0.5">
              {t("okr.owner", "Owner")}: {kr.owner.user_name}
            </div>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => onCheckIn(kr.id)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-bridge-accent
              hover:bg-bridge-accent/10 rounded-lg transition-colors shrink-0"
          >
            <PlusCircle size={12} />
            {t("okr.addCheckin", "Check-in")}
          </button>
        )}
      </div>

      {/* KR Progress */}
      <div className="flex items-center gap-3 mb-1">
        <OkrProgressBar progress={progress} size="md" animated />
        <span className="text-[10px] font-bold text-bridge-accent shrink-0">
          {kr.current_value}/{kr.target_value}
          {kr.unit ? ` ${kr.unit}` : ""}
        </span>
      </div>

      {/* Check-in history toggle */}
      <div className="flex items-center gap-1 mt-1">
        <button
          onClick={onLoadCheckIns}
          className="text-[10px] text-slate-400 hover:text-foreground transition-colors"
        >
          {checkIns
            ? `${t("okr.checkinHistory", "Check-in History")} (${checkIns.length})`
            : t("okr.checkinHistory", "Check-in History")}
        </button>
        {loadingCheckIns && (
          <Loader2 className="w-3 h-3 animate-spin text-bridge-accent" />
        )}
      </div>

      {/* Check-in list */}
      {checkIns && checkIns.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-foreground/[0.06] pt-2">
          {checkIns.map((ci) => (
            <div key={ci.id} className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-500 shrink-0">
                {formatRelativeTime(ci.created_at)}
              </span>
              <span className="text-foreground font-medium">
                {ci.author.user_name}
              </span>
              <span className="text-slate-400">
                {ci.previous_value} &rarr; {ci.new_value}
              </span>
              <OkrConfidenceBadge confidence={ci.confidence} size="sm" />
              {ci.note && (
                <span className="text-slate-500 truncate">
                  &ldquo;{ci.note}&rdquo;
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
