import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Camera,
  AlertCircle,
  ArrowLeft,
  Download,
  Loader2,
  Images,
} from 'lucide-react';
import { publicGalleryAPI, resolveFileUrl } from '../utils/api';
import { PhotoLightbox } from '../components/organization/photo/PhotoLightbox';
import { isNative } from '../utils/platform';
import { saveToDevice } from '../utils/nativeDownload';
import type {
  SharedGalleryInfo,
  SharedAlbumSummary,
  SharedPhotoItem,
  OrgPhoto,
} from '../types';

/** Map SharedPhotoItem → OrgPhoto shape so we can reuse PhotoLightbox */
function toOrgPhoto(item: SharedPhotoItem): OrgPhoto {
  return {
    id: item.id,
    tab_id: '',
    s3_key: '',
    thumbnail_key: null,
    url: item.url,
    thumbnail_url: item.thumbnail_url,
    original_filename: item.original_filename,
    file_size: item.file_size,
    content_type: item.content_type,
    width: item.width,
    height: item.height,
    caption: item.caption,
    uploaded_by: { id: '', name: '', email: '', profile_image_url: null },
    created_at: item.created_at,
  };
}

export function SharedGalleryPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { t } = useTranslation();
  const [galleryInfo, setGalleryInfo] = useState<SharedGalleryInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active album tab
  const [activeAlbum, setActiveAlbum] = useState<SharedAlbumSummary | null>(
    null,
  );

  // Photos for current album
  const [photos, setPhotos] = useState<OrgPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);

  // Lightbox
  const [lightboxPhoto, setLightboxPhoto] = useState<OrgPhoto | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch gallery info
  useEffect(() => {
    if (!shareToken) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const info = await publicGalleryAPI.getSharedGallery(shareToken);
        setGalleryInfo(info);
        if (info.albums.length > 0) {
          setActiveAlbum(info.albums[0]);
        }
      } catch {
        setError(
          t('photoGallery.shareNotAvailable', 'Album not available'),
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [shareToken, t]);

  // Fetch photos for active album
  const fetchPhotos = useCallback(
    async (cursor?: string) => {
      if (!shareToken || !activeAlbum) return;
      try {
        setPhotosLoading(true);
        const data = await publicGalleryAPI.getSharedGalleryPhotos(
          shareToken,
          activeAlbum.id,
          { cursor, size: 12 },
        );
        const mapped = data.photos.map(toOrgPhoto);
        if (cursor) {
          setPhotos((prev) => [...prev, ...mapped]);
        } else {
          setPhotos(mapped);
        }
        setNextCursor(data.next_cursor);
        setHasNext(data.has_next);
      } catch {
        console.warn('Failed to fetch shared gallery photos');
      } finally {
        setPhotosLoading(false);
      }
    },
    [shareToken, activeAlbum],
  );

  useEffect(() => {
    if (activeAlbum) {
      setPhotos([]);
      setNextCursor(null);
      setHasNext(false);
      fetchPhotos();
    }
  }, [activeAlbum, fetchPhotos]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasNext &&
          !photosLoading &&
          nextCursor
        ) {
          fetchPhotos(nextCursor);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, photosLoading, nextCursor, fetchPhotos]);

  // Download single photo
  const handleDownload = useCallback(async (photo: OrgPhoto) => {
    try {
      const url = resolveFileUrl(photo.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();

      if (isNative()) {
        const result = await saveToDevice(blob, photo.original_filename);
        if (!result.success) throw new Error(result.error || 'Save failed');
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = photo.original_filename;
        a.click();
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.warn('Download failed:', error);
      window.open(resolveFileUrl(photo.url), '_blank');
    }
  }, []);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-bridge-accent mx-auto mb-4" />
          <p className="text-slate-400 text-sm">
            {t('app.loading', 'Loading...')}
          </p>
        </div>
      </div>
    );
  }

  // Error
  if (error || !galleryInfo) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            {t(
              'photoGallery.shareNotAvailable',
              'Album not available',
            )}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {t(
              'photoGallery.shareNotAvailableDesc',
              'This shared link has expired or the album has been deleted.',
            )}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl text-sm font-medium hover:bg-bridge-accent/90 transition-colors"
          >
            <ArrowLeft size={14} />
            {t('photoGallery.shareGoHome', 'Go to Home')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Top bar */}
      <header className="border-b border-foreground/5 bg-bridge-obsidian">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-slate-400 hover:text-foreground transition-colors"
          >
            <img
              src="/BridgeSpotsIcon.png"
              alt="BRIDGE"
              className="h-6 w-6"
            />
            <span className="text-sm font-semibold text-foreground">
              BRIDGE
            </span>
          </Link>
          <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-slate-500">
            <Camera size={12} />
            {t('photoGallery.shareReadOnly', 'READ ONLY')}
          </div>
        </div>
      </header>

      {/* Gallery header */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          {galleryInfo.organization_logo_url && (
            <img
              src={resolveFileUrl(galleryInfo.organization_logo_url)}
              alt={galleryInfo.organization_name}
              className="w-8 h-8 rounded-lg object-cover"
            />
          )}
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            {galleryInfo.organization_name}
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
          {t('photoGallery.title', 'Photos')}
        </h1>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
          {galleryInfo.total_photo_count}{' '}
          {t('photoGallery.photosUnit', 'photos')}
        </span>
      </div>

      {/* Album tabs */}
      {galleryInfo.albums.length > 1 && (
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-2 pb-3 overflow-x-auto custom-scrollbar">
            {galleryInfo.albums.map((album) => (
              <button
                key={album.id}
                onClick={() => setActiveAlbum(album)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  activeAlbum?.id === album.id
                    ? 'bg-bridge-accent/15 text-bridge-accent border border-bridge-accent/30'
                    : 'text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-transparent'
                }`}
              >
                {album.name}
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeAlbum?.id === album.id
                      ? 'bg-bridge-accent/20 text-bridge-accent'
                      : 'bg-foreground/10 text-slate-500'
                  }`}
                >
                  {album.photo_count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-foreground/5" />

      {/* Photo grid */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {photos.length === 0 && !photosLoading ? (
          <div className="text-center py-20">
            <Images size={36} className="mx-auto mb-3 text-slate-500/50" />
            <p className="text-sm text-slate-500">
              {t('photoGallery.emptyTitle', 'No photos yet')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {photos.map((photo, i) => (
              <motion.div
                key={photo.id}
                className="relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-bridge-obsidian border border-foreground/[0.08] hover:border-foreground/[0.12] transition-all group"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => setLightboxPhoto(photo)}
              >
                <img
                  src={resolveFileUrl(photo.thumbnail_url || photo.url)}
                  alt={photo.caption || photo.original_filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <span className="text-[10px] text-white/90 truncate flex-1">
                    {photo.original_filename}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(photo);
                    }}
                    className="p-1 rounded-md hover:bg-white/20 transition-colors shrink-0"
                  >
                    <Download size={14} className="text-white" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Skeleton loading */}
        {photosLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl bg-foreground/5 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />
      </div>

      {/* Lightbox */}
      <PhotoLightbox
        photo={lightboxPhoto}
        photos={photos}
        isAdmin={false}
        onClose={() => setLightboxPhoto(null)}
        onNavigate={setLightboxPhoto}
        onDownload={handleDownload}
        onDelete={() => {}}
      />

      {/* Footer */}
      <footer className="border-t border-foreground/5 mt-8">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <span className="text-[10px] tracking-[0.3em] uppercase text-slate-600">
            Shared via BRIDGE
          </span>
          <a
            href="https://bridgespots.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-bridge-accent transition-colors"
          >
            bridgespots.com
          </a>
        </div>
      </footer>
    </div>
  );
}
