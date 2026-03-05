import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Upload, ImagePlus, X, Loader2, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { MotionModal } from '../../ui/MotionModal';
import { orgPhotoService } from '../../../utils/services';
import type { OrgPhotoTab } from '../../../types';

interface PhotoUploadModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  albums: OrgPhotoTab[];
  activeAlbumId: string | null;
  onUploadComplete: () => void;
}

interface PreviewFile {
  file: File;
  previewUrl: string;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILES = 1000;
const CHUNK_SIZE = 20; // Backend limit per request

export function PhotoUploadModal({
  open,
  onClose,
  orgId,
  albums,
  activeAlbumId,
  onUploadComplete,
}: PhotoUploadModalProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('');
  const [previews, setPreviews] = useState<PreviewFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [savingAlbum, setSavingAlbum] = useState(false);
  const newAlbumInputRef = useRef<HTMLInputElement>(null);

  // Initialize selected album when modal opens
  useEffect(() => {
    if (open) {
      const defaultId = activeAlbumId || (albums.length > 0 ? albums[0].id : '');
      setSelectedAlbumId(defaultId);
      setPreviews([]);
      setUploading(false);
      setProgress(0);
      setUploadedCount(0);
      setCurrentBatch(0);
      setTotalBatches(0);
      setCreatingAlbum(albums.length === 0);
      setNewAlbumName('');
    }
  }, [open, activeAlbumId, albums]);

  // Cleanup preview URLs
  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [previews]);

  const handleCreateAlbum = useCallback(async () => {
    const trimmed = newAlbumName.trim();
    if (!trimmed || savingAlbum) return;
    try {
      setSavingAlbum(true);
      const created = await orgPhotoService.createTab(orgId, { name: trimmed });
      toast.success(t('photoGallery.albumCreated', 'Album created'));
      setCreatingAlbum(false);
      setNewAlbumName('');
      // Select the newly created album
      if (created?.id) {
        setSelectedAlbumId(created.id);
      }
      onUploadComplete(); // refresh album list
    } catch (error) {
      console.warn('Failed to create album:', error);
      toast.error(t('photoGallery.albumCreateError', 'Failed to create album'));
    } finally {
      setSavingAlbum(false);
    }
  }, [newAlbumName, savingAlbum, orgId, t, onUploadComplete]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const validFiles = Array.from(files).filter((f) =>
        ACCEPTED_TYPES.includes(f.type),
      );
      if (validFiles.length === 0) {
        toast.error(t('photoGallery.invalidFormat', 'Unsupported file format'));
        return;
      }

      setPreviews((prev) => {
        const remaining = MAX_FILES - prev.length;
        if (remaining <= 0) {
          toast.error(
            t('photoGallery.maxFiles', 'Maximum {{max}} files', { max: MAX_FILES }),
          );
          return prev;
        }
        const toAdd = validFiles.slice(0, remaining);
        const newPreviews = toAdd.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        }));
        if (validFiles.length > remaining) {
          toast.error(
            t('photoGallery.maxFiles', 'Maximum {{max}} files', { max: MAX_FILES }),
          );
        }
        return [...prev, ...newPreviews];
      });
    },
    [t],
  );

  const removePreview = useCallback((index: number) => {
    setPreviews((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        e.target.value = '';
      }
    },
    [addFiles],
  );

  const handleUpload = useCallback(async () => {
    if (previews.length === 0 || uploading) return;

    let targetAlbumId = selectedAlbumId;

    // Auto-create album if user typed a name but hasn't saved yet
    if (!targetAlbumId && creatingAlbum && newAlbumName.trim()) {
      try {
        setUploading(true);
        setProgress(5);
        const created = await orgPhotoService.createTab(orgId, { name: newAlbumName.trim() });
        if (!created?.id) throw new Error('No album ID returned');
        targetAlbumId = created.id;
        setSelectedAlbumId(created.id);
        setCreatingAlbum(false);
        setNewAlbumName('');
        onUploadComplete();
      } catch (error) {
        console.warn('Failed to auto-create album:', error);
        toast.error(t('photoGallery.albumCreateError', 'Failed to create album'));
        setUploading(false);
        return;
      }
    }

    if (!targetAlbumId) return;

    try {
      if (!uploading) setUploading(true);
      const files = previews.map((p) => p.file);
      const chunks: File[][] = [];
      for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        chunks.push(files.slice(i, i + CHUNK_SIZE));
      }
      setTotalBatches(chunks.length);
      setUploadedCount(0);

      let uploaded = 0;
      for (let i = 0; i < chunks.length; i++) {
        setCurrentBatch(i + 1);
        setProgress(Math.round((uploaded / files.length) * 100));
        await orgPhotoService.uploadPhotos(orgId, targetAlbumId, chunks[i]);
        uploaded += chunks[i].length;
        setUploadedCount(uploaded);
      }

      setProgress(100);
      toast.success(
        t('photoGallery.uploadSuccess', '{{count}} photos uploaded', {
          count: files.length,
        }),
      );
      onUploadComplete();
      onClose();
    } catch (error) {
      console.warn('Failed to upload photos:', error);
      const failedAt = uploadedCount;
      toast.error(
        failedAt > 0
          ? t('photoGallery.uploadPartialError', 'Upload failed after {{count}} photos. Retry to continue.', { count: failedAt })
          : t('photoGallery.uploadError', 'Failed to upload photos'),
      );
    } finally {
      setUploading(false);
    }
  }, [previews, selectedAlbumId, uploading, orgId, t, onUploadComplete, onClose, creatingAlbum, newAlbumName]);

  return (
    <MotionModal open={open} onClose={onClose}>
      {/* 1) Top Accent Line */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

      {/* 2) Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
          <Upload size={16} className="text-bridge-accent" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">
            {t('photoGallery.uploadTitle', 'Upload Photos')}
          </h3>
          <p className="text-[10px] text-slate-500">
            {t('photoGallery.uploadHint', 'JPG, PNG, WebP, GIF supported')}
          </p>
        </div>
      </div>

      {/* 3) Body */}
      <div className="px-5 pb-5 pt-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {/* Album selector */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
            {t('photoGallery.album', 'Album')}
          </label>
          {creatingAlbum || albums.length === 0 ? (
            <div className="flex gap-2">
              <input
                ref={newAlbumInputRef}
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAlbumName.trim()) handleCreateAlbum();
                  if (e.key === 'Escape' && albums.length > 0) { setCreatingAlbum(false); setNewAlbumName(''); }
                }}
                placeholder={t('photoGallery.albumNamePlaceholder', 'e.g. Team Workshop 2026')}
                maxLength={50}
                autoFocus
                className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
              <button
                onClick={handleCreateAlbum}
                disabled={!newAlbumName.trim() || savingAlbum}
                className="px-3 py-2 rounded-xl bg-bridge-accent text-white text-xs font-bold disabled:opacity-50 hover:bg-bridge-accent/90 transition-all shrink-0"
              >
                {savingAlbum ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              </button>
              {albums.length > 0 && (
                <button
                  onClick={() => { setCreatingAlbum(false); setNewAlbumName(''); }}
                  className="p-2 rounded-xl bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10 transition-all shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                value={selectedAlbumId}
                onChange={(e) => setSelectedAlbumId(e.target.value)}
                className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              >
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setCreatingAlbum(true)}
                title={t('photoGallery.createAlbumTitle', 'Create Album')}
                className="px-3 py-2 rounded-xl bg-foreground/5 border border-foreground/10 text-slate-400 hover:text-bridge-accent hover:border-bridge-accent/30 hover:bg-bridge-accent/5 transition-all shrink-0 flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span className="text-xs font-bold">{t('common.new', 'New')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
            isDragging
              ? 'border-bridge-accent/50 bg-bridge-accent/5'
              : 'border-foreground/10 hover:border-foreground/20'
          }`}
        >
          <ImagePlus size={32} className="mx-auto mb-3 text-slate-500" />
          <p className="text-sm text-slate-400">
            {t('photoGallery.uploadDropzone', 'Drag & drop or click to browse')}
          </p>
          <p className="text-[10px] text-slate-600 mt-1">
            {t('photoGallery.uploadFormats', 'JPG, PNG, WebP, GIF - max {{max}} files', { max: MAX_FILES })}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileInput}
          className="hidden"
        />

        {/* Preview grid */}
        {previews.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {previews.map((p, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-lg overflow-hidden border border-foreground/[0.08]"
              >
                <img
                  src={p.previewUrl}
                  alt={p.file.name}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removePreview(i);
                  }}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
                >
                  <X size={12} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="space-y-2">
            <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 text-center">
              {totalBatches > 1
                ? t('photoGallery.uploadBatchProgress', 'Batch {{current}}/{{total}} — {{uploaded}}/{{count}} photos', {
                    current: currentBatch,
                    total: totalBatches,
                    uploaded: uploadedCount,
                    count: previews.length,
                  })
                : t('photoGallery.uploadProgress', 'Uploading {{count}} photos...', {
                    count: previews.length,
                  })}
            </p>
          </div>
        )}
      </div>

      {/* 4) Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-600">
            Esc {t('common.close', 'Close')}
          </span>
          {previews.length > 0 && !selectedAlbumId && !creatingAlbum && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[10px] text-amber-600 dark:text-amber-400"
            >
              {albums.length === 0
                ? t('photoGallery.hintCreateAlbum', 'Create an album first')
                : t('photoGallery.hintSelectAlbum', 'Select an album')}
            </motion.span>
          )}
        </div>
        <button
          onClick={handleUpload}
          disabled={previews.length === 0 || (!selectedAlbumId && !(creatingAlbum && newAlbumName.trim())) || uploading}
          className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent disabled:opacity-50 hover:bg-bridge-accent/90 transition-all"
        >
          {uploading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              {t('photoGallery.uploading', 'Uploading...')}
            </span>
          ) : creatingAlbum && newAlbumName.trim() && !selectedAlbumId ? (
            t('photoGallery.createAndUpload', 'Create Album & Upload {{count}}', {
              count: previews.length,
            })
          ) : (
            t('photoGallery.uploadCount', 'Upload {{count}} photos', {
              count: previews.length,
            })
          )}
        </button>
      </div>
    </MotionModal>
  );
}
