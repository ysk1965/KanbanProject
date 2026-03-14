import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  MessageSquare,
  CheckCircle2,
  Circle,
  Calendar,
  Settings2,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { organizationService } from "../../../utils/services";
import { formatDate } from "../../../utils/dateUtils";
import type {
  OrgMemberDetail,
  OneOnOneSummary,
  OneOnOneMeetingDetail,
  OneOnOneOpenActionItem,
  OneOnOneRecurrenceType,
} from "../../../types";
import { IconButton } from "../../ui/IconButton";
import { OneOnOneMeetingModal } from "../OneOnOneMeetingModal";

interface MemberOneOnOneTabProps {
  orgId: string;
  member: OrgMemberDetail;
  myUserId: string;
}

const RECURRENCE_LABELS: Record<OneOnOneRecurrenceType, string> = {
  WEEKLY: "organization.oneOnOne.weekly",
  BIWEEKLY: "organization.oneOnOne.biweekly",
  MONTHLY: "organization.oneOnOne.monthly",
  NONE: "organization.oneOnOne.none",
};

function getDayLabels(t: (key: string, fallback: string) => string): string[] {
  return [
    "",
    t("common.days.mon", "Mon"),
    t("common.days.tue", "Tue"),
    t("common.days.wed", "Wed"),
    t("common.days.thu", "Thu"),
    t("common.days.fri", "Fri"),
    t("common.days.sat", "Sat"),
    t("common.days.sun", "Sun"),
  ];
}

export function MemberOneOnOneTab({
  orgId,
  member,
  myUserId,
}: MemberOneOnOneTabProps) {
  const { t } = useTranslation();

  const [oneOnOne, setOneOnOne] = useState<OneOnOneSummary | null>(null);
  const [meetings, setMeetings] = useState<OneOnOneMeetingDetail[]>([]);
  const [openActions, setOpenActions] = useState<OneOnOneOpenActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);

  // Meeting modal
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [editingMeeting, setEditingMeeting] =
    useState<OneOnOneMeetingDetail | null>(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<string>("NONE");
  const [recurrenceDay, setRecurrenceDay] = useState<number>(1);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadOneOnOne = useCallback(async () => {
    try {
      setLoading(true);
      const data = await organizationService.getOneOnOneByMember(
        orgId,
        member.id,
      );
      setOneOnOne(data);
      if (data) {
        setRecurrenceType(data.recurrence_type || "NONE");
        setRecurrenceDay(data.recurrence_day || 1);
        // Load meetings and open actions
        const [meetingsData, actionsData] = await Promise.all([
          organizationService.getOneOnOneMeetings(orgId, data.id, { size: 10 }),
          organizationService.getOneOnOneOpenActions(orgId, data.id),
        ]);
        setMeetings(meetingsData.meetings);
        setHasMore(meetingsData.has_more);
        setNextCursor(meetingsData.next_cursor);
        setOpenActions(actionsData);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [orgId, member.id]);

  useEffect(() => {
    loadOneOnOne();
  }, [loadOneOnOne]);

  const handleCreate = async () => {
    try {
      setCreating(true);
      const data = await organizationService.createOneOnOne(orgId, {
        member_b_id: member.id,
      });
      setOneOnOne(data);
      setMeetings([]);
      setOpenActions([]);
    } catch (err) {
      console.warn("Failed to create 1:1:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleLoadMore = async () => {
    if (!oneOnOne || !nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const data = await organizationService.getOneOnOneMeetings(
        orgId,
        oneOnOne.id,
        {
          cursor: nextCursor,
          size: 10,
        },
      );
      setMeetings((prev) => [...prev, ...data.meetings]);
      setHasMore(data.has_more);
      setNextCursor(data.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggleAction = async (actionId: string) => {
    if (!oneOnOne) return;
    try {
      await organizationService.toggleOneOnOneActionItem(
        orgId,
        oneOnOne.id,
        actionId,
      );
      // Refresh
      const [meetingsData, actionsData] = await Promise.all([
        organizationService.getOneOnOneMeetings(orgId, oneOnOne.id, {
          size: meetings.length || 10,
        }),
        organizationService.getOneOnOneOpenActions(orgId, oneOnOne.id),
      ]);
      setMeetings(meetingsData.meetings);
      setOpenActions(actionsData);
    } catch {
      // silently fail
    }
  };

  const handleMeetingSaved = async () => {
    if (!oneOnOne) return;
    const [meetingsData, actionsData] = await Promise.all([
      organizationService.getOneOnOneMeetings(orgId, oneOnOne.id, {
        size: Math.max(meetings.length, 10),
      }),
      organizationService.getOneOnOneOpenActions(orgId, oneOnOne.id),
    ]);
    setMeetings(meetingsData.meetings);
    setHasMore(meetingsData.has_more);
    setNextCursor(meetingsData.next_cursor);
    setOpenActions(actionsData);
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!oneOnOne) return;
    try {
      await organizationService.deleteOneOnOneMeeting(
        orgId,
        oneOnOne.id,
        meetingId,
      );
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    } catch {
      // silently fail
    }
  };

  const handleSaveSettings = async () => {
    if (!oneOnOne) return;
    try {
      setSavingSettings(true);
      const updated = await organizationService.updateOneOnOne(
        orgId,
        oneOnOne.id,
        {
          recurrence_type: recurrenceType,
          recurrence_day: recurrenceDay,
        },
      );
      setOneOnOne(updated);
      setShowSettings(false);
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-20 bg-foreground/[0.03] rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  // No 1:1 yet — show create
  if (!oneOnOne) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-bridge-accent/15 flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={24} className="text-bridge-accent/60" />
          </div>
          <h3 className="text-sm font-bold text-foreground mb-1">
            {t("organization.oneOnOne.noOneOnOne", "No 1:1 yet")}
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            {t(
              "organization.oneOnOne.startDescription",
              "Start regular 1:1 meetings with {{name}}",
              { name: member.user.name },
            )}
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl text-sm font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
          >
            {creating
              ? t("common.creating", "Creating...")
              : t("organization.oneOnOne.startOneOnOne", "Start 1:1")}
          </button>
        </div>
      </div>
    );
  }

  const otherMember =
    oneOnOne.member_a.user_id === myUserId
      ? oneOnOne.member_b
      : oneOnOne.member_a;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            {t("organization.oneOnOne.titleWith", "1:1 Meeting with {{name}}", { name: otherMember.name })}
          </h3>
          {oneOnOne.recurrence_type && oneOnOne.recurrence_type !== "NONE" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(RECURRENCE_LABELS[oneOnOne.recurrence_type])} ·{" "}
              {getDayLabels(t)[oneOnOne.recurrence_day || 0]}
              {oneOnOne.next_meeting_date && (
                <>
                  {" "}
                  · {t("organization.oneOnOne.nextMeeting", "Next")}:{" "}
                  {formatDate(oneOnOne.next_meeting_date)}
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            onClick={() => setShowSettings(!showSettings)}
            aria-label="설정"
          >
            <Settings2 />
          </IconButton>
          <button
            onClick={() => {
              setEditingMeeting(null);
              setShowMeetingModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all"
          >
            <Plus size={12} />
            {t("organization.oneOnOne.newMeeting", "New Meeting")}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-foreground/[0.03] rounded-xl border border-foreground/[0.06] p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                    {t("organization.oneOnOne.recurrence", "Recurrence")}
                  </label>
                  <select
                    value={recurrenceType}
                    onChange={(e) => setRecurrenceType(e.target.value)}
                    className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-2 px-3 text-xs text-foreground"
                  >
                    <option value="NONE">
                      {t("organization.oneOnOne.none", "None")}
                    </option>
                    <option value="WEEKLY">
                      {t("organization.oneOnOne.weekly", "Weekly")}
                    </option>
                    <option value="BIWEEKLY">
                      {t("organization.oneOnOne.biweekly", "Biweekly")}
                    </option>
                    <option value="MONTHLY">
                      {t("organization.oneOnOne.monthly", "Monthly")}
                    </option>
                  </select>
                </div>
                {recurrenceType !== "NONE" && (
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                      {t("organization.oneOnOne.day", "Day")}
                    </label>
                    <select
                      value={recurrenceDay}
                      onChange={(e) => setRecurrenceDay(Number(e.target.value))}
                      className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-2 px-3 text-xs text-foreground"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                        <option key={d} value={d}>
                          {getDayLabels(t)[d]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
                >
                  {t("common.save", "Save")}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Open Action Items */}
      {openActions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Circle size={12} className="text-amber-500" />
            <span className="text-xs font-bold text-foreground">
              {t("organization.oneOnOne.openActions", "Open Action Items")}
            </span>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full">
              {openActions.length}
            </span>
          </div>
          <div className="bg-foreground/[0.03] rounded-xl border border-foreground/[0.06] divide-y divide-foreground/[0.06]">
            {openActions.map((action) => (
              <div
                key={action.id}
                className="flex items-start gap-2.5 px-3 py-2.5"
              >
                <button
                  onClick={() => handleToggleAction(action.id)}
                  className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-500 transition-colors"
                >
                  <Circle size={14} />
                </button>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-foreground">
                    {action.title}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {action.assignee_name && (
                      <span className="text-xs text-muted-foreground">
                        {action.assignee_name}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(action.meeting_date)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meetings Timeline */}
      <div className="space-y-3">
        {meetings.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-10 h-10 rounded-xl bg-foreground/[0.03] flex items-center justify-center mx-auto mb-2">
              <Calendar size={18} className="text-muted-foreground/60" />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("organization.oneOnOne.noMeetings", "No meetings yet")}
            </p>
          </div>
        ) : (
          meetings.map((meeting, i) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              index={i}
              onToggleAction={handleToggleAction}
              onEdit={() => {
                setEditingMeeting(meeting);
                setShowMeetingModal(true);
              }}
              onDelete={() => handleDeleteMeeting(meeting.id)}
              t={t}
            />
          ))
        )}

        {hasMore && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
          >
            <ChevronDown size={14} />
            {loadingMore
              ? t("common.loading", "Loading...")
              : t("organization.oneOnOne.loadMore", "Load more")}
          </button>
        )}
      </div>

      {/* Meeting Modal */}
      {showMeetingModal && oneOnOne && (
        <OneOnOneMeetingModal
          open={showMeetingModal}
          onClose={() => {
            setShowMeetingModal(false);
            setEditingMeeting(null);
          }}
          orgId={orgId}
          oneOnOneId={oneOnOne.id}
          otherMemberName={otherMember.name}
          memberA={oneOnOne.member_a}
          memberB={oneOnOne.member_b}
          editing={editingMeeting}
          onSaved={handleMeetingSaved}
        />
      )}
    </div>
  );
}

// ─── Meeting Card Sub-component ───

function MeetingCard({
  meeting,
  index,
  onToggleAction,
  onEdit,
  onDelete,
  t,
}: {
  meeting: OneOnOneMeetingDetail;
  index: number;
  onToggleAction: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  t: (key: string, fallback?: string) => string;
}) {
  const [expanded, setExpanded] = useState(index === 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const completedCount = meeting.action_items.filter((a) => a.completed).length;
  const totalCount = meeting.action_items.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="bg-foreground/[0.03] rounded-xl border border-foreground/[0.06] overflow-hidden"
    >
      {/* Meeting Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-foreground/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center">
            <Calendar size={14} className="text-bridge-accent" />
          </div>
          <div className="text-left">
            <span className="text-xs font-bold text-foreground">
              {formatDate(meeting.meeting_date)}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">
                {meeting.created_by_name}
              </span>
              {totalCount > 0 && (
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    completedCount === totalCount
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {completedCount}/{totalCount}{" "}
                  {t("organization.oneOnOne.actions", "actions")}
                </span>
              )}
            </div>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-foreground/[0.06] pt-3">
              {/* Agenda */}
              {meeting.agenda && (
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                    {t("organization.oneOnOne.agenda", "Agenda")}
                  </span>
                  <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-foreground/[0.02] rounded-lg p-2.5">
                    {tryParseBlockNote(meeting.agenda)}
                  </div>
                </div>
              )}

              {/* Notes */}
              {meeting.notes && (
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                    {t("organization.oneOnOne.notes", "Notes")}
                  </span>
                  <div className="text-xs text-foreground/80 whitespace-pre-wrap bg-foreground/[0.02] rounded-lg p-2.5">
                    {tryParseBlockNote(meeting.notes)}
                  </div>
                </div>
              )}

              {/* Action Items */}
              {meeting.action_items.length > 0 && (
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 block">
                    {t("organization.oneOnOne.actionItems", "Action Items")}
                  </span>
                  <div className="space-y-1">
                    {meeting.action_items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 py-1"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleAction(item.id);
                          }}
                          className="mt-0.5 shrink-0"
                        >
                          {item.completed ? (
                            <CheckCircle2
                              size={14}
                              className="text-emerald-500"
                            />
                          ) : (
                            <Circle
                              size={14}
                              className="text-slate-400 hover:text-emerald-500 transition-colors"
                            />
                          )}
                        </button>
                        <span
                          className={`text-xs ${item.completed ? "line-through text-muted-foreground" : "text-foreground"}`}
                        >
                          {item.title}
                          {item.assignee_name && (
                            <span className="text-muted-foreground ml-1">
                              ({item.assignee_name})
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={onEdit}
                  className="text-xs font-medium text-bridge-accent hover:text-bridge-accent/80 transition-colors"
                >
                  {t("common.edit", "Edit")}
                </button>
                {confirmDelete ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={onDelete}
                      className="text-xs font-medium text-red-500 hover:text-red-400 transition-colors"
                    >
                      {t("common.confirm", "Confirm")}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {t("common.cancel", "Cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs font-medium text-red-500/60 hover:text-red-500 transition-colors"
                  >
                    {t("common.delete", "Delete")}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Simple BlockNote JSON text extractor
function tryParseBlockNote(jsonStr: string): string {
  try {
    const blocks = JSON.parse(jsonStr);
    if (!Array.isArray(blocks)) return jsonStr;
    return blocks
      .map(
        (block: { content?: { text?: string }[] | string; type?: string }) => {
          if (!block.content) return "";
          if (typeof block.content === "string") return block.content;
          if (Array.isArray(block.content)) {
            return block.content
              .map((c: { text?: string }) => c.text || "")
              .join("");
          }
          return "";
        },
      )
      .filter(Boolean)
      .join("\n");
  } catch {
    return jsonStr;
  }
}
