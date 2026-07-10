import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Share2, Link2, Check, Globe, X, RotateCw, Users } from "lucide-react";
import { noteAPI, orgNoteAPI } from "../../utils/api";
import type { NoteDetail } from "../../utils/api";

interface NoteShareButtonProps {
  boardId?: string;
  orgId?: string;
  note: NoteDetail;
  canEdit: boolean;
  onNoteUpdate?: (note: NoteDetail) => void;
}

/**
 * 제목을 URL 슬러그로 변환 (표시용). 한글/영숫자는 유지, 그 외는 하이픈으로,
 * 최대 24자. 조회 키가 아니라 장식이므로 비어도 무방하다.
 */
function slugifyTitle(title?: string): string {
  if (!title) return "";
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
}

export function NoteShareButton({
  boardId,
  orgId,
  note,
  canEdit,
  onNoteUpdate,
}: NoteShareButtonProps) {
  const isOrg = !!orgId;
  const scopeId = boardId || orgId || "";
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isShared = note.is_shared && note.share_token;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Team link: in-app deep link, always available (login + board/org member only).
  const teamUrl = boardId
    ? `${window.location.origin}/boards/${boardId}?view=notes&note=${note.id}`
    : orgId
      ? `${window.location.origin}/organizations/${orgId}?tab=documents&note=${note.id}`
      : "";
  // Public link: exists only when sharing is enabled (anyone, read-only).
  // 제목 슬러그를 앞에 붙여 URL에서도 문서를 알아볼 수 있게 한다.
  // 조회 키는 짧은 코드(share_code) 우선, 없으면 레거시 UUID 토큰으로 폴백.
  // 슬러그는 표시용 장식이라 보안 엔트로피에 영향 없음.
  const titleSlug = slugifyTitle(note.title);
  const publicToken = note.share_code || note.share_token;
  const publicUrl = isShared
    ? `${window.location.origin}/n/${titleSlug ? `${titleSlug}-` : ""}${publicToken}`
    : "";
  // Link shown & copied: public when shared, otherwise the team link.
  const activeUrl = isShared ? publicUrl : teamUrl;

  const handleToggleShare = async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      let updated: NoteDetail;
      const api = isOrg ? orgNoteAPI : noteAPI;
      if (isShared) {
        updated = await api.disableShare(scopeId, note.id);
      } else {
        updated = await api.enableShare(scopeId, note.id);
      }
      onNoteUpdate?.(updated);
      setCopied(false);
    } catch (err) {
      console.error("Failed to toggle share:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRotateToken = async () => {
    if (!canEdit || !isShared) return;
    const ok = window.confirm(
      t(
        "notes.shareRotateConfirm",
        "기존 공유 링크를 즉시 무효화하고 새 링크를 발급합니다. 계속할까요?",
      ),
    );
    if (!ok) return;
    setLoading(true);
    try {
      const api = isOrg ? orgNoteAPI : noteAPI;
      const updated = await api.rotateShareToken(scopeId, note.id);
      onNoteUpdate?.(updated);
      setCopied(false);
    } catch (err) {
      console.error("Failed to rotate share token:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!activeUrl) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = activeUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (note.type !== "DOCUMENT" && note.type !== "BOARD") return null;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          isShared
            ? "text-bridge-secondary bg-bridge-secondary/10 hover:bg-bridge-secondary/20"
            : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
        }`}
        title={t("notes.share", "공유")}
      >
        <Share2 size={13} />
        {isShared && <Globe size={10} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-bridge-obsidian rounded-xl border border-foreground/10 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-foreground/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 size={14} className="text-bridge-accent" />
              <span className="text-sm font-bold text-foreground">
                {t("notes.shareTitle", "문서 공유")}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground font-medium">
                  {t("notes.sharePublicLink", "공개 링크 공유")}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(
                    "notes.sharePublicLinkDesc",
                    "링크가 있는 누구나 읽기 전용으로 볼 수 있습니다",
                  )}
                </p>
              </div>
              <button
                onClick={handleToggleShare}
                disabled={loading || !canEdit}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                  isShared ? "bg-bridge-secondary" : "bg-white/10"
                } ${!canEdit ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    isShared ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Share link — always shown: team link by default, public link when shared */}
            {activeUrl && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2">
                    <Link2 size={12} className="text-slate-500 flex-shrink-0" />
                    <input
                      value={activeUrl}
                      readOnly
                      className="flex-1 bg-transparent text-xs text-muted-foreground outline-none select-all truncate"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      copied
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-bridge-accent text-white hover:bg-bridge-accent/90"
                    }`}
                  >
                    {copied ? <Check size={12} /> : <Link2 size={12} />}
                    {copied
                      ? t("notes.shareCopied", "복사됨")
                      : t("notes.shareCopy", "복사")}
                  </button>
                </div>

                {/* Caption: which kind of link is currently shown */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  {isShared ? (
                    <>
                      <Globe size={11} className="flex-shrink-0" />
                      <span>
                        {t(
                          "notes.sharePublicLinkDesc",
                          "링크가 있는 누구나 읽기 전용으로 볼 수 있습니다",
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <Users size={11} className="flex-shrink-0" />
                      <span>
                        {t(
                          "notes.shareMemberOnly",
                          "보드 멤버만 열 수 있습니다",
                        )}
                      </span>
                    </>
                  )}
                </div>

                {/* Rotate: only meaningful for the public token link */}
                {isShared && (
                  <button
                    onClick={handleRotateToken}
                    disabled={loading || !canEdit}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground transition-colors disabled:opacity-50"
                    title={t(
                      "notes.shareRotateDesc",
                      "기존 링크가 유출됐다면 새 링크를 발급해 즉시 차단할 수 있습니다",
                    )}
                  >
                    <RotateCw size={11} />
                    {t("notes.shareRotate", "링크 재발급")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
