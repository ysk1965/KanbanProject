import { useState, useEffect } from "react";
import {
  X,
  Clock,
  Calendar,
  User,
  Users,
  CheckSquare,
  FileText,
  Folder,
  Trash2,
  Check,
  Loader2,
  Layers,
  Star,
  Sparkles,
  Pencil,
  Tag,
  ExternalLink,
} from "lucide-react";
import { Button } from "./ui/button";
import { TimePicker } from "./ui/TimePicker";
import { ColorPickerPopover } from "./ui/ColorPickerPopover";
import {
  ScheduleBlockInfo,
  scheduleAPI,
  checklistAPI,
  ChecklistItemResponse,
  meetingAPI,
  MeetingDetail,
} from "../utils/api";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ScheduleDisplayMode } from "./ScheduleSettingsModal";
import { useTranslation } from "react-i18next";
import { getInitials, getAssigneeHex } from "../utils/assigneeColor";
import { FEATURE_COLORS } from "../constants";

interface ScheduleDetailPanelProps {
  block: ScheduleBlockInfo;
  boardId: string;
  selectedDate: Date;
  displayMode: ScheduleDisplayMode;
  workStartHour: number;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  onChecklistToggle: () => void;
  onViewTask?: (taskId: string) => void;
  onViewFeature?: (featureId: string) => void;
  onViewMeeting?: (meetingId: string, date?: Date) => void;
}

// 시간 문자열에서 시:분 추출 (HH:mm:ss -> HH:mm)
const formatTime = (time: string): string => {
  return time.substring(0, 5);
};

// 시간 차이 계산 (분 단위) - overnight 지원
const calculateDuration = (
  startTime: string,
  endTime: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const durationMinutes =
    endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : 24 * 60 - startMinutes + endMinutes;

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return t("scheduleDetail.hoursMinutes", { hours, minutes });
  } else if (hours > 0) {
    return t("scheduleDetail.hours", { hours });
  } else {
    return t("scheduleDetail.minutes", { minutes });
  }
};

// 시간을 블록 인덱스로 변환 (30분 단위)
const timeToBlockIndex = (time: string, workStartHour: number): number => {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = h * 60 + m;
  const startMinutes = workStartHour * 60;
  return Math.floor((totalMinutes - startMinutes) / 30);
};

// 블록 개수 계산 - overnight 지원
const calculateBlockCount = (startTime: string, endTime: string): number => {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const durationMinutes =
    endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : 24 * 60 - startMinutes + endMinutes;
  return Math.floor(durationMinutes / 30);
};

// 커스텀 블록 프리셋 목록
const CUSTOM_PRESETS = [
  {
    emoji: "📝",
    color: "#3B82F6",
    labelKey: "dailySchedule.presetMeetingPrep",
  },
  { emoji: "🚗", color: "#10B981", labelKey: "dailySchedule.presetOutside" },
  { emoji: "😌", color: "#8B5CF6", labelKey: "dailySchedule.presetRest" },
  { emoji: "🤝", color: "#6366F1", labelKey: "dailySchedule.preset1on1" },
  { emoji: "📋", color: "#64748B", labelKey: "dailySchedule.presetPersonal" },
  { emoji: "🍽️", color: "#F59E0B", labelKey: "dailySchedule.presetMeal" },
];

export function ScheduleDetailPanel({
  block,
  boardId,
  selectedDate,
  displayMode,
  workStartHour,
  onClose,
  onDelete,
  onUpdate,
  onChecklistToggle,
  onViewTask,
  onViewFeature,
  onViewMeeting,
}: ScheduleDetailPanelProps) {
  const { t } = useTranslation();
  const checklist = block.checklist_item;
  const task = block.task;
  const feature = block.feature;
  const meeting = block.meeting;
  const isCustom = block.block_type === "CUSTOM";

  // 로컬 상태로 체크리스트 완료 여부 관리 (즉시 UI 반영용)
  const [isCompleted, setIsCompleted] = useState(checklist?.completed ?? false);

  // Task의 전체 체크리스트 항목
  const [allChecklistItems, setAllChecklistItems] = useState<
    ChecklistItemResponse[]
  >([]);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);

  // Meeting 상세 정보
  const [meetingDetail, setMeetingDetail] = useState<MeetingDetail | null>(
    null,
  );
  const [isLoadingMeeting, setIsLoadingMeeting] = useState(false);

  // 시간 편집 상태
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editStartTime, setEditStartTime] = useState(
    formatTime(block.start_time),
  );
  const [editEndTime, setEditEndTime] = useState(formatTime(block.end_time));
  const [isSavingTime, setIsSavingTime] = useState(false);

  // 커스텀 블록 편집 상태
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const [editTitle, setEditTitle] = useState(block.title || "");
  const [editColor, setEditColor] = useState(block.color || "#F59E0B");
  const [isSavingCustom, setIsSavingCustom] = useState(false);

  // block이 변경되면 로컬 상태도 동기화
  useEffect(() => {
    setIsCompleted(checklist?.completed ?? false);
  }, [checklist?.completed]);

  // Task의 체크리스트 로드
  useEffect(() => {
    if (!task) {
      setAllChecklistItems([]);
      return;
    }

    const loadChecklist = async () => {
      setIsLoadingChecklist(true);
      try {
        const response = await checklistAPI.getChecklist(boardId, task.id);
        setAllChecklistItems(response.items);
      } catch (error) {
        console.error("Failed to load checklist:", error);
      } finally {
        setIsLoadingChecklist(false);
      }
    };
    loadChecklist();
  }, [boardId, task?.id]);

  // Meeting 상세 정보 로드
  useEffect(() => {
    if (!meeting) {
      setMeetingDetail(null);
      return;
    }

    const loadMeetingDetail = async () => {
      setIsLoadingMeeting(true);
      try {
        const detail = await meetingAPI.getMeetingDetail(boardId, meeting.id);
        setMeetingDetail(detail);
      } catch (error) {
        console.error("Failed to load meeting detail:", error);
      } finally {
        setIsLoadingMeeting(false);
      }
    };
    loadMeetingDetail();
  }, [boardId, meeting?.id]);

  // block이 변경되면 시간 편집 상태도 동기화
  useEffect(() => {
    setEditStartTime(formatTime(block.start_time));
    setEditEndTime(formatTime(block.end_time));
    setIsEditingTime(false);
  }, [block.id, block.start_time, block.end_time]);

  // block이 변경되면 커스텀 편집 상태도 동기화
  useEffect(() => {
    setEditTitle(block.title || "");
    setEditColor(block.color || "#F59E0B");
    setIsEditingCustom(false);
  }, [block.id, block.title, block.color]);

  const handleSaveTime = async () => {
    const newStartTime = `${editStartTime}:00`;
    const newEndTime = `${editEndTime}:00`;

    // 변경 없으면 편집 모드만 닫기
    if (newStartTime === block.start_time && newEndTime === block.end_time) {
      setIsEditingTime(false);
      return;
    }

    setIsSavingTime(true);
    try {
      await scheduleAPI.updateBlock(boardId, block.id, {
        start_time: newStartTime,
        end_time: newEndTime,
      });
      setIsEditingTime(false);
      onUpdate();
    } catch (error) {
      console.error("Failed to update time:", error);
      // 실패 시 원래 값으로 롤백
      setEditStartTime(formatTime(block.start_time));
      setEditEndTime(formatTime(block.end_time));
    } finally {
      setIsSavingTime(false);
    }
  };

  const handleCancelTimeEdit = () => {
    setEditStartTime(formatTime(block.start_time));
    setEditEndTime(formatTime(block.end_time));
    setIsEditingTime(false);
  };

  const handleSaveCustom = async () => {
    if (!editTitle.trim()) return;

    const titleChanged = editTitle !== (block.title || "");
    const colorChanged = editColor !== (block.color || "#F59E0B");

    if (!titleChanged && !colorChanged) {
      setIsEditingCustom(false);
      return;
    }

    setIsSavingCustom(true);
    try {
      await scheduleAPI.updateBlock(boardId, block.id, {
        title: editTitle.trim(),
        color: editColor,
      });
      setIsEditingCustom(false);
      onUpdate();
    } catch (error) {
      console.error("Failed to update custom block:", error);
      setEditTitle(block.title || "");
      setEditColor(block.color || "#F59E0B");
    } finally {
      setIsSavingCustom(false);
    }
  };

  const handleCancelCustomEdit = () => {
    setEditTitle(block.title || "");
    setEditColor(block.color || "#F59E0B");
    setIsEditingCustom(false);
  };

  // 프리셋 매칭
  const matchedPreset = isCustom
    ? CUSTOM_PRESETS.find((p) => t(p.labelKey) === block.title)
    : null;

  const handleToggleComplete = async () => {
    if (!checklist || !task) return;

    // 즉시 UI 업데이트 (optimistic update)
    const newCompletedState = !isCompleted;
    setIsCompleted(newCompletedState);

    try {
      await checklistAPI.toggleItem(boardId, task.id, checklist.id);
      onChecklistToggle();
    } catch (error) {
      // 실패 시 원래 상태로 롤백
      setIsCompleted(!newCompletedState);
      console.error("Failed to toggle checklist:", error);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("scheduleDetail.deleteConfirm"))) return;

    try {
      await scheduleAPI.deleteBlock(boardId, block.id);
      onDelete();
    } catch (error) {
      console.error("Failed to delete block:", error);
    }
  };

  return (
    <div className="w-96 flex-shrink-0 h-full bg-bridge-obsidian border-l border-bridge-border shadow-xl flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 border-b border-bridge-border">
        <h2 className="text-lg font-bold text-foreground">
          {t("scheduleDetail.title")}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-slate-400 hover:text-foreground hover:bg-foreground/5 h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* 시간/블록 정보 */}
        <div className="bg-bridge-dark rounded-lg p-4">
          {isEditingTime ? (
            /* 시간 편집 모드 */
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <Clock className="h-5 w-5 text-blue-400" />
                <span className="text-sm font-medium text-slate-400">
                  {t("scheduleDetail.editTime")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <TimePicker
                    value={editStartTime}
                    onChange={setEditStartTime}
                    minuteStep={30}
                    className="py-1.5 px-3 text-xs border-foreground/10"
                  />
                </div>
                <span className="text-slate-500 text-xs shrink-0">~</span>
                <div className="flex-1">
                  <TimePicker
                    value={editEndTime}
                    onChange={setEditEndTime}
                    minuteStep={30}
                    className="py-1.5 px-3 text-xs border-foreground/10"
                  />
                </div>
              </div>
              {editStartTime && editEndTime && (
                <div className="text-xs text-slate-400">
                  {calculateDuration(
                    `${editStartTime}:00`,
                    `${editEndTime}:00`,
                    t,
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelTimeEdit}
                  disabled={isSavingTime}
                  className="flex-1 border-white/10 text-slate-400 hover:bg-white/5"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveTime}
                  disabled={isSavingTime || !editStartTime || !editEndTime}
                  className="flex-1 bg-bridge-accent text-white hover:bg-bridge-accent/90"
                >
                  {isSavingTime ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  {t("common.save")}
                </Button>
              </div>
            </div>
          ) : (
            /* 시간 표시 모드 */
            <>
              <div className="flex items-center gap-2 text-foreground mb-2">
                {displayMode === "block" ? (
                  <>
                    <Layers className="h-5 w-5 text-blue-400" />
                    <span className="text-lg font-medium">
                      {(() => {
                        const startBlock =
                          timeToBlockIndex(block.start_time, workStartHour) + 1;
                        const endBlock = timeToBlockIndex(
                          block.end_time,
                          workStartHour,
                        );
                        return startBlock === endBlock
                          ? t("scheduleDetail.singleBlock", {
                              block: startBlock,
                            })
                          : t("scheduleDetail.blockRange", {
                              start: startBlock,
                              end: endBlock,
                            });
                      })()}
                    </span>
                    <span className="text-slate-400 text-sm">
                      (
                      {t("scheduleDetail.blockCount", {
                        count: calculateBlockCount(
                          block.start_time,
                          block.end_time,
                        ),
                      })}
                      )
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="h-5 w-5 text-blue-400" />
                    <span className="text-lg font-medium">
                      {formatTime(block.start_time)} -{" "}
                      {formatTime(block.end_time)}
                      {block.end_time < block.start_time && (
                        <span className="text-bridge-accent text-sm ml-1">
                          ({t("scheduleDetail.nextDay")})
                        </span>
                      )}
                    </span>
                    <span className="text-slate-400 text-sm">
                      ({calculateDuration(block.start_time, block.end_time, t)})
                    </span>
                  </>
                )}
                <button
                  onClick={() => setIsEditingTime(true)}
                  className="ml-auto text-slate-400 hover:text-foreground hover:bg-white/5 rounded-md p-1 transition-colors"
                  title={t("scheduleDetail.editTime")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {format(selectedDate, "yyyy년 M월 d일", { locale: ko })}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Meeting 정보 */}
        {meeting && (
          <div className="bg-bridge-dark rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium text-slate-400">
                  {t("meeting.tab")}
                </span>
              </div>
              {onViewMeeting && (
                <button
                  onClick={() => onViewMeeting(meeting.id, selectedDate)}
                  className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {t("scheduleDetail.viewMeeting")}
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: meeting.color }}
              />
              <p className="text-foreground font-medium">{meeting.title}</p>
            </div>

            {isLoadingMeeting ? (
              <div className="flex items-center justify-center py-3 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">{t("common.loading")}</span>
              </div>
            ) : (
              meetingDetail && (
                <>
                  {/* 참석자 */}
                  {meetingDetail.participants.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                        {t("meeting.participants")}
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {meetingDetail.participants.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-1.5 bg-foreground/5 rounded-lg px-2 py-1"
                          >
                            {p.profile_image ? (
                              <img
                                src={p.profile_image}
                                alt={p.name}
                                className="w-4 h-4 rounded-full"
                              />
                            ) : (
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center text-xs text-white font-medium whitespace-nowrap overflow-hidden"
                                style={{
                                  backgroundColor: getAssigneeHex(p.name),
                                }}
                              >
                                {getInitials(p.name)}
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {p.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 메모 */}
                  {meetingDetail.memo && (
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                        {t("meeting.memo")}
                      </label>
                      <div className="bg-foreground/5 rounded-lg p-3 text-sm text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {meetingDetail.memo}
                      </div>
                    </div>
                  )}

                  {/* 음성 기록 */}
                  {meetingDetail.transcript && (
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                        {t("meeting.transcript")}
                      </label>
                      <div className="bg-foreground/5 rounded-lg p-3 text-sm text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {meetingDetail.transcript}
                      </div>
                    </div>
                  )}

                  {/* AI 주요 결정사항 */}
                  {meetingDetail.ai_suggestions?.key_points &&
                    meetingDetail.ai_suggestions.key_points.length > 0 && (
                      <div className="bg-bridge-accent/5 rounded-lg border border-bridge-accent/20 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Star className="h-3.5 w-3.5 text-bridge-accent" />
                          <span className="text-xs font-bold text-bridge-accent uppercase tracking-widest">
                            {t("meeting.aiKeyPoints")}
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {meetingDetail.ai_suggestions.key_points.map(
                            (point, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-xs text-muted-foreground"
                              >
                                <span className="text-bridge-accent mt-0.5 text-xs">
                                  ●
                                </span>
                                <span>{point}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}

                  {/* AI 회의 요약 */}
                  {meetingDetail.ai_suggestions?.summary &&
                    meetingDetail.ai_suggestions.summary.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Sparkles className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            {t("meeting.aiSummaryTitle")}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {meetingDetail.ai_suggestions.summary.map(
                            (topic, i) => (
                              <div
                                key={i}
                                className={`rounded-lg border p-3 ${
                                  topic.important
                                    ? "bg-amber-500/5 border-amber-500/20"
                                    : "bg-white/[0.02] border-foreground/5"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-xs font-medium text-foreground">
                                    {topic.topic}
                                  </span>
                                  {topic.important && (
                                    <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded">
                                      {t("meeting.aiImportant")}
                                    </span>
                                  )}
                                </div>
                                {/* Structured summary: decisions / discussions / action_items */}
                                {topic.decisions?.length ||
                                topic.discussions?.length ||
                                topic.action_items?.length ? (
                                  <div className="space-y-1.5">
                                    {topic.decisions &&
                                      topic.decisions.length > 0 && (
                                        <div>
                                          <span className="text-xs font-bold uppercase tracking-widest text-green-600 dark:text-green-400">
                                            {t(
                                              "meeting.aiDecisions",
                                              "Decisions",
                                            )}
                                          </span>
                                          <ul className="mt-0.5 space-y-0.5">
                                            {topic.decisions.map((d, j) => (
                                              <li
                                                key={j}
                                                className="flex items-start gap-1.5 text-xs text-foreground/80"
                                              >
                                                <span className="text-green-600 dark:text-green-400 mt-0.5 text-xs">
                                                  ✓
                                                </span>
                                                <span>{d}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    {topic.discussions &&
                                      topic.discussions.length > 0 && (
                                        <div>
                                          <span className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                                            {t(
                                              "meeting.aiDiscussions",
                                              "Discussions",
                                            )}
                                          </span>
                                          <ul className="mt-0.5 space-y-0.5">
                                            {topic.discussions.map((d, j) => (
                                              <li
                                                key={j}
                                                className="flex items-start gap-1.5 text-xs text-foreground/80"
                                              >
                                                <span className="text-blue-600 dark:text-blue-400 mt-0.5 text-xs">
                                                  –
                                                </span>
                                                <span>{d}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    {topic.action_items &&
                                      topic.action_items.length > 0 && (
                                        <div>
                                          <span className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                                            {t(
                                              "meeting.aiActionItems",
                                              "Action Items",
                                            )}
                                          </span>
                                          <ul className="mt-0.5 space-y-0.5">
                                            {topic.action_items.map((a, j) => (
                                              <li
                                                key={j}
                                                className="flex items-start gap-1.5 text-xs text-foreground/80"
                                              >
                                                <span className="text-amber-600 dark:text-amber-400 mt-0.5 text-xs">
                                                  →
                                                </span>
                                                <span>{a}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                  </div>
                                ) : topic.points && topic.points.length > 0 ? (
                                  /* Fallback: legacy points format */
                                  <ul className="space-y-0.5">
                                    {topic.points.map((point, j) => (
                                      <li
                                        key={j}
                                        className="flex items-start gap-1.5 text-xs text-foreground/80"
                                      >
                                        <span className="text-muted-foreground mt-0.5 text-xs">
                                          –
                                        </span>
                                        <span>{point}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                </>
              )
            )}
          </div>
        )}

        {/* 커스텀 블록 정보 */}
        {isCustom && (
          <div className="bg-bridge-dark rounded-lg p-4">
            {isEditingCustom ? (
              /* 커스텀 블록 편집 모드 */
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-bridge-accent" />
                  <span className="text-sm font-medium text-slate-400">
                    {t("scheduleDetail.editCustom")}
                  </span>
                </div>

                {/* 프리셋 빠른 선택 */}
                <div className="grid grid-cols-3 gap-1.5">
                  {CUSTOM_PRESETS.map((preset) => (
                    <button
                      key={preset.labelKey}
                      onClick={() => {
                        setEditTitle(t(preset.labelKey));
                        setEditColor(preset.color);
                      }}
                      className={`py-2 px-1.5 rounded-lg border text-xs font-medium transition-all text-center ${
                        editTitle === t(preset.labelKey)
                          ? "border-bridge-accent bg-bridge-accent/20 text-bridge-accent"
                          : "border-foreground/10 text-slate-400 hover:border-bridge-accent/30 hover:text-foreground"
                      }`}
                    >
                      <span className="text-sm">{preset.emoji}</span>
                      <span className="block mt-0.5 truncate text-xs">
                        {t(preset.labelKey)}
                      </span>
                    </button>
                  ))}
                </div>

                {/* 제목 입력 */}
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={100}
                  placeholder={t("scheduleDetail.titlePlaceholder")}
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3
                    text-sm text-foreground placeholder-slate-500
                    focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />

                {/* 색상 선택 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {t("scheduleDetail.blockColor")}
                  </span>
                  <ColorPickerPopover
                    colors={FEATURE_COLORS}
                    selectedColor={editColor}
                    onColorChange={setEditColor}
                    triggerSize="sm"
                    triggerShape="circle"
                    showGlow={false}
                  />
                </div>

                {/* 저장/취소 버튼 */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelCustomEdit}
                    disabled={isSavingCustom}
                    className="flex-1 border-white/10 text-slate-400 hover:bg-white/5"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveCustom}
                    disabled={isSavingCustom || !editTitle.trim()}
                    className="flex-1 bg-bridge-accent text-white hover:bg-bridge-accent/90"
                  >
                    {isSavingCustom ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            ) : (
              /* 커스텀 블록 표시 모드 */
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-bridge-accent" />
                    <span className="text-sm font-medium text-slate-400">
                      {t("scheduleDetail.customBlock")}
                    </span>
                  </div>
                  <button
                    onClick={() => setIsEditingCustom(true)}
                    className="text-slate-400 hover:text-foreground hover:bg-white/5 rounded-md p-1 transition-colors"
                    title={t("scheduleDetail.editCustom")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: block.color || "#F59E0B" }}
                  />
                  <div className="flex items-center gap-2">
                    {matchedPreset && (
                      <span className="text-base">{matchedPreset.emoji}</span>
                    )}
                    <p className="text-foreground font-medium">
                      {block.title || t("scheduleDetail.customBlock")}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Feature 정보 - 체크리스트 타임블록에서만 표시 */}
        {!meeting && !isCustom && (
          <div
            className={`bg-bridge-dark rounded-lg p-4 ${
              feature && onViewFeature
                ? "cursor-pointer hover:bg-foreground/5 transition-colors"
                : ""
            }`}
            onClick={() =>
              feature && onViewFeature && onViewFeature(feature.id)
            }
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-yellow-400" />
                <span className="text-sm font-medium text-slate-400">
                  FEATURE
                </span>
              </div>
              {feature && onViewFeature && (
                <span className="text-xs text-blue-400">
                  {t("scheduleDetail.clickToView")}
                </span>
              )}
            </div>

            {feature ? (
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: feature.color }}
                />
                <p className="text-foreground font-medium">{feature.title}</p>
              </div>
            ) : (
              <div className="text-slate-400 text-sm text-center py-2">
                {t("scheduleDetail.noFeature")}
              </div>
            )}
          </div>
        )}

        {/* Task 정보 - 체크리스트 타임블록에서만 표시 */}
        {!meeting && !isCustom && (
          <div
            className={`bg-bridge-dark rounded-lg p-4 ${
              task && onViewTask
                ? "cursor-pointer hover:bg-foreground/5 transition-colors"
                : ""
            }`}
            onClick={() => task && onViewTask && onViewTask(task.id)}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium text-slate-400">TASK</span>
              </div>
              {task && onViewTask && (
                <span className="text-xs text-blue-400">
                  {t("scheduleDetail.clickToView")}
                </span>
              )}
            </div>

            {task ? (
              <div className="text-foreground">
                <p className="font-medium">{task.title}</p>
              </div>
            ) : (
              <div className="text-slate-400 text-sm text-center py-2">
                {t("scheduleDetail.noTask")}
              </div>
            )}
          </div>
        )}

        {/* 체크리스트 정보 - 현재 블록에 연결된 항목 */}
        {/* <div className="bg-[#1d2125] rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-400">CHECKLIST</span>
          </div>

          {checklist ? (
            <div className="bg-[#282e33] rounded-lg p-3">
              <div className="flex items-start gap-3">
                <button
                  onClick={handleToggleComplete}
                  className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    isCompleted
                      ? 'bg-green-500 border-green-500'
                      : 'border-gray-500 hover:border-green-400'
                  }`}
                >
                  {isCompleted && <Check className="h-3 w-3 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-foreground font-medium ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                    {checklist.title}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    {checklist.start_date && (
                      <span>시작: {checklist.start_date.substring(5).replace('-', '/')}</span>
                    )}
                    {checklist.due_date && (
                      <span>마감: {checklist.due_date.substring(5).replace('-', '/')}</span>
                    )}
                  </div>
                </div>
              </div>

              {!isCompleted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleComplete}
                  className="w-full mt-3 border-green-600 text-green-400 hover:bg-green-600/20"
                >
                  <Check className="h-4 w-4 mr-2" />
                  완료 처리
                </Button>
              )}
            </div>
          ) : (
            <div className="text-gray-500 text-sm text-center py-4">
              연결된 체크리스트가 없습니다
            </div>
          )}
        </div> */}

        {/* Task의 전체 체크리스트 목록 */}
        {task && (
          <div className="bg-bridge-dark rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-400">
                  {t("scheduleDetail.taskChecklist")}
                </span>
              </div>
              {allChecklistItems.length > 0 && (
                <span className="text-xs text-slate-400">
                  {t("scheduleDetail.completedCount", {
                    completed: allChecklistItems.filter((i) => i.completed)
                      .length,
                    total: allChecklistItems.length,
                  })}
                </span>
              )}
            </div>

            {isLoadingChecklist ? (
              <div className="flex items-center justify-center py-4 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm">{t("common.loading")}</span>
              </div>
            ) : allChecklistItems.length === 0 ? (
              <div className="text-slate-400 text-sm text-center py-4">
                {t("scheduleDetail.noChecklist")}
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allChecklistItems.map((item) => {
                  const isCurrent = checklist?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-2 p-2 rounded ${
                        isCurrent
                          ? "bg-purple-500/20 border border-purple-500/50"
                          : "bg-bridge-obsidian"
                      }`}
                    >
                      <button
                        onClick={async () => {
                          if (!task) return;
                          // Optimistic update
                          setAllChecklistItems((prev) =>
                            prev.map((i) =>
                              i.id === item.id
                                ? { ...i, completed: !i.completed }
                                : i,
                            ),
                          );
                          try {
                            await checklistAPI.toggleItem(
                              boardId,
                              task.id,
                              item.id,
                            );
                            onChecklistToggle(); // 데일리 체크리스트 새로고침
                          } catch (error) {
                            // Rollback on error
                            setAllChecklistItems((prev) =>
                              prev.map((i) =>
                                i.id === item.id
                                  ? { ...i, completed: !i.completed }
                                  : i,
                              ),
                            );
                            console.error(
                              "Failed to toggle checklist item:",
                              error,
                            );
                          }
                        }}
                        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                          item.completed
                            ? "bg-green-500 border-green-500"
                            : "border-slate-500 hover:border-green-400"
                        }`}
                      >
                        {item.completed && (
                          <Check className="h-2.5 w-2.5 text-white" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${item.completed ? "line-through text-slate-400" : "text-muted-foreground"}`}
                        >
                          {item.title}
                          {isCurrent && (
                            <span className="ml-2 text-xs text-purple-400">
                              ({t("scheduleDetail.current")})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 삭제 버튼 */}
      <div className="p-4 border-t border-bridge-border">
        <Button
          variant="outline"
          onClick={handleDelete}
          className="w-full border-red-600 text-red-400 hover:bg-red-600/20"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {t("scheduleDetail.deleteBlock")}
        </Button>
      </div>
    </div>
  );
}
