import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Target, Loader2, Plus, List, GitBranch } from "lucide-react";
import { okrService } from "../../../utils/services";
import type { OkrCycle, OkrTreeData } from "../../../types";
import { EmptyState } from "../../ui/EmptyState";
import { OkrSummaryCard } from "../okr/OkrSummaryCard";
import { OkrCycleSelector } from "../okr/OkrCycleSelector";
import { OkrListView } from "../okr/OkrListView";
import { OkrTreeView } from "../okr/OkrTreeView";
import { OkrObjectiveModal } from "../okr/OkrObjectiveModal";
import { OkrCreateModal } from "../okr/OkrCreateModal";
import { OkrCheckInModal } from "../okr/OkrCheckInModal";

interface OrgOkrTabProps {
  orgId: string;
  myRole: string;
}

export function OrgOkrTab({ orgId, myRole }: OrgOkrTabProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<OkrCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<OkrTreeData | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "tree">("list");

  // Modal states
  const [showCreateCycleModal, setShowCreateCycleModal] = useState(false);
  const [showCreateObjModal, setShowCreateObjModal] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null);
  const [checkInKrId, setCheckInKrId] = useState<string | null>(null);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [editObjectiveId, setEditObjectiveId] = useState<string | null>(null);

  const isAdmin = myRole === "OWNER" || myRole === "ADMIN";

  // Fetch cycles
  useEffect(() => {
    fetchCycles();
  }, [orgId]);

  const fetchCycles = async () => {
    try {
      const data = await okrService.getCycles(orgId);
      setCycles(data);
      if (data.length > 0 && !selectedCycleId) {
        const active = data.find((c) => c.status === "ACTIVE") || data[0];
        setSelectedCycleId(active.id);
      }
    } catch (error) {
      console.warn("Failed to fetch OKR cycles:", error);
    }
  };

  // Fetch tree when cycle changes
  useEffect(() => {
    if (selectedCycleId) fetchTree();
  }, [selectedCycleId]);

  const fetchTree = async () => {
    if (!selectedCycleId) return;
    try {
      setLoading(true);
      const data = await okrService.getTree(orgId, selectedCycleId);
      setTreeData(data);
    } catch (error) {
      console.warn("Failed to fetch OKR tree:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = useCallback(() => {
    fetchTree();
  }, [selectedCycleId]);

  // No cycles -- empty state
  if (!loading && cycles.length === 0) {
    return (
      <>
        <EmptyState
          icon={Target}
          title={t("okr.empty.title", "Start your first OKR cycle")}
          description={t("okr.empty.description", "Set goals for your organization and align with your team")}
          action={
            isAdmin
              ? { label: t("okr.createCycle", "Create Cycle"), onClick: () => setShowCreateCycleModal(true) }
              : undefined
          }
          color="accent"
        />
        {showCreateCycleModal && (
          <OkrCreateModal
            open={showCreateCycleModal}
            onClose={() => setShowCreateCycleModal(false)}
            orgId={orgId}
            cycleId=""
            onRefresh={() => {
              fetchCycles();
            }}
            mode="cycle"
          />
        )}
      </>
    );
  }

  // Loading
  if (loading && !treeData) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId);
  const daysRemaining = selectedCycle
    ? Math.max(0, Math.ceil((new Date(selectedCycle.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header: Cycle Selector + Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <OkrCycleSelector
          cycles={cycles}
          selectedCycleId={selectedCycleId}
          onSelect={setSelectedCycleId}
          onCreateCycle={isAdmin ? () => setShowCreateCycleModal(true) : undefined}
        />
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center bg-foreground/5 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                viewMode === "list" ? "bg-bridge-accent text-white" : "text-slate-400 hover:text-foreground"
              }`}
            >
              <List size={14} className="inline mr-1" />
              {t("okr.view.list", "List")}
            </button>
            <button
              onClick={() => setViewMode("tree")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                viewMode === "tree" ? "bg-bridge-accent text-white" : "text-slate-400 hover:text-foreground"
              }`}
            >
              <GitBranch size={14} className="inline mr-1" />
              {t("okr.view.tree", "Tree")}
            </button>
          </div>
          {/* Add Objective */}
          {isAdmin && (
            <button
              onClick={() => {
                setCreateParentId(null);
                setEditObjectiveId(null);
                setShowCreateObjModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-colors"
            >
              <Plus size={14} />
              {t("okr.addObjective", "Add Objective")}
            </button>
          )}
        </div>
      </div>

      {/* Summary Card */}
      {treeData && <OkrSummaryCard treeData={treeData} daysRemaining={daysRemaining} />}

      {/* View */}
      {treeData &&
        (viewMode === "list" ? (
          <OkrListView
            objectives={treeData.objectives}
            onObjectiveClick={setSelectedObjectiveId}
            onCheckIn={setCheckInKrId}
            onAddChild={(parentId) => {
              setCreateParentId(parentId);
              setEditObjectiveId(null);
              setShowCreateObjModal(true);
            }}
            isAdmin={isAdmin}
          />
        ) : (
          <OkrTreeView
            objectives={treeData.objectives}
            onObjectiveClick={setSelectedObjectiveId}
            onCheckIn={setCheckInKrId}
            onAddChild={(parentId) => {
              setCreateParentId(parentId);
              setEditObjectiveId(null);
              setShowCreateObjModal(true);
            }}
            isAdmin={isAdmin}
          />
        ))}

      {/* Modals */}
      {selectedObjectiveId && (
        <OkrObjectiveModal
          open={!!selectedObjectiveId}
          onClose={() => setSelectedObjectiveId(null)}
          orgId={orgId}
          objectiveId={selectedObjectiveId}
          objectives={treeData?.objectives || []}
          onCheckIn={setCheckInKrId}
          onEdit={(objId) => {
            setEditObjectiveId(objId);
            setSelectedObjectiveId(null);
            setShowCreateObjModal(true);
          }}
          onRefresh={handleRefresh}
          isAdmin={isAdmin}
        />
      )}

      {showCreateObjModal && selectedCycleId && (
        <OkrCreateModal
          open={showCreateObjModal}
          onClose={() => {
            setShowCreateObjModal(false);
            setCreateParentId(null);
            setEditObjectiveId(null);
          }}
          orgId={orgId}
          cycleId={selectedCycleId}
          parentObjectiveId={createParentId}
          editObjectiveId={editObjectiveId}
          objectives={treeData?.objectives || []}
          onRefresh={handleRefresh}
          mode="objective"
        />
      )}

      {showCreateCycleModal && (
        <OkrCreateModal
          open={showCreateCycleModal}
          onClose={() => setShowCreateCycleModal(false)}
          orgId={orgId}
          cycleId=""
          onRefresh={() => {
            fetchCycles();
          }}
          mode="cycle"
        />
      )}

      {checkInKrId && (
        <OkrCheckInModal
          open={!!checkInKrId}
          onClose={() => setCheckInKrId(null)}
          orgId={orgId}
          krId={checkInKrId}
          objectives={treeData?.objectives || []}
          onRefresh={handleRefresh}
        />
      )}
    </motion.div>
  );
}
