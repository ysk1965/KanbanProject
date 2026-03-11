import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Upload,
  CheckSquare,
  Download,
  Trash2,
  X,
  AlertTriangle,
  Loader2,
  ImagePlus,
  Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { orgPhotoService } from '../../../utils/services';
import { isNative } from '../../../utils/platform';
import { saveToDevice } from '../../../utils/nativeDownload';
import { MotionModal } from '../../ui/MotionModal';
import { PhotoAlbumBar } from '../photo/PhotoAlbumBar';
import { PhotoGrid } from '../photo/PhotoGrid';
import { PhotoLightbox } from '../photo/PhotoLightbox';
import { PhotoUploadModal } from '../photo/PhotoUploadModal';
import { AlbumCreateModal } from '../photo/AlbumCreateModal';
import { AlbumShareModal } from '../photo/AlbumShareButton';
import { AlbumShareManagerModal } from '../photo/AlbumShareManagerModal';
import type { OrgPhotoTab, OrgPhoto, OrgPhotoPage } from '../../../types';


interface OrgPhotoGalleryTabProps {
  orgId: string;
  myRole: string;
}

export function OrgPhotoGalleryTab({ orgId, myRole }: OrgPhotoGalleryTabProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';

  // Album (Tab) state
  const [albums, setAlbums] = useState<OrgPhotoTab[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  const [albumsLoading, setAlbumsLoading] = useState(true);

  // Photo state
  const [photos, setPhotos] = useState<OrgPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Lightbox
  const [lightboxPhoto, setLightboxPhoto] = useState<OrgPhoto | null>(null);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<OrgPhotoTab | null>(null);
  const [showDeleteAlbumConfirm, setShowDeleteAlbumConfirm] = useState<OrgPhotoTab | null>(null);
  const [showDeletePhotosConfirm, setShowDeletePhotosConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareAlbum, setShareAlbum] = useState<OrgPhotoTab | null>(null);
  const [showShareManager, setShowShareManager] = useState(false);

  // Fetch albums
  const fetchAlbums = useCallback(async () => {
    try {
      setAlbumsLoading(true);
      const data = await orgPhotoService.getTabs(orgId);
      setAlbums(data);
    } catch (error) {
      console.warn('Failed to fetch albums:', error);
    } finally {
      setAlbumsLoading(false);
    }
  }, [orgId]);

  // Fetch photos (with reset option)
  const fetchPhotos = useCallback(
    async (cursor?: string) => {
      try {
        setPhotosLoading(true);
        const params: { tab_id?: string; cursor?: string; size?: number } = {
          size: 30,
        };
        if (activeAlbumId) params.tab_id = activeAlbumId;
        if (cursor) params.cursor = cursor;

        const data: OrgPhotoPage = await orgPhotoService.getPhotos(orgId, params);

        if (cursor) {
          // Append for infinite scroll
          setPhotos((prev) => [...prev, ...data.photos]);
        } else {
          // Replace for fresh load
          setPhotos(data.photos);
        }
        setNextCursor(data.next_cursor);
        setHasNext(data.has_next);
        setTotalCount(data.total_count);
      } catch (error) {
        console.warn('Failed to fetch photos:', error);
      } finally {
        setPhotosLoading(false);
      }
    },
    [orgId, activeAlbumId],
  );

  // Load more for infinite scroll
  const handleLoadMore = useCallback(() => {
    if (nextCursor && hasNext && !photosLoading) {
      fetchPhotos(nextCursor);
    }
  }, [nextCursor, hasNext, photosLoading, fetchPhotos]);

  // Initial load
  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums]);

  // Reload photos when activeAlbumId changes
  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Reset selection when switching albums or exiting select mode
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeAlbumId, selectMode]);

  // Compute totals for "All" tab
  const allPhotosCount = totalCount;

  const activeAlbum = albums.find((a) => a.id === activeAlbumId) || null;
  const displayCount = activeAlbum ? activeAlbum.photo_count : allPhotosCount;

  // Toggle select
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Download single photo
  const handleDownloadSingle = useCallback(
    async (photo: OrgPhoto) => {
      try {
        const response = await fetch(photo.url);
        if (!response.ok) throw new Error('Download failed');
        const blob = await response.blob();

        if (isNative()) {
          const result = await saveToDevice(blob, photo.original_filename);
          if (result.success) {
            toast.success(t('photoGallery.savedToDevice', 'Saved to BRIDGE Downloads'));
          } else {
            throw new Error(result.error || 'Save failed');
          }
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = photo.original_filename;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.warn('Download failed:', error);
        toast.error(t('photoGallery.downloadError', 'Failed to download'));
      }
    },
    [t],
  );

  // Batch download (individual files)
  const handleBatchDownload = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));
      let downloadedCount = 0;
      for (const photo of selectedPhotos) {
        try {
          const response = await fetch(photo.url);
          if (!response.ok) continue;
          const blob = await response.blob();

          if (isNative()) {
            await saveToDevice(blob, photo.original_filename);
          } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = photo.original_filename;
            a.click();
            URL.revokeObjectURL(url);
          }
          downloadedCount++;
        } catch {
          console.warn('Failed to download photo:', photo.id);
        }
      }
      if (downloadedCount > 0) {
        toast.success(
          isNative()
            ? t('photoGallery.savedToDevice', 'Saved to BRIDGE Downloads')
            : t('photoGallery.downloadSuccess', '{{count}} photos downloaded', {
                count: downloadedCount,
              }),
        );
      }
    } catch (error) {
      console.warn('Batch download failed:', error);
      toast.error(t('photoGallery.downloadError', 'Failed to download'));
    }
  }, [selectedIds, photos, t]);

  // Delete selected photos
  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0 || deleting) return;
    try {
      setDeleting(true);
      await orgPhotoService.deletePhotos(orgId, Array.from(selectedIds));
      toast.success(
        t('photoGallery.deleteSuccess', '{{count}} photos deleted', {
          count: selectedIds.size,
        }),
      );
      setSelectedIds(new Set());
      setShowDeletePhotosConfirm(false);
      setSelectMode(false);
      fetchPhotos();
      fetchAlbums();
    } catch (error) {
      console.warn('Failed to delete photos:', error);
      toast.error(t('photoGallery.deleteError', 'Failed to delete photos'));
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, deleting, orgId, t, fetchPhotos, fetchAlbums]);

  // Delete single photo from lightbox
  const handleDeleteFromLightbox = useCallback(
    async (photoId: string) => {
      try {
        await orgPhotoService.deletePhotos(orgId, [photoId]);
        toast.success(t('photoGallery.photoDeleted', 'Photo deleted'));
        setLightboxPhoto(null);
        fetchPhotos();
        fetchAlbums();
      } catch (error) {
        console.warn('Failed to delete photo:', error);
        toast.error(t('photoGallery.deleteError', 'Failed to delete photo'));
      }
    },
    [orgId, t, fetchPhotos, fetchAlbums],
  );

  // Delete album
  const handleDeleteAlbum = useCallback(
    async (album: OrgPhotoTab) => {
      try {
        await orgPhotoService.deleteTab(orgId, album.id);
        toast.success(t('photoGallery.albumDeleted', 'Album deleted'));
        setShowDeleteAlbumConfirm(null);
        if (activeAlbumId === album.id) {
          setActiveAlbumId(null);
        }
        fetchAlbums();
        fetchPhotos();
      } catch (error) {
        console.warn('Failed to delete album:', error);
        toast.error(t('photoGallery.albumDeleteError', 'Failed to delete album'));
      }
    },
    [orgId, activeAlbumId, t, fetchAlbums, fetchPhotos],
  );

  // Upload complete handler
  const handleUploadComplete = useCallback(() => {
    fetchPhotos();
    fetchAlbums();
  }, [fetchPhotos, fetchAlbums]);

  // Album saved handler
  const handleAlbumSaved = useCallback(() => {
    fetchAlbums();
  }, [fetchAlbums]);

  // Open edit album modal
  const handleEditAlbum = useCallback((album: OrgPhotoTab) => {
    setEditingAlbum(album);
    setShowAlbumModal(true);
  }, []);

  // Share album update
  const handleShareAlbumUpdate = useCallback((updated: OrgPhotoTab) => {
    setAlbums((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setShareAlbum(updated);
  }, []);

  // Open create album modal
  const handleCreateAlbum = useCallback(() => {
    setEditingAlbum(null);
    setShowAlbumModal(true);
  }, []);

  const showEmptyState = !photosLoading && photos.length === 0 && !albumsLoading;

  return (
    <div className="space-y-4">
      {/* Album bar */}
      {albumsLoading ? (
        <div className="flex items-center gap-2 py-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 w-20 bg-foreground/5 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : (
        <PhotoAlbumBar
          albums={albums}
          activeAlbumId={activeAlbumId}
          onSelectAlbum={setActiveAlbumId}
          totalCount={allPhotosCount}
          isAdmin={isAdmin}
          onCreateAlbum={handleCreateAlbum}
          onEditAlbum={handleEditAlbum}
          onDeleteAlbum={(album) => setShowDeleteAlbumConfirm(album)}
          onShareAlbum={setShareAlbum}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between pb-3 border-b border-foreground/[0.08]">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm md:text-base font-bold text-foreground tracking-tight">
            {activeAlbum?.name || t('photoGallery.allPhotos', 'All Photos')}
          </h3>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
            {displayCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Select mode toggle */}
          {photos.length > 0 && (
            <button
              onClick={() => setSelectMode((prev) => !prev)}
              className={`p-2 rounded-lg transition-colors ${
                selectMode
                  ? 'text-bridge-accent bg-bridge-accent/15'
                  : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
              }`}
              title={t('photoGallery.selectMode', 'Select')}
            >
              <CheckSquare size={16} />
            </button>
          )}
          {/* Share manager button — ADMIN only */}
          {isAdmin && albums.length > 0 && (
            <button
              onClick={() => setShowShareManager(true)}
              className="p-2 rounded-lg text-slate-400 hover:text-bridge-accent hover:bg-bridge-accent/10 transition-colors"
              title={t('photoGallery.shareManagerTitle', 'Share Albums')}
            >
              <Share2 size={16} />
            </button>
          )}
          {/* Upload button — ADMIN only */}
          {isAdmin && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.25)] transition-all"
            >
              <Upload size={14} />
              {t('photoGallery.upload', 'Upload')}
            </button>
          )}
        </div>
      </div>

      {/* Photo grid or empty state */}
      {showEmptyState ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="w-full max-w-sm mx-auto border-2 border-dashed border-foreground/[0.08] rounded-2xl p-8 flex flex-col items-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-bridge-accent/10 to-bridge-secondary/10 flex items-center justify-center mb-5">
              <ImagePlus size={36} className="text-bridge-accent/60" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1.5">
              {t('photoGallery.emptyTitle', 'No photos yet')}
            </h3>
            <p className="text-sm text-muted-foreground mb-2 max-w-xs">
              {isAdmin
                ? t(
                    'photoGallery.emptyAdminDescription',
                    'Upload photos to share with your organization members.',
                  )
                : t(
                    'photoGallery.emptyDescription',
                    'Photos uploaded by admins will appear here.',
                  )}
            </p>
            <p className="text-[11px] text-slate-500 mb-6">
              {t('photoGallery.uploadFormats', 'JPG, PNG, WebP, GIF - max {{max}} files', { max: 1000 })}
            </p>
            {isAdmin && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
              >
                <Upload size={16} />
                {t('photoGallery.upload', 'Upload')}
              </button>
            )}
          </div>
        </motion.div>
      ) : (
        <PhotoGrid
          photos={photos}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onOpenLightbox={setLightboxPhoto}
          onDownloadSingle={handleDownloadSingle}
          loading={photosLoading}
          hasNext={hasNext}
          onLoadMore={handleLoadMore}
        />
      )}

      {/* Lightbox */}
      <PhotoLightbox
        photo={lightboxPhoto}
        photos={photos}
        isAdmin={isAdmin}
        onClose={() => setLightboxPhoto(null)}
        onNavigate={setLightboxPhoto}
        onDownload={handleDownloadSingle}
        onDelete={handleDeleteFromLightbox}
      />

      {/* Selection floating action bar */}
      <AnimatePresence>
        {selectMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-bridge-obsidian border border-foreground/[0.08] shadow-2xl"
          >
            <span className="text-xs font-bold text-foreground">
              {t('photoGallery.selectedCount', '{{count}} selected', {
                count: selectedIds.size,
              })}
            </span>
            <div className="w-px h-5 bg-foreground/10" />
            {/* Download */}
            <button
              onClick={handleBatchDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all"
            >
              <Download size={14} />
              {t('photoGallery.download', 'Download')}
            </button>
            {/* Delete — ADMIN only */}
            {isAdmin && (
              <button
                onClick={() => setShowDeletePhotosConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-all"
              >
                <Trash2 size={14} />
                {t('photoGallery.delete', 'Delete')}
              </button>
            )}
            {/* Clear selection */}
            <button
              onClick={() => {
                setSelectedIds(new Set());
                setSelectMode(false);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <PhotoUploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        orgId={orgId}
        albums={albums}
        activeAlbumId={activeAlbumId}
        onUploadComplete={handleUploadComplete}
      />

      {/* Album Create/Edit Modal */}
      <AlbumCreateModal
        open={showAlbumModal}
        onClose={() => {
          setShowAlbumModal(false);
          setEditingAlbum(null);
        }}
        orgId={orgId}
        album={editingAlbum}
        onSaved={handleAlbumSaved}
      />

      {/* Delete Album Confirmation */}
      <MotionModal
        open={!!showDeleteAlbumConfirm}
        onClose={() => setShowDeleteAlbumConfirm(null)}
        className="sm:max-w-sm"
      >
        <div className="h-1 bg-gradient-to-r from-amber-500 to-red-500 rounded-t-2xl" />
        <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-bold text-foreground">
              {t('photoGallery.deleteAlbumConfirm', 'Delete Album?')}
            </h2>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'photoGallery.deleteAlbumWarning',
              'All photos in this album will be permanently deleted. This action cannot be undone.',
            )}
          </p>
          {showDeleteAlbumConfirm && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.06]">
              <span className="text-sm font-medium text-foreground">
                {showDeleteAlbumConfirm.name}
              </span>
              <span className="text-[10px] text-slate-500 ml-2">
                {showDeleteAlbumConfirm.photo_count}{' '}
                {t('photoGallery.photosUnit', 'photos')}
              </span>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">ESC</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteAlbumConfirm(null)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={() =>
                showDeleteAlbumConfirm && handleDeleteAlbum(showDeleteAlbumConfirm)
              }
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              {t('photoGallery.deleteAlbumButton', 'Delete')}
            </button>
          </div>
        </div>
      </MotionModal>

      {/* Delete Photos Confirmation */}
      <MotionModal
        open={showDeletePhotosConfirm}
        onClose={() => setShowDeletePhotosConfirm(false)}
        className="sm:max-w-sm"
      >
        <div className="h-1 bg-gradient-to-r from-amber-500 to-red-500 rounded-t-2xl" />
        <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-bold text-foreground">
              {t('photoGallery.deletePhotosConfirm', 'Delete Photos?')}
            </h2>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'photoGallery.deletePhotosWarning',
              '{{count}} selected photos will be permanently deleted.',
              { count: selectedIds.size },
            )}
          </p>
        </div>
        <div className="px-5 py-3 border-t border-foreground/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">ESC</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeletePhotosConfirm(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  {t('common.deleting', 'Deleting...')}
                </span>
              ) : (
                t('photoGallery.deleteButton', 'Delete')
              )}
            </button>
          </div>
        </div>
      </MotionModal>
      {/* Share Album Modal (single — from context menu) */}
      {shareAlbum && (
        <AlbumShareModal
          open={!!shareAlbum}
          onClose={() => setShareAlbum(null)}
          orgId={orgId}
          album={shareAlbum}
          onAlbumUpdate={handleShareAlbumUpdate}
        />
      )}

      {/* Share Manager Modal (multi — from toolbar) */}
      <AlbumShareManagerModal
        open={showShareManager}
        onClose={() => setShowShareManager(false)}
        orgId={orgId}
        albums={albums}
        onAlbumsUpdate={setAlbums}
      />
    </div>
  );
}
