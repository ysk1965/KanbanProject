import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Share2,
  Link2,
  Check,
  Loader2,
  Copy,
  ExternalLink,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { MotionModal } from '../../ui/MotionModal';
import { orgPhotoService } from '../../../utils/services';
import type { OrgPhotoTab } from '../../../types';

interface AlbumShareManagerModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  albums: OrgPhotoTab[];
  onAlbumsUpdate: (updated: OrgPhotoTab[]) => void;
}

export function AlbumShareManagerModal({
  open,
  onClose,
  orgId,
  albums,
  onAlbumsUpdate,
}: AlbumShareManagerModalProps) {
  const { t } = useTranslation();
  const [galleryEnabled, setGalleryEnabled] = useState(false);
  const [galleryToken, setGalleryToken] = useState('');
  const [galleryToggling, setGalleryToggling] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [uploadTogglingId, setUploadTogglingId] = useState<string | null>(null);
  const [copiedUploadLink, setCopiedUploadLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Gallery upload link state
  const [galleryUploadEnabled, setGalleryUploadEnabled] = useState(false);
  const [galleryUploadToken, setGalleryUploadToken] = useState('');
  const [galleryUploadExpiresAt, setGalleryUploadExpiresAt] = useState('');
  const [galleryUploadToggling, setGalleryUploadToggling] = useState(false);
  const [copiedGalleryUploadLink, setCopiedGalleryUploadLink] = useState(false);

  const shareUrl = galleryToken
    ? `${window.location.origin}/shared/gallery/${galleryToken}`
    : '';

  const galleryUploadUrl = galleryUploadToken
    ? `${window.location.origin}/shared/gallery-upload/${galleryUploadToken}`
    : '';

  // Load gallery share + upload status on open
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        setLoading(true);
        const [shareStatus, uploadStatus] = await Promise.all([
          orgPhotoService.getGalleryShareStatus(orgId),
          orgPhotoService.getGalleryUploadStatus(orgId),
        ]);
        setGalleryEnabled(shareStatus.enabled);
        setGalleryToken(shareStatus.share_token || '');
        setGalleryUploadEnabled(uploadStatus.enabled);
        setGalleryUploadToken(uploadStatus.upload_token || '');
        setGalleryUploadExpiresAt(uploadStatus.expires_at || '');
      } catch {
        console.warn('Failed to load gallery share status');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, orgId]);

  // Toggle gallery-level sharing
  const handleGalleryToggle = useCallback(async () => {
    if (galleryToggling) return;
    try {
      setGalleryToggling(true);
      if (galleryEnabled) {
        await orgPhotoService.disableGalleryShare(orgId);
        setGalleryEnabled(false);
        setGalleryToken('');
        toast.success(t('photoGallery.shareDisabled', 'Sharing disabled'));
      } else {
        const result = await orgPhotoService.enableGalleryShare(orgId);
        setGalleryEnabled(true);
        setGalleryToken(result.share_token);
        toast.success(t('photoGallery.shareEnabled', 'Sharing enabled'));
      }
    } catch {
      toast.error(
        t('photoGallery.shareToggleError', 'Failed to toggle sharing'),
      );
    } finally {
      setGalleryToggling(false);
    }
  }, [galleryToggling, galleryEnabled, orgId, t]);

  // Toggle gallery-level upload
  const handleGalleryUploadToggle = useCallback(async () => {
    if (galleryUploadToggling) return;
    try {
      setGalleryUploadToggling(true);
      if (galleryUploadEnabled) {
        await orgPhotoService.disableGalleryUpload(orgId);
        setGalleryUploadEnabled(false);
        setGalleryUploadToken('');
        setGalleryUploadExpiresAt('');
        toast.success(t('photoGallery.galleryUploadLinkDisabled', 'Gallery upload link removed'));
      } else {
        const result = await orgPhotoService.enableGalleryUpload(orgId);
        setGalleryUploadEnabled(true);
        setGalleryUploadToken(result.upload_token);
        // Reload to get expires_at
        const status = await orgPhotoService.getGalleryUploadStatus(orgId);
        setGalleryUploadExpiresAt(status.expires_at || '');
        toast.success(t('photoGallery.galleryUploadLinkEnabled', 'Gallery upload link created'));
      }
    } catch {
      toast.error(t('photoGallery.shareToggleError', 'Failed to toggle'));
    } finally {
      setGalleryUploadToggling(false);
    }
  }, [galleryUploadToggling, galleryUploadEnabled, orgId, t]);

  const handleCopyGalleryUploadLink = useCallback(async () => {
    if (!galleryUploadUrl) return;
    try {
      await navigator.clipboard.writeText(galleryUploadUrl);
      setCopiedGalleryUploadLink(true);
      toast.success(t('photoGallery.shareCopied', 'Copied'));
      setTimeout(() => setCopiedGalleryUploadLink(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [galleryUploadUrl, t]);

  // Toggle per-album visibility
  const handleAlbumToggle = useCallback(
    async (album: OrgPhotoTab) => {
      if (togglingId) return;
      try {
        setTogglingId(album.id);
        const updated = album.is_shared
          ? await orgPhotoService.disableShare(orgId, album.id)
          : await orgPhotoService.enableShare(orgId, album.id);
        onAlbumsUpdate(
          albums.map((a) => (a.id === updated.id ? updated : a)),
        );
      } catch {
        toast.error(
          t('photoGallery.shareToggleError', 'Failed to toggle sharing'),
        );
      } finally {
        setTogglingId(null);
      }
    },
    [togglingId, orgId, albums, onAlbumsUpdate, t],
  );

  const handleUploadToggle = useCallback(
    async (album: OrgPhotoTab) => {
      if (uploadTogglingId) return;
      try {
        setUploadTogglingId(album.id);
        const updated = album.is_upload_enabled
          ? await orgPhotoService.disableUploadLink(orgId, album.id)
          : await orgPhotoService.enableUploadLink(orgId, album.id);
        onAlbumsUpdate(
          albums.map((a) => (a.id === updated.id ? updated : a)),
        );
        toast.success(
          updated.is_upload_enabled
            ? t('photoGallery.uploadLinkEnabled', 'Upload link created')
            : t('photoGallery.uploadLinkDisabled', 'Upload link removed'),
        );
      } catch {
        toast.error(t('photoGallery.uploadLinkError', 'Failed to toggle upload link'));
      } finally {
        setUploadTogglingId(null);
      }
    },
    [uploadTogglingId, orgId, albums, onAlbumsUpdate, t],
  );

  const handleCopyUploadLink = useCallback(async (token: string) => {
    const url = `${window.location.origin}/shared/upload/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUploadLink(token);
      toast.success(t('photoGallery.shareCopied', 'Copied'));
      setTimeout(() => setCopiedUploadLink(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [t]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      toast.success(t('photoGallery.shareCopied', 'Copied'));
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [shareUrl, t]);

  const sharedCount = albums.filter((a) => a.is_shared).length;

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-lg">
      {/* Top Accent Line */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
          <Share2 size={16} className="text-bridge-accent" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-foreground">
            {t('photoGallery.shareManagerTitle', 'Share Albums')}
          </h3>
          <p className="text-xs text-slate-500">
            {t(
              'photoGallery.shareManagerDesc',
              'Manage public sharing for your albums',
            )}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
        </div>
      ) : (
        <div className="px-5 pb-5 pt-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Gallery-level toggle */}
          <div className="p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {t(
                    'photoGallery.sharePublicLink',
                    'Public Link Sharing',
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(
                    'photoGallery.shareGalleryDesc',
                    'Share selected albums via a single link',
                  )}
                </p>
              </div>
              <button
                onClick={handleGalleryToggle}
                disabled={galleryToggling}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  galleryEnabled ? 'bg-bridge-accent' : 'bg-foreground/15'
                }`}
              >
                {galleryToggling ? (
                  <Loader2
                    size={12}
                    className="absolute top-1.5 left-1/2 -translate-x-1/2 animate-spin text-white"
                  />
                ) : (
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      galleryEnabled ? 'translate-x-[18px]' : 'translate-x-0'
                    }`}
                  />
                )}
              </button>
            </div>

            {/* Link display */}
            {galleryEnabled && shareUrl && (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-2.5 py-2 bg-foreground/[0.03] border border-foreground/10 rounded-xl min-w-0">
                  <Link2 size={12} className="text-slate-400 shrink-0" />
                  <span className="text-xs text-foreground truncate">
                    {shareUrl}
                  </span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all shrink-0"
                >
                  {copiedLink ? (
                    <Check size={14} />
                  ) : (
                    t('photoGallery.shareCopy', 'Copy')
                  )}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            )}
          </div>

          {/* Gallery upload link toggle */}
          <div className="p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-foreground">
                    {t('photoGallery.galleryUploadLink', 'Gallery Upload Link')}
                  </p>
                  <Upload size={14} className="text-bridge-secondary" />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(
                    'photoGallery.galleryUploadLinkDesc',
                    'Anyone with this link can upload photos and manage albums',
                  )}
                </p>
              </div>
              <button
                onClick={handleGalleryUploadToggle}
                disabled={galleryUploadToggling}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  galleryUploadEnabled ? 'bg-bridge-secondary' : 'bg-foreground/15'
                }`}
              >
                {galleryUploadToggling ? (
                  <Loader2
                    size={12}
                    className="absolute top-1.5 left-1/2 -translate-x-1/2 animate-spin text-white"
                  />
                ) : (
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      galleryUploadEnabled ? 'translate-x-[18px]' : 'translate-x-0'
                    }`}
                  />
                )}
              </button>
            </div>

            {galleryUploadEnabled && galleryUploadUrl && (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-2.5 py-2 bg-foreground/[0.03] border border-foreground/10 rounded-xl min-w-0">
                    <Upload size={12} className="text-bridge-secondary shrink-0" />
                    <span className="text-xs text-foreground truncate">
                      {galleryUploadUrl}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyGalleryUploadLink}
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-bridge-secondary text-white hover:bg-bridge-secondary/90 transition-all shrink-0"
                  >
                    {copiedGalleryUploadLink ? (
                      <Check size={14} />
                    ) : (
                      t('photoGallery.shareCopy', 'Copy')
                    )}
                  </button>
                  <a
                    href={galleryUploadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
                {galleryUploadExpiresAt && (() => {
                  const exp = new Date(galleryUploadExpiresAt);
                  const hrs = Math.max(0, Math.floor((exp.getTime() - Date.now()) / (1000 * 60 * 60)));
                  const days = Math.floor(hrs / 24);
                  return (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
                      {days > 0 ? `${days}d ${hrs % 24}h left` : `${hrs}h left`}
                    </span>
                  );
                })()}
              </>
            )}
          </div>

          {/* Album visibility toggles */}
          {galleryEnabled && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t(
                    'photoGallery.shareSelectAlbums',
                    'Albums to include',
                  )}
                </label>
                {sharedCount > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                    {sharedCount}{' '}
                    {t('photoGallery.shareActiveCount', 'active')}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {albums.map((album) => {
                  const isToggling = togglingId === album.id;
                  const isUploadToggling = uploadTogglingId === album.id;
                  return (
                    <div
                      key={album.id}
                      className="rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors overflow-hidden"
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground truncate">
                              {album.name}
                            </span>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/10 text-slate-500 shrink-0">
                              {album.photo_count}
                            </span>
                          </div>
                        </div>
                        {/* Upload link toggle */}
                        <button
                          onClick={() => handleUploadToggle(album)}
                          disabled={isUploadToggling}
                          title={album.is_upload_enabled
                            ? t('photoGallery.disableUploadLink', 'Disable upload link')
                            : t('photoGallery.enableUploadLink', 'Enable upload link')}
                          className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                            album.is_upload_enabled
                              ? 'text-bridge-secondary bg-bridge-secondary/15'
                              : 'text-slate-500 hover:text-foreground hover:bg-foreground/5'
                          }`}
                        >
                          {isUploadToggling ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Upload size={14} />
                          )}
                        </button>
                        {/* Share toggle */}
                        <button
                          onClick={() => handleAlbumToggle(album)}
                          disabled={isToggling}
                          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                            album.is_shared
                              ? 'bg-bridge-accent'
                              : 'bg-foreground/15'
                          }`}
                        >
                          {isToggling ? (
                            <Loader2
                              size={10}
                              className="absolute top-1.5 left-1/2 -translate-x-1/2 animate-spin text-white"
                            />
                          ) : (
                            <span
                              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                album.is_shared
                                  ? 'translate-x-[14px]'
                                  : 'translate-x-0'
                              }`}
                            />
                          )}
                        </button>
                      </div>
                      {/* Upload link display */}
                      {album.is_upload_enabled && album.upload_token && (
                        <div className="flex items-center gap-2 px-3 pb-2.5">
                          <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 bg-foreground/[0.03] border border-foreground/10 rounded-lg min-w-0">
                            <Upload size={10} className="text-bridge-secondary shrink-0" />
                            <span className="text-xs text-slate-400 truncate">
                              {window.location.origin}/shared/upload/{album.upload_token}
                            </span>
                          </div>
                          <button
                            onClick={() => handleCopyUploadLink(album.upload_token!)}
                            className="px-2 py-1.5 rounded-lg text-xs font-bold bg-bridge-secondary/15 text-bridge-secondary hover:bg-bridge-secondary/25 transition-all shrink-0"
                          >
                            {copiedUploadLink === album.upload_token ? (
                              <Check size={12} />
                            ) : (
                              t('photoGallery.shareCopy', 'Copy')
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
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
