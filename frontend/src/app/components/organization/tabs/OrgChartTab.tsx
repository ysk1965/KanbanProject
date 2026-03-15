import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Network,
  List,
  ChevronDown,
  ChevronRight,
  User,
  Users as UsersIcon,
  UserMinus,
  UserPlus,
  Building2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { organizationService } from "../../../utils/services";
import { resolveFileUrl } from "../../../utils/api";
import type {
  OrgChartData,
  OrgChartMemberNode,
  OrgChartDepartmentNode,
  OrgRole,
  OrgDepartment,
  OrgJobGroup,
  OrgPosition,
  OrgTitle,
  OrgGrade,
  OrgStructureSettings,
} from "../../../types";
import { MemberDetailModal } from "../MemberDetailModal";

type ViewMode = "tree" | "list";

interface OrgChartTabProps {
  orgId: string;
  myRole: OrgRole;
  departments: OrgDepartment[];
  myUserId: string;
  jobGroups: OrgJobGroup[];
  positions: OrgPosition[];
  titles: OrgTitle[];
  grades: OrgGrade[];
  structureSettings: OrgStructureSettings;
  hrSystemEnabled?: boolean;
}

export function OrgChartTab({
  orgId,
  myRole,
  departments,
  myUserId,
  jobGroups,
  positions,
  titles,
  grades,
  structureSettings,
  hrSystemEnabled,
}: OrgChartTabProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === "OWNER" || myRole === "ADMIN";

  const [chartData, setChartData] = useState<OrgChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [search, setSearch] = useState("");
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [managerEditMemberId, setManagerEditMemberId] = useState<string | null>(
    null,
  );
  const [managerSearch, setManagerSearch] = useState("");
  const [updatingManager, setUpdatingManager] = useState(false);

  const fetchChart = useCallback(async () => {
    try {
      setLoading(true);
      const data = await organizationService.getChart(orgId);
      setChartData(data);
    } catch (error) {
      console.warn("Failed to fetch chart:", error);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchChart();
  }, [fetchChart]);

  // Flatten all members for manager dropdown
  const allMembers = useMemo(() => {
    if (!chartData) return [];
    const members: OrgChartMemberNode[] = [];
    const collectMembers = (node: OrgChartMemberNode) => {
      members.push(node);
      node.reports.forEach(collectMembers);
    };
    const collectFromDept = (dept: OrgChartDepartmentNode) => {
      dept.members.forEach(collectMembers);
      dept.children.forEach(collectFromDept);
    };
    chartData.departments.forEach(collectFromDept);
    chartData.unassigned.forEach(collectMembers);
    return members;
  }, [chartData]);

  // Filter department tree by search
  const filterDeptNode = useCallback(
    (
      dept: OrgChartDepartmentNode,
      query: string,
    ): OrgChartDepartmentNode | null => {
      const q = query.toLowerCase();
      const nameMatch = dept.name.toLowerCase().includes(q);
      const leaderMatch = dept.leader?.user_name.toLowerCase().includes(q);

      const filteredChildren = dept.children
        .map((c) => filterDeptNode(c, query))
        .filter(Boolean) as OrgChartDepartmentNode[];

      const filterMemberNode = (
        node: OrgChartMemberNode,
      ): OrgChartMemberNode | null => {
        const selfMatch =
          node.user_name.toLowerCase().includes(q) ||
          (node.job_title && node.job_title.toLowerCase().includes(q));
        const filteredReports = node.reports
          .map(filterMemberNode)
          .filter(Boolean) as OrgChartMemberNode[];
        if (selfMatch || filteredReports.length > 0) {
          return {
            ...node,
            reports: selfMatch ? node.reports : filteredReports,
          };
        }
        return null;
      };

      const filteredMembers = dept.members
        .map(filterMemberNode)
        .filter(Boolean) as OrgChartMemberNode[];

      if (
        nameMatch ||
        leaderMatch ||
        filteredChildren.length > 0 ||
        filteredMembers.length > 0
      ) {
        return {
          ...dept,
          children: nameMatch ? dept.children : filteredChildren,
          members: nameMatch ? dept.members : filteredMembers,
        };
      }
      return null;
    },
    [],
  );

  const filteredData = useMemo(() => {
    if (!chartData || !search.trim()) return chartData;
    const q = search.trim();

    const filteredDepts = chartData.departments
      .map((d) => filterDeptNode(d, q))
      .filter(Boolean) as OrgChartDepartmentNode[];

    const filterMember = (
      node: OrgChartMemberNode,
    ): OrgChartMemberNode | null => {
      const selfMatch =
        node.user_name.toLowerCase().includes(q.toLowerCase()) ||
        (node.job_title &&
          node.job_title.toLowerCase().includes(q.toLowerCase()));
      const filteredReports = node.reports
        .map(filterMember)
        .filter(Boolean) as OrgChartMemberNode[];
      if (selfMatch || filteredReports.length > 0) {
        return { ...node, reports: selfMatch ? node.reports : filteredReports };
      }
      return null;
    };
    const filteredUnassigned = chartData.unassigned
      .map(filterMember)
      .filter(Boolean) as OrgChartMemberNode[];

    return {
      ...chartData,
      departments: filteredDepts,
      unassigned: filteredUnassigned,
    };
  }, [chartData, search, filterDeptNode]);

  const toggleDept = (deptId: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  const expandAll = () => setCollapsedDepts(new Set());
  const collapseAll = () => {
    if (!chartData) return;
    const ids = new Set<string>();
    const collect = (dept: OrgChartDepartmentNode) => {
      ids.add(dept.id);
      dept.children.forEach(collect);
    };
    chartData.departments.forEach(collect);
    setCollapsedDepts(ids);
  };

  const handleUpdateManager = async (
    memberId: string,
    managerId: string | null,
  ) => {
    try {
      setUpdatingManager(true);
      await organizationService.updateManager(orgId, memberId, {
        manager_id: managerId,
      });
      setManagerEditMemberId(null);
      setManagerSearch("");
      await fetchChart();
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code === "SELF_MANAGER_NOT_ALLOWED") {
        alert(
          t(
            "organization.chart.error.selfManager",
            "Cannot assign yourself as manager",
          ),
        );
      } else if (err.code === "CIRCULAR_MANAGER_REFERENCE") {
        alert(
          t(
            "organization.chart.error.circular",
            "Circular manager reference detected",
          ),
        );
      } else {
        alert(
          t("organization.chart.error.generic", "Failed to update manager"),
        );
      }
    } finally {
      setUpdatingManager(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 bg-bridge-obsidian rounded-2xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!filteredData) return null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              "organization.chart.searchPlaceholder",
              "Search members...",
            )}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 pl-9 pr-4 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-foreground/[0.03] rounded-xl border border-foreground/10 p-0.5">
            <button
              onClick={() => setViewMode("tree")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "tree"
                  ? "bg-bridge-accent text-white"
                  : "text-slate-500 hover:text-foreground"
              }`}
            >
              <Network size={14} />
              {t("organization.chart.treeView", "Tree")}
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "list"
                  ? "bg-bridge-accent text-white"
                  : "text-slate-500 hover:text-foreground"
              }`}
            >
              <List size={14} />
              {t("organization.chart.listView", "List")}
            </button>
          </div>
          <button
            onClick={expandAll}
            className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors"
          >
            {t("organization.chart.expandAll", "Expand All")}
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors"
          >
            {t("organization.chart.collapseAll", "Collapse All")}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <UsersIcon size={14} />
          {t("organization.chart.totalMembers", "{{count}} members", {
            count: chartData?.total_members ?? 0,
          })}
        </span>
        <span className="flex items-center gap-1">
          <Building2 size={14} />
          {t("organization.chart.totalDepts", "{{count}} departments", {
            count: chartData?.departments.length ?? 0,
          })}
        </span>
      </div>

      {/* Content */}
      {viewMode === "tree" ? (
        <DepartmentTreeView
          data={filteredData}
          collapsedDepts={collapsedDepts}
          onToggleDept={toggleDept}
          onMemberClick={setSelectedMemberId}
        />
      ) : (
        <ListView
          data={filteredData}
          collapsedDepts={collapsedDepts}
          onToggleDept={toggleDept}
          isAdmin={isAdmin}
          onMemberClick={setSelectedMemberId}
          managerEditMemberId={managerEditMemberId}
          onManagerEdit={setManagerEditMemberId}
          allMembers={allMembers}
          managerSearch={managerSearch}
          onManagerSearchChange={setManagerSearch}
          onUpdateManager={handleUpdateManager}
          updatingManager={updatingManager}
          hrSystemEnabled={hrSystemEnabled}
        />
      )}

      {/* Member Detail Modal */}
      {selectedMemberId && (
        <MemberDetailModal
          open={!!selectedMemberId}
          onClose={() => setSelectedMemberId(null)}
          orgId={orgId}
          memberId={selectedMemberId}
          myRole={myRole}
          myUserId={myUserId}
          departments={departments}
          jobGroups={jobGroups}
          positions={positions}
          titles={titles}
          grades={grades}
          structureSettings={structureSettings}
          onMemberUpdated={() => {
            fetchChart();
            setSelectedMemberId(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Department Tree View (Department Hierarchy) ───

function DepartmentTreeView({
  data,
  collapsedDepts,
  onToggleDept,
  onMemberClick,
}: {
  data: OrgChartData;
  collapsedDepts: Set<string>;
  onToggleDept: (id: string) => void;
  onMemberClick: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex flex-col items-center min-w-[400px] md:min-w-0">
        {/* Organization Root */}
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] px-6 py-4 text-center shadow-sm">
          <div className="text-sm font-bold text-foreground">
            {data.organization_name}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center justify-center gap-1">
              <UsersIcon size={12} />
              {data.total_members}
              {t("organization.chart.members", "members")} ·{" "}
              {data.departments.length}
              {t("organization.chart.depts", "depts")}
            </span>
          </div>
        </div>

        {/* Connector line */}
        {(data.departments.length > 0 || data.unassigned.length > 0) && (
          <div className="w-px h-6 bg-foreground/10" />
        )}

        {/* Department tree rows */}
        {data.departments.length > 0 && (
          <DeptChildrenRow
            depts={data.departments}
            collapsedDepts={collapsedDepts}
            onToggleDept={onToggleDept}
            onMemberClick={onMemberClick}
          />
        )}

        {/* Unassigned section */}
        {data.unassigned.length > 0 && (
          <div className="mt-6">
            <div className="w-px h-4 bg-foreground/10 mx-auto" />
            <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] px-4 py-3 text-center">
              <div className="flex items-center gap-2 justify-center">
                <User size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-foreground">
                  {t("organization.chart.unassigned", "Unassigned")}
                </span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-500">
                  {data.unassigned.length}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeptChildrenRow({
  depts,
  collapsedDepts,
  onToggleDept,
  onMemberClick,
}: {
  depts: OrgChartDepartmentNode[];
  collapsedDepts: Set<string>;
  onToggleDept: (id: string) => void;
  onMemberClick: (id: string) => void;
}) {
  return (
    <div className="relative">
      {/* Horizontal connector line */}
      {depts.length > 1 && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2"
          style={{
            width: `calc(100% - ${100 / depts.length}%)`,
            height: "1px",
          }}
        >
          <div className="absolute inset-0 bg-foreground/10" />
        </div>
      )}
      <div className="flex justify-center gap-3 md:gap-6">
        {depts.map((dept) => (
          <DepartmentTreeNode
            key={dept.id}
            dept={dept}
            collapsedDepts={collapsedDepts}
            onToggleDept={onToggleDept}
            onMemberClick={onMemberClick}
          />
        ))}
      </div>
    </div>
  );
}

function flattenMemberNodes(
  members: OrgChartMemberNode[],
): OrgChartMemberNode[] {
  const result: OrgChartMemberNode[] = [];
  const collect = (m: OrgChartMemberNode) => {
    result.push(m);
    m.reports.forEach(collect);
  };
  members.forEach(collect);
  return result;
}

function DepartmentTreeNode({
  dept,
  collapsedDepts,
  onToggleDept,
  onMemberClick,
}: {
  dept: OrgChartDepartmentNode;
  collapsedDepts: Set<string>;
  onToggleDept: (id: string) => void;
  onMemberClick: (id: string) => void;
}) {
  const isCollapsed = collapsedDepts.has(dept.id);
  const hasChildren = dept.children.length > 0;
  const allMembers = useMemo(() => flattenMemberNodes(dept.members), [dept.members]);

  return (
    <div className="flex flex-col items-center">
      {/* Vertical connector from parent */}
      <div className="w-px h-0 bg-foreground/10" />

      {/* Department Card */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        className="relative bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] min-w-[140px] max-w-[180px] md:min-w-[180px] md:max-w-[220px] shadow-sm hover:border-foreground/[0.12] transition-colors group"
      >
        <div
          className={`px-4 py-3 ${hasChildren ? "cursor-pointer" : ""}`}
          onClick={() => hasChildren && onToggleDept(dept.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {/* Leader avatar or department icon */}
              {dept.leader?.profile_image_url ? (
                <img
                  src={resolveFileUrl(dept.leader.profile_image_url)}
                  alt={dept.leader.user_name}
                  className="w-8 h-8 rounded-full object-cover shrink-0 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dept.leader?.member_id)
                      onMemberClick(dept.leader.member_id);
                  }}
                />
              ) : dept.leader ? (
                <div
                  className="w-8 h-8 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dept.leader?.member_id)
                      onMemberClick(dept.leader.member_id);
                  }}
                >
                  <span className="text-xs font-bold text-bridge-accent">
                    {dept.leader.user_name?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-foreground/[0.03] flex items-center justify-center shrink-0">
                  <Building2 size={14} className="text-slate-400" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground truncate">
                  {dept.name}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <UsersIcon size={10} />
                  <span>{dept.total_member_count}</span>
                  {dept.leader && (
                    <>
                      <span className="mx-0.5">·</span>
                      <span className="truncate">{dept.leader.user_name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Member list */}
        {allMembers.length > 0 && (
          <div className="px-3 pb-2.5 border-t border-foreground/[0.06]">
            <div className="pt-1.5 space-y-0.5">
              {allMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMemberClick(member.id);
                  }}
                  className="w-full flex items-center gap-2 py-1 px-1 rounded-lg hover:bg-foreground/5 transition-colors"
                >
                  {member.profile_image_url ? (
                    <img
                      src={resolveFileUrl(member.profile_image_url)}
                      alt={member.user_name}
                      className="w-5 h-5 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-bridge-accent">
                        {member.user_name?.charAt(0)?.toUpperCase() || "?"}
                      </span>
                    </div>
                  )}
                  <span className="text-xs text-foreground truncate">
                    {member.user_name}
                  </span>
                  {member.job_title && (
                    <span className="text-xs text-muted-foreground truncate hidden md:inline">
                      {member.job_title}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Child dept count badge */}
        {hasChildren && (
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10">
            <span className="inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/90 text-white shadow-sm">
              {dept.child_dept_count}
              <ChevronDown
                size={10}
                className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
              />
            </span>
          </div>
        )}
      </motion.div>

      {/* Children */}
      <AnimatePresence>
        {hasChildren && !isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center overflow-hidden"
          >
            <div className="flex flex-col items-center pb-4">
              <div className="w-px h-6 bg-foreground/10 mt-3" />
              <DeptChildrenRow
                depts={dept.children}
                collapsedDepts={collapsedDepts}
                onToggleDept={onToggleDept}
                onMemberClick={onMemberClick}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── List View (updated for hierarchy) ───

function flattenDepts(
  depts: OrgChartDepartmentNode[],
  collapsedDepts: Set<string>,
  depth: number = 0,
  parentCollapsed: boolean = false,
): Array<{ dept: OrgChartDepartmentNode; depth: number; visible: boolean }> {
  const result: Array<{
    dept: OrgChartDepartmentNode;
    depth: number;
    visible: boolean;
  }> = [];
  for (const dept of depts) {
    const visible = !parentCollapsed;
    result.push({ dept, depth, visible });
    const isCollapsed = collapsedDepts.has(dept.id);
    result.push(
      ...flattenDepts(
        dept.children,
        collapsedDepts,
        depth + 1,
        parentCollapsed || isCollapsed,
      ),
    );
  }
  return result;
}

function ListView({
  data,
  collapsedDepts,
  onToggleDept,
  isAdmin,
  onMemberClick,
  managerEditMemberId,
  onManagerEdit,
  allMembers,
  managerSearch,
  onManagerSearchChange,
  onUpdateManager,
  updatingManager,
  hrSystemEnabled,
}: {
  data: OrgChartData;
  collapsedDepts: Set<string>;
  onToggleDept: (id: string) => void;
  isAdmin: boolean;
  onMemberClick: (id: string) => void;
  managerEditMemberId: string | null;
  onManagerEdit: (id: string | null) => void;
  allMembers: OrgChartMemberNode[];
  managerSearch: string;
  onManagerSearchChange: (s: string) => void;
  onUpdateManager: (memberId: string, managerId: string | null) => void;
  updatingManager: boolean;
  hrSystemEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const flatDeptList = useMemo(
    () => flattenDepts(data.departments, collapsedDepts),
    [data.departments, collapsedDepts],
  );

  return (
    <div className="space-y-2">
      {flatDeptList
        .filter(({ visible }) => visible)
        .map(({ dept, depth }) => {
          const isCollapsed = collapsedDepts.has(dept.id);
          const hasChildren = dept.children.length > 0;

          return (
            <div
              key={dept.id}
              style={{ marginLeft: `${depth * 16}px` }}
              className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden"
            >
              {/* Department Header */}
              <button
                onClick={() => onToggleDept(dept.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-foreground/5 transition-colors"
              >
                {hasChildren || dept.members.length > 0 ? (
                  isCollapsed ? (
                    <ChevronRight
                      size={16}
                      className="text-muted-foreground shrink-0"
                    />
                  ) : (
                    <ChevronDown
                      size={16}
                      className="text-muted-foreground shrink-0"
                    />
                  )
                ) : (
                  <div className="w-4 shrink-0" />
                )}
                <Building2 size={16} className="text-bridge-accent shrink-0" />
                <span className="text-sm font-bold text-foreground">
                  {dept.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({dept.total_member_count})
                </span>
                {dept.leader && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    · {dept.leader.user_name}
                  </span>
                )}
                {hasChildren && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    {dept.child_dept_count}
                  </span>
                )}
              </button>

              {/* Members */}
              <AnimatePresence>
                {!isCollapsed && dept.members.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="px-2 pb-2">
                      {dept.members.map((member) => (
                        <MemberListNode
                          key={member.id}
                          member={member}
                          depth={0}
                          isAdmin={isAdmin}
                          onMemberClick={onMemberClick}
                          managerEditMemberId={managerEditMemberId}
                          onManagerEdit={onManagerEdit}
                          allMembers={allMembers}
                          managerSearch={managerSearch}
                          onManagerSearchChange={onManagerSearchChange}
                          onUpdateManager={onUpdateManager}
                          updatingManager={updatingManager}
                          hrSystemEnabled={hrSystemEnabled}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

      {/* Unassigned */}
      {data.unassigned.length > 0 && (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden">
          <button
            onClick={() => onToggleDept("__unassigned__")}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-foreground/5 transition-colors"
          >
            {collapsedDepts.has("__unassigned__") ? (
              <ChevronRight
                size={16}
                className="text-muted-foreground shrink-0"
              />
            ) : (
              <ChevronDown
                size={16}
                className="text-muted-foreground shrink-0"
              />
            )}
            <User size={16} className="text-slate-400 shrink-0" />
            <span className="text-sm font-bold text-foreground">
              {t("organization.chart.unassigned", "Unassigned")}
            </span>
            <span className="text-xs text-muted-foreground">
              ({data.unassigned.length})
            </span>
          </button>

          <AnimatePresence>
            {!collapsedDepts.has("__unassigned__") && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="px-2 pb-2">
                  {data.unassigned.map((member) => (
                    <MemberListNode
                      key={member.id}
                      member={member}
                      depth={0}
                      isAdmin={isAdmin}
                      onMemberClick={onMemberClick}
                      managerEditMemberId={managerEditMemberId}
                      onManagerEdit={onManagerEdit}
                      allMembers={allMembers}
                      managerSearch={managerSearch}
                      onManagerSearchChange={onManagerSearchChange}
                      onUpdateManager={onUpdateManager}
                      updatingManager={updatingManager}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function MemberListNode({
  member,
  depth,
  isAdmin,
  onMemberClick,
  managerEditMemberId,
  onManagerEdit,
  allMembers,
  managerSearch,
  onManagerSearchChange,
  onUpdateManager,
  updatingManager,
  hrSystemEnabled,
}: {
  member: OrgChartMemberNode;
  depth: number;
  isAdmin: boolean;
  onMemberClick: (id: string) => void;
  managerEditMemberId: string | null;
  onManagerEdit: (id: string | null) => void;
  allMembers: OrgChartMemberNode[];
  managerSearch: string;
  onManagerSearchChange: (s: string) => void;
  onUpdateManager: (memberId: string, managerId: string | null) => void;
  updatingManager: boolean;
  hrSystemEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const isEditing = managerEditMemberId === member.id;

  const CONTRACT_LABELS: Record<string, string> = {
    FULL_TIME: t("organization.chart.fullTime", "Full-time"),
    CONTRACT: t("organization.chart.contract", "Contract"),
    INTERN: t("organization.chart.intern", "Intern"),
    PART_TIME: t("organization.chart.partTime", "Part-time"),
  };

  const CONTRACT_COLORS: Record<string, string> = {
    FULL_TIME: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    CONTRACT: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    INTERN: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    PART_TIME: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  };

  const filteredManagerCandidates = allMembers.filter(
    (m) =>
      m.id !== member.id &&
      (managerSearch === "" ||
        m.user_name.toLowerCase().includes(managerSearch.toLowerCase()) ||
        (m.job_title &&
          m.job_title.toLowerCase().includes(managerSearch.toLowerCase()))),
  );

  return (
    <>
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-foreground/5 transition-colors group"
        style={{ paddingLeft: `${12 + depth * 24}px` }}
      >
        {depth > 0 && (
          <div className="text-muted-foreground text-xs select-none">
            |--
          </div>
        )}

        <button
          onClick={() => onMemberClick(member.id)}
          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
        >
          {member.profile_image_url ? (
            <img
              src={resolveFileUrl(member.profile_image_url)}
              alt={member.user_name}
              className="w-8 h-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-bridge-accent">
                {member.user_name?.charAt(0)?.toUpperCase() || "?"}
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {member.user_name}
              </span>
              {member.job_title && (
                <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                  · {member.job_title}
                </span>
              )}
              {!hrSystemEnabled && member.contract_type && (
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded-full hidden sm:inline ${CONTRACT_COLORS[member.contract_type] || "bg-slate-500/15 text-slate-500"}`}
                >
                  {CONTRACT_LABELS[member.contract_type] ||
                    member.contract_type}
                </span>
              )}
            </div>
            {member.job_title && (
              <span className="text-xs text-muted-foreground truncate sm:hidden block">
                {member.job_title}
              </span>
            )}
          </div>
        </button>

        {isAdmin && (
          <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {member.manager_id ? (
              <button
                onClick={() => onUpdateManager(member.id, null)}
                disabled={updatingManager}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                title={t("organization.chart.removeManager", "Remove Manager")}
              >
                <UserMinus size={12} />
              </button>
            ) : (
              <button
                onClick={() => {
                  onManagerEdit(member.id);
                  onManagerSearchChange("");
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-bridge-accent hover:bg-bridge-accent/10 rounded-lg transition-colors"
                title={t("organization.chart.assignManager", "Assign Manager")}
              >
                <UserPlus size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {isEditing && (
        <div
          className="ml-16 mr-2 mb-2 bg-foreground/[0.03] rounded-xl border border-foreground/10 p-2"
          style={{ marginLeft: `${36 + depth * 24}px` }}
        >
          <input
            type="text"
            autoFocus
            value={managerSearch}
            onChange={(e) => onManagerSearchChange(e.target.value)}
            placeholder={t(
              "organization.chart.searchManager",
              "Search manager...",
            )}
            className="w-full bg-transparent text-sm text-foreground placeholder-slate-500 outline-none mb-2 px-1"
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {filteredManagerCandidates.slice(0, 10).map((candidate) => (
              <button
                key={candidate.id}
                onClick={() => onUpdateManager(member.id, candidate.id)}
                disabled={updatingManager}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-foreground/5 transition-colors text-left"
              >
                {candidate.profile_image_url ? (
                  <img
                    src={resolveFileUrl(candidate.profile_image_url)}
                    alt={candidate.user_name}
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-bridge-accent">
                      {candidate.user_name?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {candidate.user_name}
                  </div>
                  {candidate.job_title && (
                    <div className="text-xs text-muted-foreground truncate">
                      {candidate.job_title}
                    </div>
                  )}
                </div>
              </button>
            ))}
            {filteredManagerCandidates.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-2">
                {t("organization.chart.noResults", "No results")}
              </div>
            )}
          </div>
          <button
            onClick={() => onManagerEdit(null)}
            className="w-full mt-1 text-xs text-muted-foreground hover:text-foreground text-center py-1"
          >
            {t("common.cancel", "Cancel")}
          </button>
        </div>
      )}

      {member.reports.map((report) => (
        <MemberListNode
          key={report.id}
          member={report}
          depth={depth + 1}
          isAdmin={isAdmin}
          onMemberClick={onMemberClick}
          managerEditMemberId={managerEditMemberId}
          onManagerEdit={onManagerEdit}
          allMembers={allMembers}
          managerSearch={managerSearch}
          onManagerSearchChange={onManagerSearchChange}
          onUpdateManager={onUpdateManager}
          updatingManager={updatingManager}
          hrSystemEnabled={hrSystemEnabled}
        />
      ))}
    </>
  );
}
