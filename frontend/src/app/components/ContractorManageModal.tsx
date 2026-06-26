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
  { bg: string; text: string; dot: string; label: string }
> = {
  active: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    label: "활동중",
  },
  upcoming: {
    bg: "bg-amber-500/15",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    label: "예정",
  },
  expired: {
    bg: "bg-slate-500/15",
    text: "text-slate-500",
    dot: "bg-slate-500",
    label: "만료",
  },
  none: { bg: "", text: "", dot: "", label: "" },
};

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
      await reload();
    } catch (e: any) {
      setError(
        e?.message ||
          t("contractor.duplicateName", "이미 존재하는 외주 이름입니다"),
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
          "이 외주를 삭제하시겠습니까? 할당된 항목은 미배정으로 변경됩니다.",
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

  // 숨긴 외주는 목록 하단으로 정렬 (활동중 외주를 위로)
  const orderedContractors = useMemo(
    () =>
      [...contractors].sort(
        (a, b) => Number(!!a.hidden) - Number(!!b.hidden),
      ),
    [contractors],
  );

  // 일반 멤버: 본인만 manager 선택지로
  const managerOptions = isAdminOrAbove
    ? members.filter((m) => m.role !== "viewer")
    : selfMember
      ? [selfMember]
      : [];

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label={t("contractor.manage", "외주 관리")}
      className="sm:max-w-lg"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div>
          <h2 className="text-sm md:text-base font-bold text-foreground tracking-tight flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-bridge-secondary" />
            {t("contractor.manage", "외주 관리")}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t(
              "contractor.manageDesc",
              "관리하는 외주 인력을 워크로드 뷰의 별도 행으로 표시합니다",
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

      <div className="px-5 pb-5 pt-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {/* Create form */}
        <div className="mb-4 p-3 rounded-xl bg-foreground/[0.03] border border-foreground/10 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t(
                "contractor.namePlaceholder",
                "외주 이름 (예: 외주A)",
              )}
              className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-2 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (e.nativeEvent.isComposing || e.repeat) return;
                e.preventDefault();
                handleCreate();
              }}
              maxLength={50}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || submitting}
              className="px-3 py-2 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              {t("contractor.add", "추가")}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 shrink-0">
              {t("contractor.manager", "관리자")}:
            </span>
            <select
              value={newManagerMemberId}
              onChange={(e) => setNewManagerMemberId(e.target.value)}
              className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
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
            <span className="text-xs text-slate-500 shrink-0">
              {t("contractor.jobRole", "직군")}:
            </span>
            <select
              value={newJobRoleId}
              onChange={(e) => setNewJobRoleId(e.target.value)}
              className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
            >
              <option value="">{t("contractor.noJobRole", "미지정")}</option>
              {jobRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 shrink-0">
              {t("contractor.period", "기간")}:
            </span>
            <input
              type="date"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
            />
            <span className="text-xs text-slate-500">~</span>
            <input
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">
              {t("jobRole.colorLabel", "색상")}:
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
          </div>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {loading && contractors.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            {t("common.loading", "로딩 중...")}
          </div>
        ) : contractors.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            {t("contractor.empty", "등록된 외주가 없습니다")}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {orderedContractors.map((c) => {
              const isEditing = editingId === c.id;
              const canEdit = canEditContractor(c);
              const periods = c.periods || [];
              const status = getStatusFromPeriods(periods);
              const dday = getDaysRemainingFromPeriods(periods);
              return (
                <li
                  key={c.id}
                  className={`px-2 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors ${c.hidden && !isEditing ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border-2 border-dashed border-foreground/30"
                      style={{
                        backgroundColor: isEditing
                          ? editColor
                          : c.color || "#6366F1",
                      }}
                    />
                    {isEditing ? (
                      <div className="flex-1 flex flex-col gap-1.5">
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
                            onChange={(e) =>
                              setEditManagerMemberId(e.target.value)
                            }
                            className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground"
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
                            className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground"
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
                        <button
                          type="button"
                          onClick={() => canEdit && startEdit(c)}
                          disabled={!canEdit}
                          className="flex-1 text-left disabled:cursor-default min-w-0"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-foreground font-medium truncate">
                              {c.name}
                            </span>
                            {status !== "none" && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${PERIOD_STATUS_STYLES[status].bg} ${PERIOD_STATUS_STYLES[status].text}`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${PERIOD_STATUS_STYLES[status].dot}`}
                                />
                                {t(
                                  `contractor.status.${status}`,
                                  PERIOD_STATUS_STYLES[status].label,
                                )}
                                {dday && <span className="ml-0.5">{dday}</span>}
                              </span>
                            )}
                            {c.hidden && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/15 text-slate-500">
                                <EyeOff className="w-3 h-3" />
                                {t("contractor.hidden", "숨김")}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {c.manager_name ||
                              t("contractor.noManager", "관리자 없음")}
                            {c.job_role?.name ? ` · ${c.job_role.name}` : ""}
                          </div>
                        </button>
                        {canEdit && (
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
                        )}
                        {canEdit && (
                          <IconButton
                            aria-label={t("common.delete", "삭제")}
                            onClick={() => handleDelete(c)}
                            size="sm"
                          >
                            <Trash2 />
                          </IconButton>
                        )}
                      </>
                    )}
                  </div>

                  {/* 계약 기간 목록 */}
                  {!isEditing && (
                    <div className="mt-1.5 pl-5 space-y-1">
                      {periods.length === 0 && (
                        <div className="text-xs text-slate-600">
                          {t("contractor.noPeriod", "등록된 기간이 없습니다")}
                        </div>
                      )}
                      {periods.map((p) => {
                        const ps = getContractorPeriodStatus(
                          p.start_date,
                          p.end_date,
                        );
                        const isEditingPeriod = editingPeriodId === p.id;
                        if (isEditingPeriod) {
                          return (
                            <div
                              key={p.id}
                              className="flex items-center gap-1.5"
                            >
                              <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                              <input
                                type="date"
                                value={editPeriodStart}
                                onChange={(e) =>
                                  setEditPeriodStart(e.target.value)
                                }
                                className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                              />
                              <span className="text-xs text-slate-500">~</span>
                              <input
                                type="date"
                                value={editPeriodEnd}
                                onChange={(e) =>
                                  setEditPeriodEnd(e.target.value)
                                }
                                className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                              />
                              <IconButton
                                aria-label={t("common.save", "저장")}
                                onClick={() => saveEditPeriod(c, p)}
                                size="sm"
                              >
                                <Check />
                              </IconButton>
                              <IconButton
                                aria-label={t("common.cancel", "취소")}
                                onClick={() => setEditingPeriodId(null)}
                                size="sm"
                              >
                                <X />
                              </IconButton>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={p.id}
                            className="flex items-center gap-1.5 text-xs text-slate-500 group"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${PERIOD_STATUS_STYLES[ps].dot || "bg-slate-500"}`}
                            />
                            <button
                              type="button"
                              onClick={() => canEdit && startEditPeriod(p)}
                              disabled={!canEdit}
                              className="text-left disabled:cursor-default hover:text-foreground transition-colors"
                            >
                              {fmtMd(p.start_date)} ~ {fmtMd(p.end_date)}
                            </button>
                            {canEdit && (
                              <IconButton
                                aria-label={t(
                                  "contractor.deletePeriod",
                                  "기간 삭제",
                                )}
                                onClick={() => deletePeriodHandler(c, p)}
                                size="sm"
                                className="opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 />
                              </IconButton>
                            )}
                          </div>
                        );
                      })}

                      {/* 갱신/연장 추가 폼 */}
                      {addingPeriodFor === c.id ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-bridge-secondary shrink-0" />
                          <input
                            type="date"
                            value={periodStart}
                            onChange={(e) => setPeriodStart(e.target.value)}
                            className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                          />
                          <span className="text-xs text-slate-500">~</span>
                          <input
                            type="date"
                            value={periodEnd}
                            onChange={(e) => setPeriodEnd(e.target.value)}
                            className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
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
                      ) : (
                        canEdit && (
                          <button
                            type="button"
                            onClick={() => openAddPeriod(c)}
                            className="flex items-center gap-1 text-xs font-bold text-bridge-secondary hover:text-bridge-secondary/80 transition-colors"
                          >
                            <RotateCw className="w-3 h-3" />
                            {status === "expired"
                              ? t("contractor.renew", "갱신")
                              : t("contractor.addPeriod", "기간 추가")}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
