import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, StickyNote, Trash2, X } from "lucide-react";
import { MotionModal } from "../ui/MotionModal";
import { IconButton } from "../ui/IconButton";
import {
  calendarEventAPI,
  CalendarEventItem,
  CalendarEventPayload,
} from "../../utils/api";
import { getTodayDateString, formatRelativeTime } from "../../utils/dateUtils";
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

const MEMO_MAX = 2000;

function typesFor(category: CalendarCategory) {
  if (category === "TEAM") return TEAM_TYPES;
  if (category === "MEMBER") return MEMBER_TYPES;
  return CALENDAR_TYPES;
}

/** 메모 본문 렌더 — http(s) URL만 링크로 변환 */
function renderMemoText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-bridge-accent hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
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

  // ------ 공유 메모 상태 ------
  // memoValue/memoMeta: 서버에 저장된 현재 메모 (편집 모드)
  // memoDraft: textarea 내용 (추가 모드에서는 생성 payload에 실림)
  const [memoValue, setMemoValue] = useState<string | null>(null);
  const [memoMeta, setMemoMeta] = useState<{
    by: CalendarEventItem["memo_updated_by"];
    at: string | null;
  }>({ by: null, at: null });
  const [memoDraft, setMemoDraft] = useState<string>("");
  const [memoEditing, setMemoEditing] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);

  // open 전환 시 초기화 (editing 우선, 없으면 initial)
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setMemoEditing(false);
    setMemoSaving(false);
    setMemoError(null);

    if (editing) {
      const meta = calendarTypeMeta(editing.event_type);
      setCategory(meta.category);
      setEventType(editing.event_type);
      setMemberId(editing.member?.id || "");
      setTitle(editing.title || "");
      setStartDate(editing.start_date);
      setEndDate(editing.end_date);
      setRecurring(editing.recurring);
      setMemoValue(editing.memo);
      setMemoMeta({ by: editing.memo_updated_by, at: editing.memo_updated_at });
      setMemoDraft(editing.memo || "");
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
    setMemoValue(null);
    setMemoMeta({ by: null, at: null });
    setMemoDraft("");
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
        // 새 일정: 메모를 생성 payload에 함께 실어 보낸다
        payload.memo = memoDraft.trim() || null;
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

  // ------ 메모: 즉시 저장 (일정 저장 버튼과 독립) ------
  const applyMemoResponse = (item: CalendarEventItem) => {
    setMemoValue(item.memo);
    setMemoMeta({ by: item.memo_updated_by, at: item.memo_updated_at });
  };

  const handleMemoSave = async () => {
    if (!editing || memoSaving) return;
    try {
      setMemoSaving(true);
      setMemoError(null);
      const res = await calendarEventAPI.updateMemo(
        boardId,
        editing.id,
        memoDraft.trim(),
      );
      applyMemoResponse(res);
      setMemoDraft(res.memo || "");
      setMemoEditing(false);
      onSaved();
    } catch (err) {
      console.warn("Failed to save calendar event memo", err);
      setMemoError("메모 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setMemoSaving(false);
    }
  };

  const handleMemoClear = async () => {
    if (!editing || memoSaving) return;
    try {
      setMemoSaving(true);
      setMemoError(null);
      const res = await calendarEventAPI.updateMemo(boardId, editing.id, "");
      applyMemoResponse(res);
      setMemoDraft("");
      setMemoEditing(false);
      onSaved();
    } catch (err) {
      console.warn("Failed to clear calendar event memo", err);
      setMemoError("메모 비우기에 실패했습니다.");
    } finally {
      setMemoSaving(false);
    }
  };

  const startMemoEdit = () => {
    setMemoDraft(memoValue || "");
    setMemoError(null);
    setMemoEditing(true);
  };

  const cancelMemoEdit = () => {
    setMemoDraft(memoValue || "");
    setMemoError(null);
    setMemoEditing(false);
  };

  const types = typesFor(category);
  const titlePlaceholder =
    category === "CALENDAR"
      ? "예: 창립기념일"
      : category === "MEMBER"
        ? "예: 부산 출장 · 오전 반차 · 재택"
        : "예: v1.2 클라이언트 빌드";

  const memoCountClass =
    memoDraft.length > MEMO_MAX * 0.9
      ? "text-amber-600 dark:text-amber-400"
      : "text-slate-600";

  const memoTextareaProps = {
    maxLength: MEMO_MAX,
    placeholder:
      "메모 남기기…\n예: 배포 범위 · 롤백 기준 · 릴리스 노트 링크",
    className:
      "w-full flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 outline-none resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all",
  } as const;

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      className="sm:max-w-3xl"
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

      {/* Body — 왼쪽 일정 설정 · 오른쪽 공유 메모 */}
      <div className="grid sm:grid-cols-[5fr_6fr]">
        {/* ===== 왼쪽: 일정 설정 ===== */}
        <div className="px-5 pt-4 pb-5 flex flex-col gap-4">
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
              <div className="grid grid-cols-2 gap-1.5">
                {types.map((t) => {
                  const active = t.key === eventType;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setEventType(t.key)}
                      className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors ${
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
                className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all [color-scheme:dark]"
              />
              {category !== "CALENDAR" && (
                <>
                  <span className="text-slate-500 text-sm">~</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all [color-scheme:dark]"
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
                <span className="text-xs text-slate-400">
                  🔁 매년 이 날 반복
                </span>
              </label>
            )}
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          {/* 왼쪽 하단: 일정 삭제/저장 */}
          <div className="mt-auto flex items-center justify-between pt-4 border-t border-foreground/[0.08]">
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
        </div>

        {/* ===== 오른쪽: 공유 메모 ===== */}
        <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-foreground/[0.08] bg-foreground/[0.02] sm:min-h-[480px]">
          {/* 메모 헤더 */}
          <div className="flex items-center gap-2 px-5 pt-4 pb-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
              메모
            </label>
            <div className="ml-auto flex items-center gap-0.5">
              {editing && !memoEditing && memoValue && (
                <>
                  <IconButton
                    aria-label="메모 수정"
                    size="sm"
                    onClick={startMemoEdit}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton
                    aria-label="메모 비우기"
                    size="sm"
                    onClick={handleMemoClear}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </IconButton>
                </>
              )}
            </div>
          </div>

          {/* 메모 본문 */}
          <div className="flex-1 flex flex-col px-5 pb-4 min-h-[160px]">
            {!editing ? (
              // 추가 모드: 항상 열린 입력 — 일정과 함께 저장
              <>
                <textarea
                  {...memoTextareaProps}
                  rows={6}
                  value={memoDraft}
                  onChange={(e) => setMemoDraft(e.target.value)}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-slate-600">
                    일정과 함께 저장돼요
                  </span>
                  <span className={`text-xs tabular-nums ${memoCountClass}`}>
                    {memoDraft.length} / {MEMO_MAX}
                  </span>
                </div>
              </>
            ) : memoEditing ? (
              // 편집 모드: 패널 전체 편집기 — 즉시 저장
              <>
                <textarea
                  {...memoTextareaProps}
                  autoFocus
                  value={memoDraft}
                  onChange={(e) => setMemoDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      cancelMemoEdit();
                    }
                  }}
                />
                {memoError && (
                  <p className="text-xs text-rose-400 mt-1.5">{memoError}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className={`mr-auto text-xs tabular-nums ${memoCountClass}`}
                  >
                    {memoDraft.length} / {MEMO_MAX}
                  </span>
                  <button
                    type="button"
                    onClick={cancelMemoEdit}
                    disabled={memoSaving}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 disabled:opacity-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleMemoSave}
                    disabled={memoSaving}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 transition-colors"
                  >
                    {memoSaving && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    저장
                  </button>
                </div>
              </>
            ) : memoValue ? (
              // 보기 모드
              <>
                <div className="flex-1 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words overflow-y-auto custom-scrollbar max-h-[440px]">
                  {renderMemoText(memoValue)}
                </div>
                {memoError && (
                  <p className="text-xs text-rose-400 mt-1.5">{memoError}</p>
                )}
              </>
            ) : (
              // 빈 상태
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6">
                <StickyNote className="w-6 h-6 text-slate-500" />
                <p className="text-xs text-slate-500">아직 메모가 없어요</p>
                <button
                  type="button"
                  onClick={startMemoEdit}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-bridge-accent hover:bg-bridge-accent/10 transition-colors"
                >
                  메모 남기기
                </button>
                {memoError && (
                  <p className="text-xs text-rose-400">{memoError}</p>
                )}
              </div>
            )}
          </div>

          {/* 마지막 수정 귀속 */}
          {editing && memoValue && memoMeta.at && (
            <div className="flex items-center gap-2 px-5 py-3 border-t border-foreground/[0.08]">
              {memoMeta.by?.profile_image ? (
                <img
                  src={memoMeta.by.profile_image}
                  alt=""
                  className="w-5 h-5 rounded-full shrink-0"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-bridge-accent text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {(memoMeta.by?.name || "?").charAt(0)}
                </span>
              )}
              <span className="text-xs text-slate-500">
                <span className="font-bold text-slate-400">
                  {memoMeta.by?.name || "알 수 없음"}
                </span>{" "}
                님이 {formatRelativeTime(memoMeta.at)} 수정
              </span>
            </div>
          )}
        </div>
      </div>
    </MotionModal>
  );
}
