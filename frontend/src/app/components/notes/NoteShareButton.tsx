import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Link2, Check, Globe, X } from 'lucide-react';
import { noteAPI } from '../../utils/api';
import type { NoteDetail } from '../../utils/api';

interface NoteShareButtonProps {
  boardId: string;
  note: NoteDetail;
  canEdit: boolean;
  onNoteUpdate?: (note: NoteDetail) => void;
}

export function NoteShareButton({ boardId, note, canEdit, onNoteUpdate }: NoteShareButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isShared = note.is_shared && note.share_token;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const shareUrl = isShared
    ? `${window.location.origin}/shared/note/${note.share_token}`
    : '';

  const handleToggleShare = async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      let updated: NoteDetail;
      if (isShared) {
        updated = await noteAPI.disableShare(boardId, note.id);
      } else {
        updated = await noteAPI.enableShare(boardId, note.id);
      }
      onNoteUpdate?.(updated);
    } catch (err) {
      console.error('Failed to toggle share:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (note.type !== 'DOCUMENT') return null;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          isShared
            ? 'text-bridge-secondary bg-bridge-secondary/10 hover:bg-bridge-secondary/20'
            : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
        }`}
        title={t('notes.share', '공유')}
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
              <span className="text-sm font-semibold text-foreground">
                {t('notes.shareTitle', '문서 공유')}
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
                  {t('notes.sharePublicLink', '공개 링크 공유')}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {t('notes.sharePublicLinkDesc', '링크가 있는 누구나 읽기 전용으로 볼 수 있습니다')}
                </p>
              </div>
              <button
                onClick={handleToggleShare}
                disabled={loading || !canEdit}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                  isShared ? 'bg-bridge-secondary' : 'bg-white/10'
                } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                    isShared ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Share link */}
            {isShared && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2">
                    <Link2 size={12} className="text-slate-500 flex-shrink-0" />
                    <input
                      value={shareUrl}
                      readOnly
                      className="flex-1 bg-transparent text-xs text-muted-foreground outline-none select-all truncate"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      copied
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-bridge-accent text-white hover:bg-bridge-accent/90'
                    }`}
                  >
                    {copied ? <Check size={12} /> : <Link2 size={12} />}
                    {copied ? t('notes.shareCopied', '복사됨') : t('notes.shareCopy', '복사')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
