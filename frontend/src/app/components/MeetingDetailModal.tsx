import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Trash2,
  Loader2,
  Sparkles,
  Mic,
  Square as SquareIcon,
  FileText,
  CheckSquare,
  ChevronRight,
  ArrowRight,
  Star,
  BookOpen,
  Users,
  ChevronDown,
  X,
  Pencil,
} from "lucide-react";
import { isDomainAIHidden } from "../utils/domain";
import {
  meetingAPI,
  featureAPI,
  taskAPI,
  MeetingDetail,
  AISuggestionResponse,
  AIFeatureSuggestion,
  AIApplyRequest,
  AIApplyResult,
  DiarizedTranscript,
} from "../utils/api";
import { getInitials, getAssigneeHex } from "../utils/assigneeColor";
import {
  useAudioRecorder,
  formatDuration,
  formatFileSize,
  MAX_RECORDING_SIZE,
} from "../hooks/useAudioRecorder";
import { MotionModal } from "./ui/MotionModal";

// ============================
// MeetingDetailPanel (Inline expandable)
// ============================

interface MeetingDetailPanelProps {
  boardId: string;
  meetingId: string;
  onDeleted: () => void;
  onUpdated: () => void;
  refreshTrigger?: number;
}

export function MeetingDetailPanel({
  boardId,
  meetingId,
  onDeleted,
  onUpdated,
  refreshTrigger,
}: MeetingDetailPanelProps) {
  const { t } = useTranslation();

  // Detail state
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingMemo, setEditingMemo] = useState("");
  const [editingTranscript, setEditingTranscript] = useState("");

  // Audio recorder
  const {
    isRecording,
    recordingDuration,
    recordingSize,
    audioBlob,
    startRecording,
    stopRecording,
    clearRecording,
  } = useAudioRecorder();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const hasMicSupport =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const isPublicDomain =
    typeof window !== "undefined" &&
    window.location.hostname.includes("milkyway.pe.kr");

  // AI state
  const [aiData, setAiData] = useState<AISuggestionResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [aiSnapshot, setAiSnapshot] = useState<{
    memo: string;
    transcript: string;
  } | null>(null);
  const [showNoChangesModal, setShowNoChangesModal] = useState(false);

  // Diarized transcript state
  const [speakerMapping, setSpeakerMapping] = useState<
    Record<string, string | null>
  >({});
  const [activeSpeakerDropdown, setActiveSpeakerDropdown] = useState<
    string | null
  >(null);
  const [isEditingTranscriptManually, setIsEditingTranscriptManually] =
    useState(false);

  // Close speaker dropdown on outside click
  useEffect(() => {
    if (!activeSpeakerDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-speaker-dropdown]")) {
        setActiveSpeakerDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeSpeakerDropdown]);

  // Auto-resize textarea refs
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => autoResize(memoRef.current), [editingMemo, autoResize, loading]);
  useEffect(() => autoResize(transcriptRef.current), [editingTranscript, autoResize, loading]);

  // Delete scope modal
  const [deleteScopeModal, setDeleteScopeModal] = useState(false);

  // Load detail
  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const data = await meetingAPI.getMeetingDetail(boardId, meetingId);
      setDetail(data);
      setEditingMemo(data.memo || "");
      setEditingTranscript(data.transcript || "");
      if (data.diarized_transcript) {
        setSpeakerMapping(data.diarized_transcript.speaker_mapping || {});
        setIsEditingTranscriptManually(false);
      }
      if (data.ai_suggestions) {
        setAiData(data.ai_suggestions);
        setAiVisible(true);
        setAiCollapsed(true);
        setAiSnapshot({
          memo: data.memo || "",
          transcript: data.transcript || "",
        });
      }
    } catch (error) {
      console.error("Failed to load meeting detail:", error);
    } finally {
      setLoading(false);
    }
  }, [boardId, meetingId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // WebSocket 이벤트로 인한 리프레시
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadDetail();
    }
  }, [refreshTrigger]);

  // Memo
  const handleMemoSave = async () => {
    try {
      await meetingAPI.updateMeeting(boardId, meetingId, { memo: editingMemo });
      setDetail((prev) => (prev ? { ...prev, memo: editingMemo } : prev));
    } catch (error) {
      console.error("Failed to save memo:", error);
    }
  };

  // Transcript
  const handleTranscriptSave = async () => {
    try {
      const result = await meetingAPI.updateTranscript(
        boardId,
        meetingId,
        editingTranscript,
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              transcript: editingTranscript,
              diarized_transcript: null,
            }
          : prev,
      );
    } catch (error) {
      console.error("Failed to save transcript:", error);
    }
  };

  // Recording
  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch {
      alert(t("meeting.microphoneAccessDenied"));
    }
  };

  const handleTranscribe = async () => {
    if (!audioBlob) return;
    setIsTranscribing(true);
    try {
      const result = await meetingAPI.transcribeAudio(
        boardId,
        meetingId,
        audioBlob,
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              transcript: result.transcript,
              diarized_transcript: result.diarized_transcript,
            }
          : prev,
      );
      setEditingTranscript(result.transcript);
      if (result.diarized_transcript) {
        setSpeakerMapping(result.diarized_transcript.speaker_mapping || {});
        setIsEditingTranscriptManually(false);
      }
      clearRecording();
    } catch (error) {
      console.error("Transcription failed:", error);
      alert(t("meeting.transcriptionError"));
    } finally {
      setIsTranscribing(false);
    }
  };

  // Speaker mapping
  const handleSpeakerMappingChange = async (
    speaker: string,
    participantId: string | null,
  ) => {
    const newMapping = { ...speakerMapping, [speaker]: participantId };
    setSpeakerMapping(newMapping);
    setActiveSpeakerDropdown(null);

    // Optimistic update on detail
    setDetail((prev) => {
      if (!prev || !prev.diarized_transcript) return prev;
      return {
        ...prev,
        diarized_transcript: {
          ...prev.diarized_transcript,
          speaker_mapping: newMapping,
        },
      };
    });

    try {
      await meetingAPI.updateSpeakerMapping(boardId, meetingId, newMapping);
    } catch (error) {
      console.error("Failed to update speaker mapping:", error);
      // Revert on failure
      setSpeakerMapping((prev) => ({
        ...prev,
        [speaker]: speakerMapping[speaker] ?? null,
      }));
    }
  };

  const getSpeakerDisplayName = (speaker: string): string => {
    const mappedId = speakerMapping[speaker];
    if (mappedId && detail) {
      const participant = detail.participants.find((p) => p.id === mappedId);
      if (participant) return participant.name;
    }
    return speaker;
  };

  // Speaker color cycling (6 colors)
  const SPEAKER_COLORS = [
    {
      bg: "bg-indigo-500/10",
      text: "text-indigo-300",
      hoverBg: "hover:bg-indigo-500/20",
      dot: "#6366F1",
    },
    {
      bg: "bg-purple-500/10",
      text: "text-purple-300",
      hoverBg: "hover:bg-purple-500/20",
      dot: "#8B5CF6",
    },
    {
      bg: "bg-teal-500/10",
      text: "text-teal-300",
      hoverBg: "hover:bg-teal-500/20",
      dot: "#14B8A6",
    },
    {
      bg: "bg-rose-500/10",
      text: "text-rose-300",
      hoverBg: "hover:bg-rose-500/20",
      dot: "#F43F5E",
    },
    {
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      hoverBg: "hover:bg-amber-500/20",
      dot: "#F59E0B",
    },
    {
      bg: "bg-emerald-500/10",
      text: "text-emerald-300",
      hoverBg: "hover:bg-emerald-500/20",
      dot: "#10B981",
    },
  ];

  const speakerColorMap = useMemo(() => {
    if (!detail?.diarized_transcript) return {};
    const uniqueSpeakers = [
      ...new Set(detail.diarized_transcript.segments.map((s) => s.speaker)),
    ];
    const map: Record<string, (typeof SPEAKER_COLORS)[0]> = {};
    uniqueSpeakers.forEach((speaker, idx) => {
      map[speaker] = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
    });
    return map;
  }, [detail?.diarized_transcript]);

  // Actions
  const handleNotify = async () => {
    if (!confirm(t("meeting.notifyConfirm"))) return;
    try {
      await meetingAPI.notifyParticipants(boardId, meetingId);
      alert(t("meeting.notifySuccess"));
    } catch (error) {
      console.error("Failed to notify participants:", error);
    }
  };

  const handleSaveToNote = async () => {
    try {
      await meetingAPI.saveToNote(boardId, meetingId);
      alert(t("meeting.saveToNoteSuccess", "노트에 저장되었습니다"));
    } catch (error) {
      console.error("Failed to save meeting to note:", error);
    }
  };

  const handleDelete = () => {
    if (detail?.recurrence_group_id) {
      setDeleteScopeModal(true);
    } else {
      if (!confirm(t("meeting.deleteConfirm"))) return;
      doDelete();
    }
  };

  const doDelete = async (scope?: "THIS_ONLY" | "THIS_AND_FUTURE") => {
    try {
      await meetingAPI.deleteMeeting(boardId, meetingId, scope);
      setDeleteScopeModal(false);
      onDeleted();
    } catch (error) {
      console.error("Failed to delete meeting:", error);
    }
  };

  // AI Organize
  const isAIDimmed = (): boolean => {
    if (!aiSnapshot || !aiData) return false;
    return (
      editingMemo === aiSnapshot.memo &&
      editingTranscript === aiSnapshot.transcript
    );
  };

  const handleAIOrganize = async () => {
    if (aiLoading) return;
    if (aiSnapshot && aiData) {
      if (
        editingMemo === aiSnapshot.memo &&
        editingTranscript === aiSnapshot.transcript
      ) {
        setShowNoChangesModal(true);
        return;
      }
    }
    setAiLoading(true);
    setAiError(null);
    setAiVisible(true);
    setAiCollapsed(false);
    try {
      const data = await meetingAPI.aiOrganize(boardId, meetingId);
      setAiData(data);
      setAiSnapshot({ memo: editingMemo, transcript: editingTranscript });
      setDetail((prev) => (prev ? { ...prev, ai_suggestions: data } : prev));
    } catch {
      setAiError(t("meeting.aiError"));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <>
      <div className="px-5 pb-4 border-t border-foreground/5 pt-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-4 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {t("common.loading")}
          </div>
        ) : detail ? (
          <>
            {/* Participants */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t("meeting.participants")}
              </label>
              {detail.participants.length === 0 ? (
                <p className="text-xs text-slate-400">
                  {t("meeting.noParticipants")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {detail.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-1.5 bg-foreground/5 rounded-lg px-2.5 py-1.5"
                    >
                      {p.profile_image ? (
                        <img
                          src={p.profile_image}
                          alt={p.name}
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-medium whitespace-nowrap overflow-hidden"
                          style={{ backgroundColor: getAssigneeHex(p.name) }}
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
              )}
            </div>

            {/* Memo */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t("meeting.memo")}
              </label>
              <textarea
                ref={memoRef}
                value={editingMemo}
                onChange={(e) => setEditingMemo(e.target.value)}
                onBlur={handleMemoSave}
                placeholder={t("meeting.memoPlaceholder")}
                rows={2}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none max-h-[300px] overflow-y-auto"
              />
            </div>

            {/* Transcript */}
            {!isPublicDomain && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    {t("meeting.transcript")}
                  </label>
                  {detail.diarized_transcript &&
                    !isEditingTranscriptManually && (
                      <button
                        onClick={() => setIsEditingTranscriptManually(true)}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        {t("meeting.editManually", "직접 편집")}
                      </button>
                    )}
                  {detail.diarized_transcript &&
                    isEditingTranscriptManually && (
                      <button
                        onClick={() => setIsEditingTranscriptManually(false)}
                        className="flex items-center gap-1 text-[11px] text-bridge-accent hover:text-bridge-accent/80 transition-colors"
                      >
                        <Users className="h-3 w-3" />
                        {t("meeting.viewConversation", "대화형 보기")}
                      </button>
                    )}
                </div>

                {/* Recording Controls */}
                {hasMicSupport && (
                  <div className="flex items-center gap-2 mb-2">
                    {!isRecording ? (
                      <button
                        onClick={handleStartRecording}
                        disabled={isTranscribing}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        <Mic className="h-3.5 w-3.5" />
                        {t("meeting.startRecording")}
                      </button>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-lg">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-xs text-red-400 font-mono">
                            {formatDuration(recordingDuration)}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {formatFileSize(recordingSize)} /{" "}
                            {formatFileSize(MAX_RECORDING_SIZE)}
                          </span>
                        </div>
                        <button
                          onClick={stopRecording}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                        >
                          <SquareIcon className="h-3 w-3" />
                          {t("meeting.stopRecording")}
                        </button>
                      </>
                    )}

                    {audioBlob && !isTranscribing && (
                      <button
                        onClick={handleTranscribe}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-bridge-secondary bg-bridge-secondary/10 rounded-lg hover:bg-bridge-secondary/20 transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {t("meeting.transcribe")}
                      </button>
                    )}

                    {isTranscribing && (
                      <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("meeting.transcribing")}
                      </div>
                    )}
                  </div>
                )}

                {(isRecording || audioBlob) && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-500">
                        {formatFileSize(
                          isRecording ? recordingSize : (audioBlob?.size ?? 0),
                        )}{" "}
                        / {formatFileSize(MAX_RECORDING_SIZE)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {Math.min(
                          100,
                          Math.round(
                            ((isRecording
                              ? recordingSize
                              : (audioBlob?.size ?? 0)) /
                              MAX_RECORDING_SIZE) *
                              100,
                          ),
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          (isRecording
                            ? recordingSize
                            : (audioBlob?.size ?? 0)) /
                            MAX_RECORDING_SIZE >
                          0.9
                            ? "bg-red-500"
                            : (isRecording
                                  ? recordingSize
                                  : (audioBlob?.size ?? 0)) /
                                  MAX_RECORDING_SIZE >
                                0.7
                              ? "bg-amber-500"
                              : "bg-bridge-secondary"
                        }`}
                        style={{
                          width: `${Math.min(100, ((isRecording ? recordingSize : (audioBlob?.size ?? 0)) / MAX_RECORDING_SIZE) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Diarized Transcript - Conversational UI */}
                {detail.diarized_transcript && !isEditingTranscriptManually ? (
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
                    {detail.diarized_transcript.segments.map((seg, idx) => {
                      const displayName = getSpeakerDisplayName(seg.speaker);
                      const color =
                        speakerColorMap[seg.speaker] || SPEAKER_COLORS[0];
                      const isMapped = !!speakerMapping[seg.speaker];

                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-2.5 group"
                        >
                          {/* Speaker label - clickable for mapping */}
                          <div
                            className="relative flex-shrink-0"
                            data-speaker-dropdown
                          >
                            <button
                              onClick={() =>
                                setActiveSpeakerDropdown(
                                  activeSpeakerDropdown ===
                                    `${seg.speaker}-${idx}`
                                    ? null
                                    : `${seg.speaker}-${idx}`,
                                )
                              }
                              className={`min-w-[80px] max-w-[100px] px-2 py-1 text-[11px] font-bold tracking-wider rounded-lg transition-colors text-left truncate flex items-center gap-1 ${color.bg} ${color.text} ${color.hoverBg}`}
                              title={displayName}
                            >
                              <span className="truncate">{displayName}</span>
                              {!isMapped && (
                                <ChevronDown className="h-2.5 w-2.5 flex-shrink-0 opacity-60" />
                              )}
                            </button>

                            {/* Speaker Mapping Dropdown */}
                            {activeSpeakerDropdown ===
                              `${seg.speaker}-${idx}` && (
                              <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden">
                                <div className="px-3 py-2 border-b border-white/5">
                                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    {t("meeting.mapSpeaker", "화자 매핑")}
                                  </span>
                                </div>
                                {detail.participants.map((p) => (
                                  <button
                                    key={p.id}
                                    onClick={() =>
                                      handleSpeakerMappingChange(
                                        seg.speaker,
                                        p.id,
                                      )
                                    }
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                                      speakerMapping[seg.speaker] === p.id
                                        ? "bg-bridge-accent/10 text-bridge-accent"
                                        : "text-slate-300 hover:bg-white/5"
                                    }`}
                                  >
                                    {p.profile_image ? (
                                      <img
                                        src={p.profile_image}
                                        alt={p.name}
                                        className="w-5 h-5 rounded-full"
                                      />
                                    ) : (
                                      <div
                                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-medium"
                                        style={{
                                          backgroundColor: getAssigneeHex(
                                            p.name,
                                          ),
                                        }}
                                      >
                                        {getInitials(p.name)}
                                      </div>
                                    )}
                                    <span className="truncate">{p.name}</span>
                                    {speakerMapping[seg.speaker] === p.id && (
                                      <CheckSquare className="h-3.5 w-3.5 ml-auto flex-shrink-0" />
                                    )}
                                  </button>
                                ))}
                                {speakerMapping[seg.speaker] && (
                                  <>
                                    <div className="border-t border-white/5" />
                                    <button
                                      onClick={() =>
                                        handleSpeakerMappingChange(
                                          seg.speaker,
                                          null,
                                        )
                                      }
                                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:bg-white/5 transition-colors"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                      <span>
                                        {t("meeting.unmapSpeaker", "매핑 해제")}
                                      </span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Speech content */}
                          <p className="text-sm text-slate-300 leading-relaxed flex-1 py-0.5">
                            {seg.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Plain text textarea (legacy/manual edit mode) */
                  <textarea
                    ref={transcriptRef}
                    value={editingTranscript}
                    onChange={(e) => setEditingTranscript(e.target.value)}
                    onBlur={handleTranscriptSave}
                    placeholder={t("meeting.transcriptPlaceholder")}
                    rows={2}
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none max-h-[400px] overflow-y-auto"
                  />
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              {!isDomainAIHidden &&
                (editingMemo.trim() ||
                  detail.memo?.trim() ||
                  editingTranscript.trim() ||
                  detail.transcript?.trim()) && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAIOrganize}
                      disabled={aiLoading}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                        isAIDimmed()
                          ? "text-slate-500 bg-foreground/5 cursor-default"
                          : "text-white bg-gradient-to-r from-bridge-secondary to-bridge-accent hover:shadow-[0_0_20px_rgba(45,212,191,0.3)]"
                      }`}
                    >
                      {aiLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {t("meeting.aiOrganize")}
                    </button>
                  </div>
                )}
              {detail.participants.length > 0 && (
                <button
                  onClick={handleNotify}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-bridge-accent bg-bridge-accent/10 rounded-lg hover:bg-bridge-accent/20 transition-colors"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {t("meeting.notify")}
                </button>
              )}
              <button
                onClick={handleSaveToNote}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20 transition-colors"
              >
                <BookOpen className="h-3.5 w-3.5" />
                {t("meeting.saveToNote", "노트로 저장")}
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors ml-auto"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("meeting.delete")}
              </button>
            </div>

            {/* AI Inline Section */}
            {!isDomainAIHidden &&
              aiVisible &&
              (aiCollapsed && !aiLoading ? (
                <div className="mt-4 flex items-center justify-between bg-white/[0.02] rounded-xl border border-foreground/5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-bridge-accent" />
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      {t("meeting.aiOrganizeTitle")}
                    </span>
                  </div>
                  <button
                    onClick={() => setAiCollapsed(false)}
                    className="text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors font-medium"
                  >
                    {t("meeting.aiExpand")}
                  </button>
                </div>
              ) : (
                <MeetingAIInlineSection
                  boardId={boardId}
                  meetingId={meetingId}
                  loading={aiLoading}
                  error={aiError}
                  suggestions={aiData}
                  onRetry={handleAIOrganize}
                  onClose={() => setAiCollapsed(true)}
                />
              ))}
          </>
        ) : null}
      </div>

      {/* No Changes Modal */}
      <MotionModal
        open={showNoChangesModal}
        onClose={() => setShowNoChangesModal(false)}
        className="sm:w-[360px] sm:max-w-[calc(100%-2rem)] p-0 overflow-hidden"
      >
        <div className="p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-foreground/5 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-2">
            {t("meeting.aiNoChanges")}
          </h3>
          <p className="text-sm text-slate-400 mb-5">
            {t("meeting.aiNoChangesDesc")}
          </p>
          <button
            onClick={() => setShowNoChangesModal(false)}
            className="px-6 py-2.5 bg-foreground/5 border border-foreground/10 text-sm font-bold text-foreground rounded-xl hover:bg-foreground/10 transition-all"
          >
            {t("common.confirm") || "확인"}
          </button>
        </div>
      </MotionModal>

      {/* Delete Scope Modal */}
      <MotionModal
        open={deleteScopeModal}
        onClose={() => setDeleteScopeModal(false)}
        className="sm:w-[400px] sm:max-w-[calc(100%-2rem)] p-0 overflow-hidden"
      >
        <div className="p-6">
          <h3 className="text-lg font-bold text-foreground mb-2">
            {t("meeting.deleteRecurringTitle", "반복 회의 삭제")}
          </h3>
          <p className="text-sm text-slate-400 mb-6">
            {t(
              "meeting.deleteRecurringMessage",
              "이 회의는 반복 회의입니다. 어떻게 삭제하시겠습니까?",
            )}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => doDelete("THIS_ONLY")}
              className="w-full px-4 py-3 text-sm font-semibold bg-foreground/5 border border-foreground/10 rounded-xl text-foreground hover:bg-foreground/10 transition-all"
            >
              {t("meeting.deleteThisOnly", "이 회의만 삭제")}
            </button>
            <button
              onClick={() => doDelete("THIS_AND_FUTURE")}
              className="w-full px-4 py-3 text-sm font-semibold bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-all"
            >
              {t("meeting.deleteThisAndFuture", "이후 회의 모두 삭제")}
            </button>
            <button
              onClick={() => setDeleteScopeModal(false)}
              className="w-full px-4 py-2 text-sm text-slate-400 hover:text-foreground transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </MotionModal>
    </>
  );
}

// ============================
// AI Inline Section
// ============================

interface MeetingAIInlineSectionProps {
  boardId: string;
  meetingId: string;
  loading: boolean;
  error: string | null;
  suggestions: AISuggestionResponse | null;
  onRetry: () => void;
  onClose: () => void;
}

interface AISelectionState {
  features: Record<number, boolean>;
  tasks: Record<string, boolean>;
  checklists: Record<string, boolean>;
}

function MeetingAIInlineSection({
  boardId,
  meetingId,
  loading,
  error,
  suggestions,
  onRetry,
  onClose,
}: MeetingAIInlineSectionProps) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<AISelectionState>({
    features: {},
    tasks: {},
    checklists: {},
  });
  const [expandedFeatures, setExpandedFeatures] = useState<
    Record<number, boolean>
  >({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [result, setResult] = useState<AIApplyResult | null>(null);
  const [lockedItems, setLockedItems] = useState<{
    tasks: Record<string, boolean>;
  }>({ tasks: {} });

  useEffect(() => {
    if (!suggestions || suggestions.features.length === 0) return;
    const featureSel: Record<number, boolean> = {};
    const taskSel: Record<string, boolean> = {};
    const checklistSel: Record<string, boolean> = {};
    const expanded: Record<number, boolean> = {};

    suggestions.features.forEach((feature, fi) => {
      featureSel[fi] = true;
      expanded[fi] = true;
      feature.tasks.forEach((task, ti) => {
        taskSel[`${fi}-${ti}`] = true;
        task.checklists.forEach((_, ci) => {
          checklistSel[`${fi}-${ti}-${ci}`] = true;
        });
      });
    });

    setSelection({
      features: featureSel,
      tasks: taskSel,
      checklists: checklistSel,
    });
    setExpandedFeatures(expanded);

    (async () => {
      try {
        const [featuresRes, tasksRes] = await Promise.all([
          featureAPI.getFeatures(boardId),
          taskAPI.getTasks(boardId),
        ]);
        const existingFeatures = featuresRes.features;
        const existingTasks = tasksRes.tasks;

        const featureTitleToId = new Map<string, string>();
        existingFeatures.forEach((f) =>
          featureTitleToId.set(f.title.trim().toLowerCase(), f.id),
        );

        const tasksByFeatureId = new Map<string, Set<string>>();
        existingTasks.forEach((t) => {
          if (!tasksByFeatureId.has(t.feature_id))
            tasksByFeatureId.set(t.feature_id, new Set());
          tasksByFeatureId.get(t.feature_id)!.add(t.title.trim().toLowerCase());
        });

        const locked: Record<string, boolean> = {};
        suggestions.features.forEach((feature, fi) => {
          let featureId: string | null = null;
          if (feature.type === "EXISTING" && feature.feature_id) {
            featureId = feature.feature_id;
          } else if (feature.type === "NEW") {
            const norm = feature.title.trim().toLowerCase();
            if (featureTitleToId.has(norm))
              featureId = featureTitleToId.get(norm)!;
          }
          if (featureId) {
            const existing = tasksByFeatureId.get(featureId) || new Set();
            feature.tasks.forEach((task, ti) => {
              if (existing.has(task.title.trim().toLowerCase())) {
                locked[`${fi}-${ti}`] = true;
              }
            });
          }
        });
        setLockedItems({ tasks: locked });
      } catch {
        // Duplicate check is best-effort
      }
    })();
  }, [suggestions, boardId]);

  const isTaskLocked = useCallback(
    (fi: number, ti: number) => !!lockedItems.tasks[`${fi}-${ti}`],
    [lockedItems],
  );
  const isFeatureAllLocked = useCallback(
    (fi: number) => {
      if (!suggestions) return false;
      return suggestions.features[fi].tasks.every((_, ti) =>
        isTaskLocked(fi, ti),
      );
    },
    [suggestions, isTaskLocked],
  );

  const toggleFeature = (fi: number) => {
    if (isFeatureAllLocked(fi)) return;
    const newVal = !selection.features[fi];
    setSelection((prev) => {
      const next = {
        ...prev,
        features: { ...prev.features, [fi]: newVal },
        tasks: { ...prev.tasks },
        checklists: { ...prev.checklists },
      };
      suggestions!.features[fi].tasks.forEach((task, ti) => {
        if (!isTaskLocked(fi, ti)) {
          next.tasks[`${fi}-${ti}`] = newVal;
          task.checklists.forEach((_, ci) => {
            next.checklists[`${fi}-${ti}-${ci}`] = newVal;
          });
        }
      });
      const anyChecked = suggestions!.features[fi].tasks.some(
        (_, idx) => next.tasks[`${fi}-${idx}`],
      );
      next.features[fi] = anyChecked;
      return next;
    });
  };

  const toggleTask = (fi: number, ti: number) => {
    if (isTaskLocked(fi, ti)) return;
    const key = `${fi}-${ti}`;
    const newVal = !selection.tasks[key];
    setSelection((prev) => {
      const next = {
        ...prev,
        tasks: { ...prev.tasks, [key]: newVal },
        checklists: { ...prev.checklists },
      };
      suggestions!.features[fi].tasks[ti].checklists.forEach((_, ci) => {
        next.checklists[`${fi}-${ti}-${ci}`] = newVal;
      });
      const anyTaskChecked = suggestions!.features[fi].tasks.some((_, idx) => {
        const tKey = `${fi}-${idx}`;
        return tKey === key ? newVal : next.tasks[tKey];
      });
      next.features = { ...prev.features, [fi]: anyTaskChecked };
      return next;
    });
  };

  const toggleChecklist = (fi: number, ti: number, ci: number) => {
    if (isTaskLocked(fi, ti)) return;
    const key = `${fi}-${ti}-${ci}`;
    const newVal = !selection.checklists[key];
    setSelection((prev) => {
      const next = {
        ...prev,
        checklists: { ...prev.checklists, [key]: newVal },
      };
      const taskKey = `${fi}-${ti}`;
      const anyClChecked = suggestions!.features[fi].tasks[ti].checklists.some(
        (_, idx) => {
          const cKey = `${fi}-${ti}-${idx}`;
          return cKey === key ? newVal : next.checklists[cKey];
        },
      );
      next.tasks = { ...prev.tasks, [taskKey]: anyClChecked };
      const anyTaskChecked = suggestions!.features[fi].tasks.some((_, idx) => {
        const tKey = `${fi}-${idx}`;
        return tKey === taskKey ? anyClChecked : next.tasks[tKey];
      });
      next.features = { ...prev.features, [fi]: anyTaskChecked };
      return next;
    });
  };

  const isAllSelected = useMemo(() => {
    if (!suggestions) return false;
    return suggestions.features.every((_, fi) => selection.features[fi]);
  }, [suggestions, selection]);

  const toggleAll = () => {
    if (!suggestions) return;
    const newVal = !isAllSelected;
    const featureSel: Record<number, boolean> = {};
    const taskSel: Record<string, boolean> = {};
    const checklistSel: Record<string, boolean> = {};
    suggestions.features.forEach((feature, fi) => {
      feature.tasks.forEach((task, ti) => {
        const locked = isTaskLocked(fi, ti);
        taskSel[`${fi}-${ti}`] = locked ? true : newVal;
        task.checklists.forEach((_, ci) => {
          checklistSel[`${fi}-${ti}-${ci}`] = locked ? true : newVal;
        });
      });
      const anyChecked = feature.tasks.some(
        (_, idx) => taskSel[`${fi}-${idx}`],
      );
      featureSel[fi] = anyChecked;
    });
    setSelection({
      features: featureSel,
      tasks: taskSel,
      checklists: checklistSel,
    });
  };

  const selectedCount = useMemo(() => {
    let count = 0;
    Object.entries(selection.features).forEach(([, v]) => {
      if (v) count++;
    });
    Object.entries(selection.tasks).forEach(([key, v]) => {
      if (v && !lockedItems.tasks[key]) count++;
    });
    Object.entries(selection.checklists).forEach(([key, v]) => {
      if (v) {
        const parts = key.split("-");
        const taskKey = `${parts[0]}-${parts[1]}`;
        if (!lockedItems.tasks[taskKey]) count++;
      }
    });
    return count;
  }, [selection, lockedItems]);

  const handleApply = async () => {
    if (!suggestions) return;
    setApplying(true);
    setApplyError(null);
    try {
      const request: AIApplyRequest = {
        features: suggestions.features
          .map((feature, fi) => {
            if (!selection.features[fi]) return null;
            const tasks = feature.tasks
              .map((task, ti) => {
                if (!selection.tasks[`${fi}-${ti}`]) return null;
                if (lockedItems.tasks[`${fi}-${ti}`]) return null;
                const checklists = task.checklists
                  .filter((_, ci) => selection.checklists[`${fi}-${ti}-${ci}`])
                  .map((cl) => ({ title: cl.title }));
                return {
                  title: task.title,
                  description: task.description ?? undefined,
                  checklists,
                };
              })
              .filter((t): t is NonNullable<typeof t> => t !== null);
            if (tasks.length === 0) return null;
            return {
              type: feature.type,
              feature_id: feature.feature_id ?? undefined,
              title: feature.title ?? undefined,
              description: feature.description ?? undefined,
              color: feature.color ?? undefined,
              tasks,
            };
          })
          .filter((f): f is NonNullable<typeof f> => f !== null),
      };
      const applyResult = await meetingAPI.aiApply(boardId, meetingId, request);
      setResult(applyResult);
    } catch {
      setApplyError(t("meeting.aiError"));
    } finally {
      setApplying(false);
    }
  };

  const renderCheckbox = (checked: boolean, locked: boolean = false) =>
    locked ? (
      <CheckSquare className="h-4 w-4 text-blue-400 flex-shrink-0 opacity-60" />
    ) : checked ? (
      <CheckSquare className="h-4 w-4 text-bridge-accent flex-shrink-0" />
    ) : (
      <SquareIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
    );

  const renderFeatureLabel = (feature: AIFeatureSuggestion) => {
    if (feature.type === "EXISTING") {
      return (
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-foreground/5 px-1.5 py-0.5 rounded">
          {t("meeting.aiExistingFeature")}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded">
        <Sparkles className="h-3 w-3" />
        {t("meeting.aiNewFeature")}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="mt-4 bg-white/[0.02] rounded-xl border border-foreground/5 p-6">
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="relative">
            <Sparkles className="h-8 w-8 text-bridge-accent animate-pulse" />
            <Loader2 className="h-5 w-5 text-bridge-accent animate-spin absolute -bottom-1 -right-1" />
          </div>
          <p className="text-sm text-slate-400">{t("meeting.aiAnalyzing")}</p>
        </div>
      </div>
    );
  }

  if (error && !suggestions) {
    return (
      <div className="mt-4 bg-white/[0.02] rounded-xl border border-foreground/5 p-6">
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <p className="text-sm text-red-400">{error}</p>
          <div className="flex gap-2">
            <button
              onClick={onRetry}
              className="px-4 py-2 text-sm font-medium text-foreground bg-foreground/5 border border-foreground/10 rounded-xl hover:bg-foreground/10 transition-all"
            >
              {t("meeting.aiRetry")}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-foreground transition-colors"
            >
              {t("meeting.aiClose")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!suggestions) return null;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-bridge-accent" />
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            {t("meeting.aiOrganizeTitle")}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-muted-foreground transition-colors"
        >
          {t("meeting.aiClose")}
        </button>
      </div>

      {/* Key Points */}
      {suggestions.key_points && suggestions.key_points.length > 0 && (
        <div className="bg-bridge-accent/5 rounded-xl border border-bridge-accent/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-bridge-accent" />
            <span className="text-xs font-bold text-bridge-accent uppercase tracking-widest">
              {t("meeting.aiKeyPoints")}
            </span>
          </div>
          <ul className="space-y-1.5">
            {suggestions.key_points.map((point, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-slate-200"
              >
                <span className="text-bridge-accent mt-1 text-xs">●</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary Topics */}
      {suggestions.summary && suggestions.summary.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            {t("meeting.aiSummaryTitle")}
          </span>
          <div className="space-y-2">
            {suggestions.summary.map((topic, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${
                  topic.important
                    ? "bg-amber-500/5 border-amber-500/20"
                    : "bg-white/[0.02] border-foreground/5"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-foreground">
                    {topic.topic}
                  </span>
                  {topic.important && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      {t("meeting.aiImportant")}
                    </span>
                  )}
                </div>
                {/* Structured summary: decisions / discussions / action_items */}
                {topic.decisions?.length ||
                topic.discussions?.length ||
                topic.action_items?.length ? (
                  <div className="space-y-2">
                    {topic.decisions && topic.decisions.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-green-400">
                          {t("meeting.aiDecisions", "Decisions")}
                        </span>
                        <ul className="mt-1 space-y-0.5">
                          {topic.decisions.map((d, j) => (
                            <li
                              key={j}
                              className="flex items-start gap-2 text-sm text-muted-foreground"
                            >
                              <span className="text-green-400 mt-1 text-xs">
                                ✓
                              </span>
                              <span className="font-light">{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {topic.discussions && topic.discussions.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                          {t("meeting.aiDiscussions", "Discussions")}
                        </span>
                        <ul className="mt-1 space-y-0.5">
                          {topic.discussions.map((d, j) => (
                            <li
                              key={j}
                              className="flex items-start gap-2 text-sm text-muted-foreground"
                            >
                              <span className="text-blue-400 mt-1 text-xs">
                                –
                              </span>
                              <span className="font-light">{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {topic.action_items && topic.action_items.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                          {t("meeting.aiActionItems", "Action Items")}
                        </span>
                        <ul className="mt-1 space-y-0.5">
                          {topic.action_items.map((a, j) => (
                            <li
                              key={j}
                              className="flex items-start gap-2 text-sm text-muted-foreground"
                            >
                              <span className="text-amber-400 mt-1 text-xs">
                                →
                              </span>
                              <span className="font-light">{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : topic.points && topic.points.length > 0 ? (
                  /* Fallback: legacy points format */
                  <ul className="space-y-1">
                    {topic.points.map((point, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="text-slate-500 mt-1 text-xs">–</span>
                        <span className="font-light">{point}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Recommendations */}
      {suggestions.features.length > 0 && !result && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {t("meeting.aiRecommendedTasks")}
            </span>
            <button
              onClick={toggleAll}
              className="text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors font-medium"
            >
              {isAllSelected
                ? t("meeting.aiDeselectAll")
                : t("meeting.aiSelectAll")}
            </button>
          </div>

          <div className="space-y-2">
            {suggestions.features.map((feature, fi) => (
              <div
                key={fi}
                className="bg-white/[0.03] rounded-xl border border-foreground/5 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 py-3">
                  {isFeatureAllLocked(fi) ? (
                    <span className="flex-shrink-0 cursor-not-allowed">
                      {renderCheckbox(true, true)}
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleFeature(fi)}
                      className="flex-shrink-0"
                    >
                      {renderCheckbox(!!selection.features[fi])}
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setExpandedFeatures((prev) => ({
                        ...prev,
                        [fi]: !prev[fi],
                      }))
                    }
                    className="flex-shrink-0 text-slate-400 hover:text-foreground transition-colors"
                  >
                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${expandedFeatures[fi] ? "rotate-90" : ""}`}
                    />
                  </button>
                  {feature.type === "NEW" && feature.color && (
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: feature.color }}
                    />
                  )}
                  <span className="text-sm font-medium text-foreground truncate flex-1">
                    {feature.title}
                  </span>
                  {renderFeatureLabel(feature)}
                </div>

                {expandedFeatures[fi] && (
                  <div className="border-t border-foreground/5">
                    {feature.tasks.map((task, ti) => (
                      <div key={ti}>
                        <div
                          className={`flex items-center gap-2 px-4 py-2.5 pl-10 ${isTaskLocked(fi, ti) ? "opacity-60" : ""}`}
                        >
                          {isTaskLocked(fi, ti) ? (
                            <span className="flex-shrink-0 cursor-not-allowed">
                              {renderCheckbox(true, true)}
                            </span>
                          ) : (
                            <button
                              onClick={() => toggleTask(fi, ti)}
                              className="flex-shrink-0"
                            >
                              {renderCheckbox(!!selection.tasks[`${fi}-${ti}`])}
                            </button>
                          )}
                          <ArrowRight className="h-3 w-3 text-slate-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-muted-foreground truncate block">
                              {task.title}
                            </span>
                            {task.description && (
                              <span className="text-xs text-slate-500 truncate block mt-0.5">
                                {task.description}
                              </span>
                            )}
                          </div>
                          {isTaskLocked(fi, ti) && (
                            <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded flex-shrink-0">
                              {t("meeting.aiAlreadyExists")}
                            </span>
                          )}
                        </div>
                        {task.checklists.map((checklist, ci) => (
                          <div
                            key={ci}
                            className={`flex items-center gap-2 px-4 py-2 pl-16 ${isTaskLocked(fi, ti) ? "opacity-60" : ""}`}
                          >
                            {isTaskLocked(fi, ti) ? (
                              <span className="flex-shrink-0 cursor-not-allowed">
                                {renderCheckbox(true, true)}
                              </span>
                            ) : (
                              <button
                                onClick={() => toggleChecklist(fi, ti, ci)}
                                className="flex-shrink-0"
                              >
                                {renderCheckbox(
                                  !!selection.checklists[`${fi}-${ti}-${ci}`],
                                )}
                              </button>
                            )}
                            <span className="text-xs text-slate-400 truncate">
                              {checklist.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              {t("meeting.aiSelectedCount", { count: selectedCount })}
            </span>
            <button
              onClick={handleApply}
              disabled={applying || selectedCount === 0}
              className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-xl hover:shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {applying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("meeting.aiApplying")}
                </>
              ) : (
                t("meeting.aiApply")
              )}
            </button>
          </div>
          {applyError && (
            <p className="text-xs text-red-400 text-center">{applyError}</p>
          )}
        </div>
      )}

      {/* Apply Success */}
      {result && (
        <div className="bg-green-500/5 rounded-xl border border-green-500/20 p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <CheckSquare className="h-4 w-4 text-green-400" />
            </div>
            <p className="text-sm text-muted-foreground">
              {t("meeting.aiApplySuccess", {
                features: result.features_created,
                tasks: result.tasks_created,
                checklists: result.checklists_created,
              })}
            </p>
          </div>
        </div>
      )}

      {/* No suggestions */}
      {suggestions.features.length === 0 &&
        (!suggestions.summary || suggestions.summary.length === 0) && (
          <div className="bg-white/[0.02] rounded-xl border border-foreground/5 p-6 text-center">
            <Sparkles className="h-6 w-6 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              {t("meeting.aiNoSuggestions")}
            </p>
          </div>
        )}
    </div>
  );
}
