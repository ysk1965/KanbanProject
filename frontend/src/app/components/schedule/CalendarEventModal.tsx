import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { MotionModal } from "../ui/MotionModal";
import { IconButton } from "../ui/IconButton";
import {
  calendarEventAPI,
  CalendarEventItem,
  CalendarEventPayload,
} from "../../utils/api";
import { getTodayDateString } from "../../utils/dateUtils";
import {
  CALENDAR_TYPES,
  CalendarCategory,
  MEMBER_TYPES,
  TEAM_TYPES,
  calendarTypeMeta,
} from "./calendarEventMeta";

export interface CalendarMemberOption {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface CalendarEventModalInitial {
  category?: CalendarCategory;
  eventType?: string;
  memberId?: string;
  date?: string; // yyyy-MM-dd — 시작일 프리필
  endDate?: string; // yyyy-MM-dd — 종료일 프리필 (기간 드래그)
}

interface CalendarEventModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  members: CalendarMemberOption[];
  initial?: CalendarEventModalInitial;
  editing?: CalendarEventItem | null;
  onSaved: () => void;
}

const TABS: { category: CalendarCategory; label: string; hint: string }[] = [
  { category: "TEAM", label: "이벤트", hint: "팀 전체에 표시" },
  { category: "MEMBER", label: "부재", hint: "특정 멤버가 자리를 비움" },
  { category: "CALENDAR", label: "휴무일", hint: "날짜 성격 재정의" },
];

function typesFor(category: CalendarCategory) {
  if (category === "TEAM") return TEAM_TYPES;
  if (category === "MEMBER") return MEMBER_TYPES;
  return CALENDAR_TYPES;
}

export function CalendarEventModal({
  open,
  onClose,
  boardId,
  members,
  initial,
  editing,
  onSaved,
}: CalendarEventModalProps) {
  const [category, setCategory] = useState<CalendarCategory>("TEAM");
  const [eventType, setEventType] = useState<string>("BUILD");
  const [memberId, setMemberId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(getTodayDateString());
  const [endDate, setEndDate] = useState<string>(getTodayDateString());
  const [recurring, setRecurring] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // open 전환 시 초기화 (editing 우선, 없으면 initial)
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);

    if (editing) {
      const meta = calendarTypeMeta(editing.event_type);
      setCategory(meta.category);
      setEventType(editing.event_type);
      setMemberId(editing.member?.id || "");
      setTitle(editing.title || "");
      setStartDate(editing.start_date);
      setEndDate(editing.end_date);
      setRecurring(editing.recurring);
      return;
    }

    const cat = initial?.category || "TEAM";
    const type = initial?.eventType || typesFor(cat)[0].key;
    const startD = initial?.date || getTodayDateString();
    const endD = initial?.endDate || startD;
    setCategory(cat);
    setEventType(type);
    setMemberId(initial?.memberId || "");
    setTitle("");
    setStartDate(startD);
    setEndDate(endD < startD ? startD : endD);
    setRecurring(false);
  }, [open, editing, initial]);

  const meta = useMemo(() => calendarTypeMeta(eventType), [eventType]);

  const handleTab = (cat: CalendarCategory) => {
    setCategory(cat);
    setEventType(typesFor(cat)[0].key);
  };

  const canSave = useMemo(() => {
    if (!startDate) return false;
    if (category === "MEMBER" && !memberId) return false;
    return true;
  }, [category, memberId, startDate]);

  const handleSave = async () => {
    if (!canSave || saving) return;

    // 종료일 결정: 팀 이벤트·부재는 시작~끝 범위, 휴무일은 단일
    const effectiveEnd =
      category === "CALENDAR" ? startDate : endDate || startDate;

    if (effectiveEnd < startDate) {
      setError("종료일이 시작일보다 빠릅니다.");
      return;
    }

    const payload: CalendarEventPayload = {
      event_type: eventType,
      member_id: category === "MEMBER" ? memberId : null,
      title: title.trim() || null,
      start_date: startDate,
      end_date: effectiveEnd,
      recurring: category === "CALENDAR" ? recurring : false,
    };

    try {
      setSaving(true);
      setError(null);
      if (editing) {
        await calendarEventAPI.update(boardId, editing.id, payload);
      } else {
        await calendarEventAPI.create(boardId, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      console.warn("Failed to save calendar event", err);
      setError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing || saving) return;
    try {
      setSaving(true);
      await calendarEventAPI.remove(boardId, editing.id);
      onSaved();
      onClose();
    } catch (err) {
      console.warn("Failed to delete calendar event", err);
      setError("삭제에 실패했습니다.");
      setSaving(false);
    }
  };

  const types = typesFor(category);
  const titlePlaceholder =
    category === "CALENDAR"
      ? "예: 창립기념일"
      : category === "MEMBER"
        ? "예: 부산 출장 · 오전 반차 · 재택"
        : "예: v1.2 클라이언트 빌드";

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label={editing ? "특별 일정 편집" : "특별 일정 추가"}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <span className="text-lg leading-none">{meta.icon}</span>
        <span className="text-sm font-bold text-foreground">
          {editing ? "특별 일정 편집" : "특별 일정 추가"}
        </span>
        <div className="ml-auto">
          <IconButton aria-label="닫기" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 flex flex-col gap-4">
        {/* 카테고리 탭 — 편집 중에는 카테고리 고정 */}
        {!editing && (
          <div className="grid grid-cols-3 gap-1.5">
            {TABS.map((tab) => {
              const active = tab.category === category;
              return (
                <button
                  key={tab.category}
                  type="button"
                  onClick={() => handleTab(tab.category)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border transition-colors ${
                    active
                      ? "border-bridge-accent/60 bg-bridge-accent/15 text-foreground"
                      : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5"
                  }`}
                >
                  <span className="text-xs font-bold">{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-500 -mt-1">
          {TABS.find((t) => t.category === category)?.hint}
        </p>

        {/* 종류 — 부재(MEMBER)는 사유 분류 없이 단일 타입이라 선택기 숨김 */}
        {category !== "MEMBER" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
              종류
            </label>
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => {
                const active = t.key === eventType;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setEventType(t.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? "text-foreground"
                        : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5"
                    }`}
                    style={
                      active
                        ? {
                            borderColor: `${t.color}99`,
                            backgroundColor: `${t.color}26`,
                          }
                        : undefined
                    }
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 대상 멤버 (부재 전용) */}
        {category === "MEMBER" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
              대상 멤버
            </label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            >
              <option value="" disabled>
                멤버 선택…
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 제목/이름/메모 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {category === "CALENDAR"
              ? "이름"
              : category === "MEMBER"
                ? "내용"
                : "제목"}
          </label>
          <input
            type="text"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={titlePlaceholder}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>

        {/* 날짜 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {category === "CALENDAR" ? "날짜" : "기간"}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const v = e.target.value;
                setStartDate(v);
                // 종료일이 시작일보다 빠르면 시작일로 맞춤
                if (endDate < v) setEndDate(v);
              }}
              className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all [color-scheme:dark]"
            />
            {category !== "CALENDAR" && (
              <>
                <span className="text-slate-500 text-sm">~</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all [color-scheme:dark]"
                />
              </>
            )}
          </div>
          {category !== "CALENDAR" && (
            <p className="text-xs text-slate-500">
              하루 일정이면 시작·종료를 같은 날짜로 두세요.
            </p>
          )}

          {/* 휴무일: 매년 반복 */}
          {category === "CALENDAR" && (
            <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="accent-bridge-accent w-4 h-4"
              />
              <span className="text-xs text-slate-400">🔁 매년 이 날 반복</span>
            </label>
          )}
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        {editing ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            삭제
          </button>
        ) : (
          <span className="text-xs text-slate-600">Esc 닫기</span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {editing ? "저장" : "추가"}
        </button>
      </div>
    </MotionModal>
  );
}
