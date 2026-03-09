import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Target, Calendar, BarChart3, Loader2 } from "lucide-react";
import { MotionModal } from "../../ui/MotionModal";
import { okrService, organizationService } from "../../../utils/services";
import type {
  OkrObjective,
  OkrKeyResult,
  OrgDepartment,
  OrgMemberSimple,
} from "../../../types";

interface OkrCreateModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  cycleId: string;
  parentObjectiveId?: string | null;
  editObjectiveId?: string | null;
  objectives?: OkrObjective[];
  onRefresh: () => void;
  mode: "cycle" | "objective" | "keyResult";
  editKrId?: string | null;
  objectiveIdForKr?: string | null;
}

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

function findKeyResult(
  objectives: OkrObjective[],
  krId: string,
): OkrKeyResult | null {
  for (const obj of objectives) {
    for (const kr of obj.key_results || []) {
      if (kr.id === krId) return kr;
    }
    if (obj.children) {
      const found = findKeyResult(obj.children, krId);
      if (found) return found;
    }
  }
  return null;
}

// Flatten all objectives for parent select
function flattenObjectives(
  objectives: OkrObjective[],
  depth = 0,
): Array<{ id: string; title: string; depth: number }> {
  const result: Array<{ id: string; title: string; depth: number }> = [];
  for (const obj of objectives) {
    result.push({ id: obj.id, title: obj.title, depth });
    if (obj.children) {
      result.push(...flattenObjectives(obj.children, depth + 1));
    }
  }
  return result;
}

export function OkrCreateModal({
  open,
  onClose,
  orgId,
  cycleId,
  parentObjectiveId,
  editObjectiveId,
  objectives = [],
  onRefresh,
  mode,
  editKrId,
  objectiveIdForKr,
}: OkrCreateModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  // Org data for selects
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [members, setMembers] = useState<OrgMemberSimple[]>([]);
  const [loadingOrg, setLoadingOrg] = useState(false);

  // Cycle fields
  const [cycleName, setCycleName] = useState("");
  const [cycleType, setCycleType] = useState("QUARTERLY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Objective fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("COMPANY");
  const [departmentId, setDepartmentId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [selectedParentId, setSelectedParentId] = useState(
    parentObjectiveId || "",
  );

  // Key Result fields
  const [krTitle, setKrTitle] = useState("");
  const [krDescription, setKrDescription] = useState("");
  const [metricType, setMetricType] = useState("PERCENTAGE");
  const [startValue, setStartValue] = useState(0);
  const [targetValue, setTargetValue] = useState(100);
  const [currentValue, setCurrentValue] = useState(0);
  const [unit, setUnit] = useState("");
  const [krOwnerId, setKrOwnerId] = useState("");
  const [weight, setWeight] = useState(1);

  // Pre-fill for editing
  const editObj = editObjectiveId
    ? findObjective(objectives, editObjectiveId)
    : null;
  const editKr = editKrId ? findKeyResult(objectives, editKrId) : null;

  // Load org departments + members for select fields
  useEffect(() => {
    if (!open || mode === "cycle") return;
    let cancelled = false;
    const load = async () => {
      setLoadingOrg(true);
      try {
        const [depts, membersRes] = await Promise.all([
          organizationService.getDepartments(orgId),
          organizationService.getMembers(orgId, { size: 200 }),
        ]);
        if (!cancelled) {
          setDepartments(depts);
          setMembers(membersRes.content);
        }
      } catch (e) {
        console.warn("Failed to load org data:", e);
      } finally {
        if (!cancelled) setLoadingOrg(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, mode]);

  // Pre-fill form when editing
  useEffect(() => {
    if (!open) return;

    if (mode === "objective" && editObj) {
      setTitle(editObj.title);
      setDescription(editObj.description || "");
      setLevel(editObj.level);
      setDepartmentId(editObj.department_id || "");
      setOwnerId(editObj.owner?.id || "");
      setSelectedParentId(editObj.parent_objective_id || "");
    } else if (mode === "objective") {
      setTitle("");
      setDescription("");
      setLevel(parentObjectiveId ? "DEPARTMENT" : "COMPANY");
      setDepartmentId("");
      setOwnerId("");
      setSelectedParentId(parentObjectiveId || "");
    }

    if (mode === "keyResult" && editKr) {
      setKrTitle(editKr.title);
      setKrDescription(editKr.description || "");
      setMetricType(editKr.metric_type);
      setStartValue(editKr.start_value);
      setTargetValue(editKr.target_value);
      setCurrentValue(editKr.current_value);
      setUnit(editKr.unit || "");
      setKrOwnerId(editKr.owner?.id || "");
      setWeight(editKr.weight);
    } else if (mode === "keyResult") {
      setKrTitle("");
      setKrDescription("");
      setMetricType("PERCENTAGE");
      setStartValue(0);
      setTargetValue(100);
      setCurrentValue(0);
      setUnit("");
      setKrOwnerId("");
      setWeight(1);
    }

    if (mode === "cycle") {
      setCycleName("");
      setCycleType("QUARTERLY");
      setStartDate("");
      setEndDate("");
    }
  }, [open, mode, editObj?.id, editKr?.id, parentObjectiveId]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      if (mode === "cycle") {
        await okrService.createCycle(orgId, {
          name: cycleName,
          cycle_type: cycleType,
          start_date: startDate,
          end_date: endDate,
        });
      } else if (mode === "objective") {
        if (editObjectiveId) {
          await okrService.updateObjective(orgId, editObjectiveId, {
            title,
            description: description || undefined,
            level,
            department_id: departmentId || undefined,
            owner_id: ownerId || undefined,
            parent_objective_id: selectedParentId || undefined,
          });
        } else {
          await okrService.createObjective(orgId, cycleId, {
            title,
            description: description || undefined,
            level,
            department_id: departmentId || undefined,
            owner_id: ownerId || undefined,
            parent_objective_id: selectedParentId || undefined,
          });
        }
      } else if (mode === "keyResult") {
        const targetObjId = objectiveIdForKr || "";
        if (editKrId) {
          await okrService.updateKeyResult(orgId, editKrId, {
            title: krTitle,
            description: krDescription || undefined,
            metric_type: metricType,
            start_value: startValue,
            target_value: targetValue,
            unit: unit || undefined,
            owner_id: krOwnerId || undefined,
            weight,
          });
        } else {
          await okrService.createKeyResult(orgId, targetObjId, {
            title: krTitle,
            description: krDescription || undefined,
            metric_type: metricType,
            start_value: startValue,
            target_value: targetValue,
            current_value: currentValue,
            unit: unit || undefined,
            owner_id: krOwnerId || undefined,
            weight,
          });
        }
      }
      onRefresh();
      onClose();
    } catch (error) {
      console.warn("Failed to save:", error);
    } finally {
      setLoading(false);
    }
  };

  // Validation
  const isCycleValid = cycleName.trim() && startDate && endDate;
  const isObjValid = title.trim();
  const isKrValid = krTitle.trim() && targetValue !== startValue;
  const isValid =
    mode === "cycle"
      ? isCycleValid
      : mode === "objective"
        ? isObjValid
        : isKrValid;

  const flatObjs = flattenObjectives(objectives);

  // Header config per mode
  const headerConfig = {
    cycle: {
      icon: Calendar,
      title: t("okr.createCycle", "Create Cycle"),
    },
    objective: {
      icon: Target,
      title: editObjectiveId
        ? t("okr.editObjective", "Edit Objective")
        : t("okr.addObjective", "Add Objective"),
    },
    keyResult: {
      icon: BarChart3,
      title: editKrId
        ? t("okr.editKeyResult", "Edit Key Result")
        : t("okr.addKeyResult", "Add Key Result"),
    },
  };

  const { icon: HeaderIcon, title: headerTitle } = headerConfig[mode];

  const inputClass =
    "w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";
  const selectClass =
    "w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";
  const textareaClass =
    "w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 outline-none resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";
  const labelClass =
    "text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block";

  return (
    <MotionModal open={open} onClose={onClose} accentColor>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-8 h-8 rounded-xl bg-bridge-accent/15 flex items-center justify-center">
          <HeaderIcon size={16} className="text-bridge-accent" />
        </div>
        <h3 className="text-sm font-bold text-foreground">{headerTitle}</h3>
        {loadingOrg && (
          <Loader2 size={14} className="animate-spin text-slate-400 ml-auto" />
        )}
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {mode === "cycle" && (
          <>
            <div>
              <label className={labelClass}>
                {t("okr.title", "Title")}
              </label>
              <input
                type="text"
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                placeholder="Q1 2026"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Type</label>
              <select
                value={cycleType}
                onChange={(e) => setCycleType(e.target.value)}
                className={selectClass}
              >
                <option value="QUARTERLY">Quarterly</option>
                <option value="HALF_YEARLY">Half Yearly</option>
                <option value="YEARLY">Yearly</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>End</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </>
        )}

        {mode === "objective" && (
          <>
            <div>
              <label className={labelClass}>
                {t("okr.title", "Title")}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("okr.title", "Title")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                {t("okr.description", "Description")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("okr.description", "Description")}
                rows={3}
                className={textareaClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                {t("okr.levelLabel", "Level")}
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className={selectClass}
              >
                <option value="COMPANY">
                  {t("okr.level.company", "Company")}
                </option>
                <option value="DEPARTMENT">
                  {t("okr.level.department", "Department")}
                </option>
                <option value="INDIVIDUAL">
                  {t("okr.level.individual", "Individual")}
                </option>
              </select>
            </div>

            {/* Department select (only when DEPARTMENT level) */}
            {level === "DEPARTMENT" && departments.length > 0 && (
              <div>
                <label className={labelClass}>
                  {t("okr.department", "Department")}
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">--</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Owner select */}
            <div>
              <label className={labelClass}>
                {t("okr.owner", "Owner")}
              </label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className={selectClass}
              >
                <option value="">--</option>
                {members.map((m) => (
                  <option key={m.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Parent Objective select */}
            {flatObjs.length > 0 && (
              <div>
                <label className={labelClass}>
                  {t("okr.parentObjective", "Parent Objective")}
                </label>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  className={selectClass}
                >
                  <option value="">
                    -- {t("okr.parentObjective", "None")} --
                  </option>
                  {flatObjs
                    .filter((o) => o.id !== editObjectiveId)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {"  ".repeat(o.depth)}
                        {o.title}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </>
        )}

        {mode === "keyResult" && (
          <>
            <div>
              <label className={labelClass}>
                {t("okr.title", "Title")}
              </label>
              <input
                type="text"
                value={krTitle}
                onChange={(e) => setKrTitle(e.target.value)}
                placeholder={t("okr.keyResult", "Key Result")}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                {t("okr.description", "Description")}
              </label>
              <textarea
                value={krDescription}
                onChange={(e) => setKrDescription(e.target.value)}
                placeholder={t("okr.description", "Description")}
                rows={2}
                className={textareaClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                {t("okr.metricType", "Metric Type")}
              </label>
              <select
                value={metricType}
                onChange={(e) => setMetricType(e.target.value)}
                className={selectClass}
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="NUMBER">Number</option>
                <option value="CURRENCY">Currency</option>
                <option value="BOOLEAN">Boolean</option>
                <option value="MILESTONE">Milestone</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>
                  {t("okr.startValue", "Start")}
                </label>
                <input
                  type="number"
                  value={startValue}
                  onChange={(e) => setStartValue(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t("okr.targetValue", "Target")}
                </label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              {!editKrId && (
                <div>
                  <label className={labelClass}>
                    {t("okr.currentValue", "Current")}
                  </label>
                  <input
                    type="number"
                    value={currentValue}
                    onChange={(e) =>
                      setCurrentValue(Number(e.target.value))
                    }
                    className={inputClass}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>
                  {t("okr.unit", "Unit")}
                </label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="%"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t("okr.weight", "Weight")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
            {/* Owner select */}
            <div>
              <label className={labelClass}>
                {t("okr.owner", "Owner")}
              </label>
              <select
                value={krOwnerId}
                onChange={(e) => setKrOwnerId(e.target.value)}
                className={selectClass}
              >
                <option value="">--</option>
                {members.map((m) => (
                  <option key={m.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-[10px] text-slate-500">
          Esc {t("okr.cancel", "Cancel")}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            {t("okr.cancel", "Cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !isValid}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            {t("okr.save", "Save")}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
