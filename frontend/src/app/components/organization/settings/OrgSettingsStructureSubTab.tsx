import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  Users,
  Briefcase,
  Crown,
  Award,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { organizationService } from "../../../utils/services";
import type {
  OrgDepartment,
  OrgJobGroup,
  OrgPosition,
  OrgTitle,
  OrgGrade,
  OrgStructureSettings,
} from "../../../types";

interface OrgSettingsStructureSubTabProps {
  orgId: string;
}

const inputSmClass =
  "bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg py-1.5 px-2 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";

type SettingsKey = keyof OrgStructureSettings;

interface CrudSectionProps {
  icon: React.ReactNode;
  title: string;
  items: { id: string; name: string }[];
  newName: string;
  onNewNameChange: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  placeholder: string;
  enabled: boolean;
  onToggle: () => void;
}

function CrudSection({
  icon,
  title,
  items,
  newName,
  onNewNameChange,
  onAdd,
  onDelete,
  placeholder,
  enabled,
  onToggle,
}: CrudSectionProps) {
  return (
    <section
      className={`bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] transition-all ${
        enabled ? "" : "opacity-50"
      }`}
    >
      <div className="flex items-center justify-between p-6 pb-0">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
            enabled ? "bg-bridge-accent" : "bg-foreground/15"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-[3px]"
            }`}
          />
        </button>
      </div>
      {enabled && (
        <div className="px-6 pb-6 pt-3">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => onNewNameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAdd()}
              placeholder={placeholder}
              className={`flex-1 ${inputSmClass}`}
            />
            <button
              onClick={onAdd}
              disabled={!newName.trim()}
              className="p-1.5 bg-bridge-accent text-white rounded-lg disabled:opacity-30 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-foreground/[0.03] group"
              >
                <span className="text-sm text-foreground">{item.name}</span>
                <button
                  onClick={() => onDelete(item.id)}
                  className="p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-600 dark:hover:text-red-400 transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!enabled && (
        <p className="px-6 pb-4 pt-2 text-[11px] text-slate-500">
          {title} is disabled. Toggle to enable.
        </p>
      )}
    </section>
  );
}

export function OrgSettingsStructureSubTab({
  orgId,
}: OrgSettingsStructureSubTabProps) {
  const { t } = useTranslation();

  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [jobGroups, setJobGroups] = useState<OrgJobGroup[]>([]);
  const [positions, setPositions] = useState<OrgPosition[]>([]);
  const [titles, setTitles] = useState<OrgTitle[]>([]);
  const [grades, setGrades] = useState<OrgGrade[]>([]);

  const [newDeptName, setNewDeptName] = useState("");
  const [newJobGroupName, setNewJobGroupName] = useState("");
  const [newPositionName, setNewPositionName] = useState("");
  const [newTitleName, setNewTitleName] = useState("");
  const [newGradeName, setNewGradeName] = useState("");

  const [settings, setSettings] = useState<OrgStructureSettings>({
    departments_enabled: true,
    job_groups_enabled: true,
    positions_enabled: true,
    titles_enabled: true,
    grades_enabled: true,
  });

  const fetchData = useCallback(async () => {
    try {
      const [depts, jgs, pos, ttls, grds, structSettings] = await Promise.all([
        organizationService.getDepartments(orgId),
        organizationService.getJobGroups(orgId),
        organizationService.getPositions(orgId).catch(() => []),
        organizationService.getTitles(orgId).catch(() => []),
        organizationService.getGrades(orgId).catch(() => []),
        organizationService.getStructureSettings(orgId).catch(() => null),
      ]);
      setDepartments(depts);
      setJobGroups(jgs);
      setPositions(pos);
      setTitles(ttls);
      setGrades(grds);
      if (structSettings) {
        setSettings(structSettings);
      }
    } catch (error) {
      console.warn("Failed to fetch structure data:", error);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = useCallback(
    async (key: SettingsKey) => {
      const newValue = !settings[key];
      const prev = { ...settings };
      setSettings((s) => ({ ...s, [key]: newValue }));
      try {
        await organizationService.updateStructureSettings(orgId, {
          [key]: newValue,
        });
      } catch {
        setSettings(prev);
        toast.error(t("organization.settings.toggleError", "Failed to update setting"));
      }
    },
    [orgId, settings, t],
  );

  // ── CRUD Handlers ──

  const makeAddHandler = (
    service: (orgId: string, data: { name: string }) => Promise<unknown>,
    getName: () => string,
    clearName: () => void,
  ) => async () => {
    const name = getName().trim();
    if (!name) return;
    try {
      await service(orgId, { name });
      clearName();
      fetchData();
    } catch (error) {
      console.warn("Failed to add:", error);
    }
  };

  const makeDeleteHandler = (
    service: (orgId: string, id: string) => Promise<unknown>,
    confirmMsg: string,
    errorMsg: string,
  ) => async (id: string) => {
    if (!confirm(confirmMsg)) return;
    try {
      await service(orgId, id);
      fetchData();
    } catch (error) {
      console.warn("Failed to delete:", error);
      toast.error(errorMsg);
    }
  };

  const sections: (CrudSectionProps & { key: string })[] = [
    {
      key: "departments",
      icon: <Users size={16} className="text-teal-400" />,
      title: t("organization.settings.departments", "Departments"),
      items: departments,
      newName: newDeptName,
      onNewNameChange: setNewDeptName,
      onAdd: makeAddHandler(
        organizationService.createDepartment.bind(organizationService),
        () => newDeptName,
        () => setNewDeptName(""),
      ),
      onDelete: makeDeleteHandler(
        organizationService.deleteDepartment.bind(organizationService),
        t("organization.settings.deleteDeptConfirm", "Delete this department? Members in this department will be unassigned."),
        t("organization.settings.deleteDeptError", "Failed to delete department"),
      ),
      placeholder: t("organization.settings.newDeptPlaceholder", "New department name"),
      enabled: settings.departments_enabled,
      onToggle: () => handleToggle("departments_enabled"),
    },
    {
      key: "jobGroups",
      icon: <Briefcase size={16} className="text-purple-400" />,
      title: t("organization.settings.jobGroups", "Job Groups"),
      items: jobGroups,
      newName: newJobGroupName,
      onNewNameChange: setNewJobGroupName,
      onAdd: makeAddHandler(
        organizationService.createJobGroup.bind(organizationService),
        () => newJobGroupName,
        () => setNewJobGroupName(""),
      ),
      onDelete: makeDeleteHandler(
        organizationService.deleteJobGroup.bind(organizationService),
        t("organization.settings.deleteJobGroupConfirm", "Delete this job group? Members in this group will be unassigned."),
        t("organization.settings.deleteJobGroupError", "Failed to delete job group"),
      ),
      placeholder: t("organization.settings.newJobGroupPlaceholder", "New job group name"),
      enabled: settings.job_groups_enabled,
      onToggle: () => handleToggle("job_groups_enabled"),
    },
    {
      key: "positions",
      icon: <Crown size={16} className="text-amber-400" />,
      title: t("organization.settings.positions", "Positions"),
      items: positions,
      newName: newPositionName,
      onNewNameChange: setNewPositionName,
      onAdd: makeAddHandler(
        organizationService.createPosition.bind(organizationService),
        () => newPositionName,
        () => setNewPositionName(""),
      ),
      onDelete: makeDeleteHandler(
        organizationService.deletePosition.bind(organizationService),
        t("organization.settings.deletePositionConfirm", "Delete this position? Members with this position will be unassigned."),
        t("organization.settings.deletePositionError", "Failed to delete position"),
      ),
      placeholder: t("organization.settings.newPositionPlaceholder", "New position name"),
      enabled: settings.positions_enabled,
      onToggle: () => handleToggle("positions_enabled"),
    },
    {
      key: "titles",
      icon: <Award size={16} className="text-indigo-400" />,
      title: t("organization.settings.titles", "Titles"),
      items: titles,
      newName: newTitleName,
      onNewNameChange: setNewTitleName,
      onAdd: makeAddHandler(
        organizationService.createTitle.bind(organizationService),
        () => newTitleName,
        () => setNewTitleName(""),

      ),
      onDelete: makeDeleteHandler(
        organizationService.deleteTitle.bind(organizationService),
        t("organization.settings.deleteTitleConfirm", "Delete this title? Members with this title will be unassigned."),
        t("organization.settings.deleteTitleError", "Failed to delete title"),
      ),
      placeholder: t("organization.settings.newTitlePlaceholder", "New title name"),
      enabled: settings.titles_enabled,
      onToggle: () => handleToggle("titles_enabled"),
    },
    {
      key: "grades",
      icon: <BarChart3 size={16} className="text-rose-400" />,
      title: t("organization.settings.grades", "Grades"),
      items: grades,
      newName: newGradeName,
      onNewNameChange: setNewGradeName,
      onAdd: makeAddHandler(
        organizationService.createGrade.bind(organizationService),
        () => newGradeName,
        () => setNewGradeName(""),
      ),
      onDelete: makeDeleteHandler(
        organizationService.deleteGrade.bind(organizationService),
        t("organization.settings.deleteGradeConfirm", "Delete this grade? Members with this grade will be unassigned."),
        t("organization.settings.deleteGradeError", "Failed to delete grade"),
      ),
      placeholder: t("organization.settings.newGradePlaceholder", "New grade name"),
      enabled: settings.grades_enabled,
      onToggle: () => handleToggle("grades_enabled"),
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {sections.map((s) => (
        <CrudSection key={s.key} {...s} />
      ))}
    </div>
  );
}
