import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Link2, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MotionModal } from '../../ui/MotionModal';
import { orgPhotoService } from '../../../utils/services';
import type { OrgPhotoTab } from '../../../types';

interface AlbumShareModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  album: OrgPhotoTab;
  onAlbumUpdate: (updated: OrgPhotoTab) => void;
}

export function AlbumShareModal({
  open,
  onClose,
  orgId,
  album,
  onAlbumUpdate,
}: AlbumShareModalProps) {
  const { t } = useTranslation();
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = album.share_token
    ? `${window.location.origin}/shared/album/${album.share_token}`
    : '';

  const handleToggle = useCallback(async () => {
    if (toggling) return;
    try {
      setToggling(true);
      const updated = album.is_shared
        ? await orgPhotoService.disableShare(orgId, album.id)
        : await orgPhotoService.enableShare(orgId, album.id);
      onAlbumUpdate(updated);
      toast.success(
        updated.is_shared
          ? t('photoGallery.shareEnabled', 'Sharing enabled')
          : t('photoGallery.shareDisabled', 'Sharing disabled'),
      );
    } catch {
      toast.error(t('photoGallery.shareToggleError', 'Failed to toggle sharing'));
    } finally {
      setToggling(false);
    }
  }, [toggling, album, orgId, onAlbumUpdate, t]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success(t('photoGallery.shareCopied', 'Copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [shareUrl, t]);

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md">
      {/* Top Accent Line */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
          <Share2 size={16} className="text-bridge-accent" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">
            {t('photoGallery.shareTitle', 'Album Sharing')}
          </h3>
          <p className="text-[10px] text-slate-500">{album.name}</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08]">
          <div>
            <p className="text-sm font-bold text-foreground">
              {t('photoGallery.sharePublicLink', 'Public Link Sharing')}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {t('photoGallery.sharePublicLinkDesc', 'Anyone with the link can view this album (read-only)')}
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              album.is_shared ? 'bg-bridge-accent' : 'bg-foreground/15'
            }`}
          >
            {toggling ? (
              <Loader2 size={12} className="absolute top-1.5 left-1/2 -translate-x-1/2 animate-spin text-white" />
            ) : (
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  album.is_shared ? 'translate-x-[18px]' : 'translate-x-0'
                }`}
              />
            )}
          </button>
        </div>

        {/* Link display */}
        {album.is_shared && shareUrl && (
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {t('photoGallery.shareLink', 'Share Link')}
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-foreground/[0.03] border border-foreground/10 rounded-xl">
                <Link2 size={14} className="text-slate-400 shrink-0" />
                <span className="text-xs text-foreground truncate">{shareUrl}</span>
              </div>
              <button
                onClick={handleCopy}
                className="px-3 py-2.5 rounded-xl text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all shrink-0"
              >
                {copied ? <Check size={14} /> : t('photoGallery.shareCopy', 'Copy')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-[10px] text-slate-600">
          Esc {t('common.close', 'Close')}
        </span>
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-all"
        >
          {t('common.done', 'Done')}
        </button>
      </div>
    </MotionModal>
  );
}
