"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  X,
  Check,
  Briefcase,
  Calendar,
  RotateCw,
  Eye,
  EyeOff,
  Pencil,
} from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import { IconButton } from "./ui/IconButton";
import { contractorService, jobRoleService } from "../utils/services";
import { getTodayDateString } from "../utils/dateUtils";
import type { BoardContractor, ContractorPeriod, JobRole } from "../types";
import type { BoardMember } from "./ShareBoardModal";

export type ContractorPeriodStatus = "active" | "upcoming" | "expired" | "none";

// ─── 단일 기간 판정 (KanbanBoardHeader 등 하위호환) ───
export function getContractorPeriodStatus(
  startDate?: string | null,
  endDate?: string | null,
): ContractorPeriodStatus {
  if (!startDate && !endDate) return "none";
  const today = getTodayDateString();
  if (startDate && today < startDate) return "upcoming";
  if (endDate && today > endDate) return "expired";
  return "active";
}

export function getContractorDaysRemaining(
  startDate?: string | null,
  endDate?: string | null,
): string | null {
  const status = getContractorPeriodStatus(startDate, endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (status === "active" && endDate) {
    const end = new Date(endDate + "T00:00:00");
    const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    return `D-${days}`;
  }
  if (status === "upcoming" && startDate) {
    const start = new Date(startDate + "T00:00:00");
    const days = Math.ceil((start.getTime() - today.getTime()) / 86400000);
    return `D-${days}`;
  }
  return null;
}

// ─── 다중 기간 판정 (기간 목록 기준, BE 파생 규칙과 동일) ───
function periodCovers(p: ContractorPeriod, today: string): boolean {
  const afterStart = !p.start_date || p.start_date <= today;
  const beforeEnd = !p.end_date || today <= p.end_date;
  return afterStart && beforeEnd;
}
function periodUpcoming(p: ContractorPeriod, today: string): boolean {
  return !!p.start_date && today < p.start_date;
}

export function getStatusFromPeriods(
  periods?: ContractorPeriod[] | null,
): ContractorPeriodStatus {
  if (!periods || periods.length === 0) return "none";
  const today = getTodayDateString();
  let hasUpcoming = false;
  let hasPast = false;
  for (const p of periods) {
    if (periodCovers(p, today)) return "active";
    if (periodUpcoming(p, today)) hasUpcoming = true;
    else hasPast = true;
  }
  if (hasUpcoming) return "upcoming";
  if (hasPast) return "expired";
  return "none";
}

// 표시용 대표 기간: 오늘 포함 → 가장 가까운 예정 → 가장 최근 과거
export function getCurrentPeriod(
  periods?: ContractorPeriod[] | null,
): ContractorPeriod | null {
  if (!periods || periods.length === 0) return null;
  const today = getTodayDateString();
  let active: ContractorPeriod | null = null;
  let nextUpcoming: ContractorPeriod | null = null;
  let lastPast: ContractorPeriod | null = null;
  for (const p of periods) {
    if (periodCovers(p, today)) {
      if (!active) active = p;
    } else if (periodUpcoming(p, today)) {
      if (!nextUpcoming || p.start_date! < nextUpcoming.start_date!)
        nextUpcoming = p;
    } else {
      if (
        !lastPast ||
        (p.end_date && lastPast.end_date && p.end_date > lastPast.end_date)
      )
        lastPast = p;
    }
  }
  return active || nextUpcoming || lastPast;
}

export function getDaysRemainingFromPeriods(
  periods?: ContractorPeriod[] | null,
): string | null {
  const current = getCurrentPeriod(periods);
  if (!current) return null;
  return getContractorDaysRemaining(current.start_date, current.end_date);
}

const PERIOD_STATUS_STYLES: Record<
  ContractorPeriodStatus,
  { bg: string; text: string; dot: string; bar: string; label: string }
> = {
  active: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    label: "활동중",
  },
  upcoming: {
    bg: "bg-amber-500/15",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    label: "예정",
  },
  expired: {
    bg: "bg-slate-500/15",
    text: "text-slate-500",
    dot: "bg-slate-500",
    bar: "bg-slate-400",
    label: "만료",
  },
  none: {
    bg: "bg-slate-500/15",
    text: "text-slate-500",
    dot: "bg-slate-400",
    bar: "bg-emerald-500",
    label: "기간 미설정",
  },
};

const GROUP_ORDER: ContractorPeriodStatus[] = [
  "active",
  "upcoming",
  "none",
  "expired",
];

const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "indigo", hex: "#6366F1" },
  { name: "purple", hex: "#8B5CF6" },
  { name: "teal", hex: "#14B8A6" },
  { name: "rose", hex: "#F43F5E" },
  { name: "amber", hex: "#F59E0B" },
  { name: "emerald", hex: "#10B981" },
  { name: "sky", hex: "#0EA5E9" },
  { name: "pink", hex: "#EC4899" },
];

const fmtMd = (d?: string | null) => (d ? d.slice(5).replace("-", ".") : "?");
const toMs = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").getTime() : null;

export interface ContractorManageModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  members: BoardMember[];
  currentUserId: string;
  isAdminOrAbove: boolean;
  onChanged?: (contractors: BoardContractor[]) => void;
}

export function ContractorManageModal({
  open,
  onClose,
  boardId,
  members,
  currentUserId,
  isAdminOrAbove,
  onChanged,
}: ContractorManageModalProps) {
  const { t } = useTranslation();
  const [contractors, setContractors] = useState<BoardContractor[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // create form
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(COLOR_PRESETS[0].hex);
  const [newManagerMemberId, setNewManagerMemberId] = useState<string>("");
  const [newJobRoleId, setNewJobRoleId] = useState<string>("");
  const [newStartDate, setNewStartDate] = useState<string>("");
  const [newEndDate, setNewEndDate] = useState<string>("");

  // edit (meta) state — 이름/관리자/직군/색상만, 기간은 periods 로 분리
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>("");
  const [editManagerMemberId, setEditManagerMemberId] = useState<string>("");
  const [editJobRoleId, setEditJobRoleId] = useState<string>("");

  // add-period (갱신/연장) state
  const [addingPeriodFor, setAddingPeriodFor] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");

  // edit-period state
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editPeriodStart, setEditPeriodStart] = useState<string>("");
  const [editPeriodEnd, setEditPeriodEnd] = useState<string>("");

  // 타임라인 범위 + 생성폼 접이식
  const [range, setRange] = useState<3 | 6 | 12>(6);
  const [showCreate, setShowCreate] = useState(false);

  const selfMember = useMemo(
    () => members.find((m) => m.userId === currentUserId) || null,
    [members, currentUserId],
  );

  const reload = async () => {
    setLoading(true);
    try {
      const [list, roles] = await Promise.all([
        contractorService.list(boardId),
        jobRoleService.list(boardId).catch(() => []),
      ]);
      setContractors(list as BoardContractor[]);
      setJobRoles(roles as JobRole[]);
      onChanged?.(list as BoardContractor[]);
    } catch (e: any) {
      setError(e?.message || "Failed to load contractors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      reload();
      if (selfMember) setNewManagerMemberId(selfMember.id);
    } else {
      setEditingId(null);
      setAddingPeriodFor(null);
      setEditingPeriodId(null);
      setNewName("");
      setError(null);
      setShowCreate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boardId]);

  const canEditContractor = (c: BoardContractor): boolean => {
    if (isAdminOrAbove) return true;
    if (!selfMember) return false;
    return c.manager_member_id === selfMember.id;
  };

  const handleCreate = async () => {
    if (submitting) return;
    const name = newName.trim();
    if (!name) return;
    const managerId = newManagerMemberId || selfMember?.id;
    if (!managerId) {
      setError(t("contractor.managerRequired", "관리자 멤버를 선택하세요"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await contractorService.create(boardId, {
        name,
        color: newColor,
        manager_member_id: managerId,
        job_role_id: newJobRoleId || null,
        start_date: newStartDate || null,
        end_date: newEndDate || null,
      });
      setNewName("");
      setNewColor(COLOR_PRESETS[0].hex);
      setNewJobRoleId("");
      setNewStartDate("");
      setNewEndDate("");
      setShowCreate(false);
      await reload();
    } catch (e: any) {
      setError(
        e?.message ||
          t("contractor.duplicateName", "이미 존재하는 외부인원 이름입니다"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (c: BoardContractor) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color || COLOR_PRESETS[0].hex);
    setEditManagerMemberId(c.manager_member_id || "");
    setEditJobRoleId(c.job_role?.id || "");
  };

  const saveEdit = async () => {
    if (submitting || !editingId) return;
    const name = editName.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      await contractorService.update(boardId, editingId, {
        name,
        color: editColor,
        manager_member_id: editManagerMemberId || undefined,
        job_role_id: editJobRoleId || null,
      });
      setEditingId(null);
      await reload();
    } catch (e: any) {
      setError(e?.message || "Failed to update");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (c: BoardContractor) => {
    if (
      !confirm(
        t(
          "contractor.deleteConfirm",
          "이 외부인원을 삭제하시겠습니까? 할당된 항목은 미배정으로 변경됩니다.",
        ),
      )
    )
      return;
    try {
      await contractorService.remove(boardId, c.id);
      await reload();
    } catch (e: any) {
      setError(e?.message || "Failed to delete");
    }
  };

  const handleToggleHidden = async (c: BoardContractor) => {
    setError(null);
    try {
      await contractorService.setHidden(boardId, c.id, !c.hidden);
      await reload();
    } catch (e: any) {
      setError(e?.message || "Failed to change visibility");
    }
  };

  // ─── periods (갱신/연장) ───
  const openAddPeriod = (c: BoardContractor) => {
    setAddingPeriodFor(c.id);
    setPeriodStart(getTodayDateString());
    setPeriodEnd("");
    setEditingPeriodId(null);
  };

  const submitAddPeriod = async (c: BoardContractor) => {
    if (submitting || !periodStart) return;
    setSubmitting(true);
    setError(null);
    try {
      await contractorService.addPeriod(boardId, c.id, {
        start_date: periodStart || null,
        end_date: periodEnd || null,
      });
      setAddingPeriodFor(null);
      setPeriodStart("");
      setPeriodEnd("");
      await reload();
    } catch (e: any) {
      setError(e?.message || "Failed to add period");
    } finally {
      setSubmitting(false);
    }
  };

  const startEditPeriod = (p: ContractorPeriod) => {
    setEditingPeriodId(p.id);
    setEditPeriodStart(p.start_date || "");
    setEditPeriodEnd(p.end_date || "");
    setAddingPeriodFor(null);
  };

  const saveEditPeriod = async (c: BoardContractor, p: ContractorPeriod) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await contractorService.updatePeriod(boardId, c.id, p.id, {
        start_date: editPeriodStart || null,
        end_date: editPeriodEnd || null,
        clear_start_date: !editPeriodStart && !!p.start_date,
        clear_end_date: !editPeriodEnd && !!p.end_date,
      });
      setEditingPeriodId(null);
      await reload();
    } catch (e: any) {
      setError(e?.message || "Failed to update period");
    } finally {
      setSubmitting(false);
    }
  };

  const deletePeriodHandler = async (
    c: BoardContractor,
    p: ContractorPeriod,
  ) => {
    if (
      !confirm(
        t("contractor.deletePeriodConfirm", "이 기간을 삭제하시겠습니까?"),
      )
    )
      return;
    setError(null);
    try {
      await contractorService.deletePeriod(boardId, c.id, p.id);
      await reload();
    } catch (e: any) {
      setError(e?.message || "Failed to delete period");
    }
  };

  // 일반 멤버: 본인만 manager 선택지로
  const managerOptions = isAdminOrAbove
    ? members.filter((m) => m.role !== "viewer")
    : selfMember
      ? [selfMember]
      : [];

  // ─── 타임라인 창(월 범위) ───
  const timeWin = useMemo(() => {
    const today = getTodayDateString();
    const td = new Date(today + "T00:00:00");
    const ty = td.getFullYear();
    const tm = td.getMonth();
    let start: Date;
    let count: number;
    if (range === 12) {
      start = new Date(ty, 0, 1);
      count = 12;
    } else if (range === 3) {
      start = new Date(ty, tm - 1, 1);
      count = 3;
    } else {
      start = new Date(ty, tm - 2, 1);
      count = 6;
    }
    const end = new Date(start.getFullYear(), start.getMonth() + count, 1);
    return {
      start,
      count,
      startMs: start.getTime(),
      endMs: end.getTime(),
      today,
    };
  }, [range]);

  const span = timeWin.endMs - timeWin.startMs;
  const frac = (ms: number) => (ms - timeWin.startMs) / span;
  const todayFrac = frac(toMs(timeWin.today)!);
  const months = Array.from({ length: timeWin.count }, (_, i) => {
    const d = new Date(
      timeWin.start.getFullYear(),
      timeWin.start.getMonth() + i,
      1,
    );
    return { label: `${d.getMonth() + 1}월`, left: frac(d.getTime()) * 100 };
  });
  const laneBg = {
    backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / timeWin.count}% - 1px), rgba(148,163,184,0.14) calc(${100 / timeWin.count}% - 1px), rgba(148,163,184,0.14) ${100 / timeWin.count}%)`,
  };

  // 상태별 카운트 + 그룹
  const statusCounts = useMemo(() => {
    const c = { active: 0, upcoming: 0, expired: 0, none: 0 };
    contractors.forEach((x) => {
      c[getStatusFromPeriods(x.periods || [])] += 1;
    });
    return c;
  }, [contractors]);

  const grouped = useMemo(
    () =>
      GROUP_ORDER.map((st) => ({
        status: st,
        items: contractors
          .filter((c) => getStatusFromPeriods(c.periods || []) === st)
          .sort((a, b) => Number(!!a.hidden) - Number(!!b.hidden)),
      })).filter((g) => g.items.length > 0),
    [contractors],
  );

  const rangeOptions: { r: 3 | 6 | 12; label: string }[] = [
    { r: 3, label: t("contractor.range3", "3개월") },
    { r: 6, label: t("contractor.range6", "6개월") },
    { r: 12, label: t("contractor.range12", "연간") },
  ];

  // 한 외부인원(리치 로우) 렌더
  const renderRow = (c: BoardContractor) => {
    const isEditing = editingId === c.id;
    const canEdit = canEditContractor(c);
    const periods = c.periods || [];
    const status = getStatusFromPeriods(periods);
    const dday = getDaysRemainingFromPeriods(periods);
    const cur = getCurrentPeriod(periods);
    const editP = periods.find((p) => p.id === editingPeriodId) || null;
    const periodPanelOpen = addingPeriodFor === c.id || !!editP;

    const periodLabel =
      cur && status === "upcoming" && cur.start_date
        ? `${fmtMd(cur.start_date)}~`
        : cur && cur.end_date
          ? `~${fmtMd(cur.end_date)}`
          : null;

    const actionBtns = (
      <>
        <IconButton
          aria-label={
            status === "expired"
              ? t("contractor.renew", "갱신")
              : t("contractor.addPeriod", "기간 추가")
          }
          onClick={() => openAddPeriod(c)}
          size="sm"
        >
          <RotateCw />
        </IconButton>
        <IconButton
          aria-label={t("common.edit", "수정")}
          onClick={() => startEdit(c)}
          size="sm"
        >
          <Pencil />
        </IconButton>
        <IconButton
          aria-label={
            c.hidden
              ? t("contractor.show", "표시")
              : t("contractor.hide", "숨기기")
          }
          onClick={() => handleToggleHidden(c)}
          size="sm"
        >
          {c.hidden ? <Eye /> : <EyeOff />}
        </IconButton>
        <IconButton
          aria-label={t("common.delete", "삭제")}
          onClick={() => handleDelete(c)}
          size="sm"
        >
          <Trash2 />
        </IconButton>
      </>
    );

    return (
      <li
        key={c.id}
        className={`group relative rounded-xl bg-foreground/[0.03] border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors overflow-hidden ${
          c.hidden && !isEditing ? "opacity-60" : ""
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-stretch">
          {/* ── 좌: 정보 + 액션 ── */}
          <div className="w-full md:w-[248px] shrink-0 md:border-r border-foreground/[0.08] p-2.5 flex flex-col justify-center gap-1.5">
            {isEditing ? (
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (e.nativeEvent.isComposing || e.repeat) return;
                    e.preventDefault();
                    saveEdit();
                  }}
                  maxLength={50}
                  autoFocus
                />
                <div className="flex items-center gap-1.5">
                  <select
                    value={editManagerMemberId}
                    onChange={(e) => setEditManagerMemberId(e.target.value)}
                    className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground"
                    disabled={!isAdminOrAbove}
                  >
                    {managerOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={editJobRoleId}
                    onChange={(e) => setEditJobRoleId(e.target.value)}
                    className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground"
                  >
                    <option value="">
                      {t("contractor.noJobRole", "미지정")}
                    </option>
                    {jobRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  {COLOR_PRESETS.slice(0, 6).map((cp) => (
                    <button
                      key={cp.name}
                      type="button"
                      onClick={() => setEditColor(cp.hex)}
                      className={`w-4 h-4 rounded-full border-2 ${editColor === cp.hex ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: cp.hex }}
                      aria-label={cp.name}
                    />
                  ))}
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton
                      aria-label={t("common.save", "저장")}
                      onClick={saveEdit}
                      size="sm"
                    >
                      <Check />
                    </IconButton>
                    <IconButton
                      aria-label={t("common.cancel", "취소")}
                      onClick={() => setEditingId(null)}
                      size="sm"
                    >
                      <X />
                    </IconButton>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 border-2 border-dashed border-foreground/30"
                    style={{ backgroundColor: c.color || "#6366F1" }}
                  />
                  <span className="text-sm font-bold text-foreground truncate">
                    {c.name}
                  </span>
                  {status !== "none" && (
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${PERIOD_STATUS_STYLES[status].bg} ${PERIOD_STATUS_STYLES[status].text}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${PERIOD_STATUS_STYLES[status].dot}`}
                      />
                      {t(
                        `contractor.status.${status}`,
                        PERIOD_STATUS_STYLES[status].label,
                      )}
                    </span>
                  )}
                  {periodLabel && (
                    <span className="ml-auto text-xs text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                      {periodLabel}
                      {dday && (
                        <span
                          className={`ml-1 font-bold ${PERIOD_STATUS_STYLES[status].text}`}
                        >
                          {dday}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs text-slate-500 truncate min-w-0 flex-1">
                    {c.manager_name || t("contractor.noManager", "관리자 없음")}
                    {c.job_role?.name ? ` · ${c.job_role.name}` : ""}
                    {c.hidden ? ` · ${t("contractor.hidden", "숨김")}` : ""}
                  </span>
                  {canEdit && (
                    <span className="flex md:hidden items-center gap-0.5 shrink-0">
                      {actionBtns}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── 우: 계약 막대(간트) — 모바일 숨김 ── */}
          <div
            className="relative hidden md:block flex-1 min-h-[52px]"
            style={laneBg}
          >
            {todayFrac >= 0 && todayFrac <= 1 && (
              <span
                className="absolute top-0 bottom-0 w-0.5 bg-bridge-accent/70 z-10 pointer-events-none"
                style={{ left: `${todayFrac * 100}%` }}
              />
            )}
            {periods.map((p) => {
              const s = toMs(p.start_date) ?? timeWin.startMs;
              const e = toMs(p.end_date) ?? timeWin.endMs;
              const ls = frac(s);
              const le = frac(e);
              if (le <= 0 || ls >= 1) return null;
              const L = Math.max(0, Math.min(1, ls));
              const R = Math.max(0, Math.min(1, le));
              const ps = getContractorPeriodStatus(p.start_date, p.end_date);
              const clipL = ls < 0 || !p.start_date;
              const clipR = le > 1 || !p.end_date;
              const showLbl = R - L > 0.14;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => canEdit && startEditPeriod(p)}
                  disabled={!canEdit}
                  title={`${p.start_date || "?"} ~ ${p.end_date || t("contractor.ongoing", "진행중")}`}
                  className={`group absolute top-1/2 -translate-y-1/2 h-5 rounded-md flex items-center px-1.5 overflow-hidden text-white text-xs font-bold shadow-sm hover:brightness-110 hover:z-20 transition disabled:cursor-default ${PERIOD_STATUS_STYLES[ps].bar} ${ps === "expired" ? "opacity-60" : ""} ${editingPeriodId === p.id ? "ring-2 ring-white/80" : ""}`}
                  style={{
                    left: `${L * 100}%`,
                    width: `calc(${Math.max((R - L) * 100, 3)}% )`,
                  }}
                >
                  {clipL && (
                    <span className="absolute left-0 top-0 bottom-0 w-2.5 bg-gradient-to-r from-black/25 to-transparent" />
                  )}
                  {clipR && (
                    <span className="absolute right-0 top-0 bottom-0 w-2.5 bg-gradient-to-l from-black/25 to-transparent" />
                  )}
                  {showLbl && (
                    <span className="relative truncate">
                      {fmtMd(p.start_date)}–{fmtMd(p.end_date)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 데스크톱: hover 시 우측 플로팅 액션 툴바 ── */}
        {canEdit && !isEditing && (
          <div className="hidden md:flex items-center gap-0.5 absolute top-1.5 right-2 z-30 rounded-lg bg-bridge-obsidian/95 border border-foreground/10 px-0.5 shadow-lg opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {actionBtns}
          </div>
        )}

        {/* ── 기간 추가/수정 패널 ── */}
        {periodPanelOpen && (
          <div className="px-2.5 pb-2.5 pt-1.5 border-t border-foreground/[0.06]">
            {addingPeriodFor === c.id && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-bridge-secondary shrink-0" />
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
                <span className="text-xs text-slate-500">~</span>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
                <IconButton
                  aria-label={t("common.save", "저장")}
                  onClick={() => submitAddPeriod(c)}
                  size="sm"
                  disabled={!periodStart || submitting}
                >
                  <Check />
                </IconButton>
                <IconButton
                  aria-label={t("common.cancel", "취소")}
                  onClick={() => setAddingPeriodFor(null)}
                  size="sm"
                >
                  <X />
                </IconButton>
              </div>
            )}
            {editP && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="date"
                  value={editPeriodStart}
                  onChange={(e) => setEditPeriodStart(e.target.value)}
                  className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
                <span className="text-xs text-slate-500">~</span>
                <input
                  type="date"
                  value={editPeriodEnd}
                  onChange={(e) => setEditPeriodEnd(e.target.value)}
                  className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
                <IconButton
                  aria-label={t("common.save", "저장")}
                  onClick={() => saveEditPeriod(c, editP)}
                  size="sm"
                >
                  <Check />
                </IconButton>
                <IconButton
                  aria-label={t("contractor.deletePeriod", "기간 삭제")}
                  onClick={() => deletePeriodHandler(c, editP)}
                  size="sm"
                >
                  <Trash2 />
                </IconButton>
                <IconButton
                  aria-label={t("common.cancel", "취소")}
                  onClick={() => setEditingPeriodId(null)}
                  size="sm"
                >
                  <X />
                </IconButton>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label={t("contractor.manage", "외부인원 관리")}
      className="sm:max-w-3xl"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div>
          <h2 className="text-sm md:text-base font-bold text-foreground tracking-tight flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-bridge-secondary" />
            {t("contractor.manage", "외부인원 관리")}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t(
              "contractor.manageDesc",
              "계약 기간·담당을 한 곳에서 관리합니다",
            )}
          </p>
        </div>
        <IconButton
          aria-label={t("common.close", "닫기")}
          onClick={onClose}
          size="sm"
        >
          <X />
        </IconButton>
      </div>

      {/* 툴바: 범례 + 범위 */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-foreground/[0.06]">
        <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            {t("contractor.status.active", "활동중")} {statusCounts.active}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
            {t("contractor.status.upcoming", "예정")} {statusCounts.upcoming}
          </span>
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
            {t("contractor.status.expired", "만료")} {statusCounts.expired}
          </span>
        </div>
        <div className="ml-auto hidden md:inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-foreground/[0.04] border border-foreground/[0.08]">
          {rangeOptions.map((o) => (
            <button
              key={o.r}
              type="button"
              onClick={() => setRange(o.r)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                range === o.r
                  ? "bg-bridge-obsidian text-foreground font-bold shadow-sm"
                  : "text-slate-400 hover:text-foreground font-medium"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5 pt-3 max-h-[62vh] overflow-y-auto custom-scrollbar">
        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* 월 축 (md+) */}
        {contractors.length > 0 && (
          <div className="hidden md:flex items-end h-5 mb-1.5">
            <div className="w-[248px] shrink-0" />
            <div className="relative flex-1">
              {months.map((m, i) => (
                <span
                  key={i}
                  className="absolute bottom-0 text-xs text-slate-500 tabular-nums"
                  style={{ left: `${m.left}%`, transform: "translateX(4px)" }}
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {loading && contractors.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            {t("common.loading", "로딩 중...")}
          </div>
        ) : contractors.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            {t("contractor.empty", "등록된 외부인원이 없습니다")}
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.status}>
                <div className="flex items-center gap-2 mb-1.5 px-0.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {g.status === "none"
                      ? t("contractor.noPeriodGroup", "기간 미설정")
                      : t(
                          `contractor.status.${g.status}`,
                          PERIOD_STATUS_STYLES[g.status].label,
                        )}
                  </span>
                  <span className="text-xs font-bold text-slate-500 tabular-nums">
                    {g.items.length}
                  </span>
                  <span className="flex-1 h-px bg-foreground/[0.06]" />
                </div>
                <ul className="space-y-1.5">{g.items.map(renderRow)}</ul>
              </div>
            ))}
          </div>
        )}

        {/* 추가 (접이식) */}
        <div className="mt-4">
          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-foreground/20 text-xs font-bold text-slate-400 hover:border-bridge-accent hover:text-bridge-accent hover:bg-bridge-accent/[0.06] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("contractor.addPerson", "외부인원 추가")}
            </button>
          ) : (
            <div className="p-3 rounded-xl bg-foreground/[0.03] border border-foreground/10 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t(
                    "contractor.namePlaceholder",
                    "외부인원 이름 (예: 외주A)",
                  )}
                  className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-2 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (e.nativeEvent.isComposing || e.repeat) return;
                    e.preventDefault();
                    handleCreate();
                  }}
                  maxLength={50}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || submitting}
                  className="px-3 py-2 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  {t("contractor.add", "추가")}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 shrink-0 w-12">
                  {t("contractor.manager", "관리자")}
                </span>
                <select
                  value={newManagerMemberId}
                  onChange={(e) => setNewManagerMemberId(e.target.value)}
                  className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  disabled={!isAdminOrAbove}
                >
                  {managerOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 shrink-0 w-12">
                  {t("contractor.jobRole", "직군")}
                </span>
                <select
                  value={newJobRoleId}
                  onChange={(e) => setNewJobRoleId(e.target.value)}
                  className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                >
                  <option value="">
                    {t("contractor.noJobRole", "미지정")}
                  </option>
                  {jobRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 shrink-0 w-12">
                  {t("contractor.period", "기간")}
                </span>
                <input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
                <span className="text-xs text-slate-500">~</span>
                <input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="flex-1 min-w-0 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 w-12 shrink-0">
                  {t("jobRole.colorLabel", "색상")}
                </span>
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setNewColor(c.hex)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c.hex ? "border-foreground scale-110" : "border-transparent hover:scale-110"}`}
                    style={{ backgroundColor: c.hex }}
                    aria-label={c.name}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="ml-auto text-xs text-slate-500 hover:text-foreground transition-colors"
                >
                  {t("common.cancel", "취소")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          {t("common.escToClose", "Esc 닫기")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
        >
          {t("common.close", "닫기")}
        </button>
      </div>
    </MotionModal>
  );
}

export default ContractorManageModal;
