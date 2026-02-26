import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { MotionModal } from "../ui/MotionModal";
import { organizationService } from "../../utils/services";
import { getTodayDateString } from "../../utils/dateUtils";
import type { OneOnOneMeetingDetail, OneOnOneMemberInfo } from "../../types";

interface OneOnOneMeetingModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  oneOnOneId: string;
  otherMemberName: string;
  memberA: OneOnOneMemberInfo;
  memberB: OneOnOneMemberInfo;
  editing: OneOnOneMeetingDetail | null;
  onSaved: () => void;
}

interface ActionItemDraft {
  key: string;
  title: string;
  assignee_id: string;
}

export function OneOnOneMeetingModal({
  open,
  onClose,
  orgId,
  oneOnOneId,
  otherMemberName,
  memberA,
  memberB,
  editing,
  onSaved,
}: OneOnOneMeetingModalProps) {
  const { t } = useTranslation();
  const [meetingDate, setMeetingDate] = useState(getTodayDateString());
  const [agenda, setAgenda] = useState("");
  const [notes, setNotes] = useState("");
  const [actionItems, setActionItems] = useState<ActionItemDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setMeetingDate(editing.meeting_date);
      setAgenda(editing.agenda || "");
      setNotes(editing.notes || "");
      setActionItems(
        editing.action_items.map((ai) => ({
          key: ai.id,
          title: ai.title,
          assignee_id: ai.assignee_id || "",
        })),
      );
    } else {
      setMeetingDate(getTodayDateString());
      setAgenda("");
      setNotes("");
      setActionItems([]);
    }
  }, [open, editing]);

  const addActionItem = () => {
    setActionItems((prev) => [
      ...prev,
      { key: `new-${Date.now()}`, title: "", assignee_id: "" },
    ]);
  };

  const updateActionItem = (
    index: number,
    field: keyof ActionItemDraft,
    value: string,
  ) => {
    setActionItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const removeActionItem = (index: number) => {
    setActionItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const validActions = actionItems
        .filter((ai) => ai.title.trim())
        .map((ai) => ({
          title: ai.title.trim(),
          assignee_id: ai.assignee_id || undefined,
        }));

      if (editing) {
        await organizationService.updateOneOnOneMeeting(
          orgId,
          oneOnOneId,
          editing.id,
          {
            meeting_date: meetingDate,
            agenda: agenda || undefined,
            notes: notes || undefined,
            action_items: validActions,
          },
        );
      } else {
        await organizationService.createOneOnOneMeeting(orgId, oneOnOneId, {
          meeting_date: meetingDate,
          agenda: agenda || undefined,
          notes: notes || undefined,
          action_items: validActions,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      console.warn("Failed to save meeting:", err);
    } finally {
      setSaving(false);
    }
  };

  const members = [memberA, memberB];

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className="w-full sm:max-w-lg bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/[0.08] shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
    >
      {/* Accent Line */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent rounded-t-2xl shrink-0" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08] shrink-0">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            {editing
              ? t("organization.oneOnOne.editMeeting", "Edit Meeting")
              : t("organization.oneOnOne.newMeetingTitle", "1:1 Meeting")}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {otherMemberName}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Date */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
            {t("organization.oneOnOne.meetingDate", "Meeting Date")}
          </label>
          <input
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>

        {/* Agenda */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
            {t("organization.oneOnOne.agenda", "Agenda")}
          </label>
          <textarea
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder={t(
              "organization.oneOnOne.agendaPlaceholder",
              "Topics to discuss...",
            )}
            rows={3}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 resize-none transition-all"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
            {t("organization.oneOnOne.notes", "Notes")}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t(
              "organization.oneOnOne.notesPlaceholder",
              "Meeting notes...",
            )}
            rows={4}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 resize-none transition-all"
          />
        </div>

        {/* Action Items */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {t("organization.oneOnOne.actionItems", "Action Items")}
            </label>
            <button
              type="button"
              onClick={addActionItem}
              className="flex items-center gap-1 text-[10px] font-bold text-bridge-accent hover:text-bridge-accent/80 transition-colors"
            >
              <Plus size={10} />
              {t("organization.oneOnOne.addAction", "Add")}
            </button>
          </div>

          {actionItems.length === 0 ? (
            <button
              type="button"
              onClick={addActionItem}
              className="w-full py-3 border border-dashed border-foreground/10 rounded-xl text-xs text-muted-foreground hover:border-foreground/20 hover:text-foreground transition-all"
            >
              {t("organization.oneOnOne.addActionItem", "+ Add action item")}
            </button>
          ) : (
            <div className="space-y-2">
              {actionItems.map((item, index) => (
                <div key={item.key} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={item.title}
                      onChange={(e) =>
                        updateActionItem(index, "title", e.target.value)
                      }
                      placeholder={t(
                        "organization.oneOnOne.actionTitlePlaceholder",
                        "Action item...",
                      )}
                      className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-2 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    />
                    <select
                      value={item.assignee_id}
                      onChange={(e) =>
                        updateActionItem(index, "assignee_id", e.target.value)
                      }
                      className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1.5 px-3 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    >
                      <option value="">
                        {t("organization.oneOnOne.noAssignee", "No assignee")}
                      </option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeActionItem(index)}
                    className="mt-2 p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08] shrink-0">
        <span className="text-[10px] text-slate-500">
          Esc {t("common.close", "닫기")}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !meetingDate}
          className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 transition-all"
        >
          {saving ? t("common.saving", "Saving...") : t("common.save", "Save")}
        </button>
      </div>
    </MotionModal>
  );
}
