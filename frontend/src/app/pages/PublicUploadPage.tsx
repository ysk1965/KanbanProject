import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, Loader2, Check, ImagePlus, X, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { publicUploadAPI, type ChunkedUploadProgress } from '../utils/api';
import type { UploadAlbumInfo } from '../types';

export function PublicUploadPage() {
  const { uploadToken } = useParams<{ uploadToken: string }>();
  const [albumInfo, setAlbumInfo] = useState<UploadAlbumInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<ChunkedUploadProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!uploadToken) return;
    const load = async () => {
      try {
        setLoading(true);
        const info = await publicUploadAPI.getUploadAlbumInfo(uploadToken);
        setAlbumInfo(info);
      } catch {
        setError('This upload link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uploadToken]);

  const addFiles = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) => f.type.startsWith('image/'));
    setFiles((prev) => [...prev, ...imageFiles]);
    imageFiles.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviews((prev) => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(f);
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
    },
    [addFiles],
  );

  const handleUpload = useCallback(async () => {
    if (!uploadToken || files.length === 0 || uploading) return;
    try {
      setUploading(true);
      setUploadProgress(null);
      await publicUploadAPI.uploadPhotos(
        uploadToken,
        files,
        (progress) => setUploadProgress(progress),
      );
      setUploadCount(files.length);
      setUploaded(true);
      setUploadProgress(null);
      setFiles([]);
      setPreviews([]);
    } catch {
      setUploadProgress(null);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [uploadToken, files, uploading]);

  const handleUploadMore = useCallback(() => {
    setUploaded(false);
    setUploadCount(0);
  }, []);

  // Expiry info
  const expiresAt = albumInfo?.expires_at ? new Date(albumInfo.expires_at) : null;
  const now = new Date();
  const hoursLeft = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))) : 0;
  const daysLeft = Math.floor(hoursLeft / 24);

  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center" role="status" aria-label="로딩 중">
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (error || !albumInfo) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Link Expired</h1>
          <p className="text-sm text-slate-400">{error || 'This upload link is no longer valid.'}</p>
        </motion.div>
      </div>
    );
  }

  if (uploaded) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Upload Complete!</h1>
          <p className="text-sm text-slate-400 mb-6">
            {uploadCount} photo{uploadCount !== 1 ? 's' : ''} uploaded to <span className="text-foreground font-medium">{albumInfo.album_name}</span>
          </p>
          <button
            onClick={handleUploadMore}
            className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
          >
            Upload More
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Header */}
      <div className="border-b border-foreground/[0.08] bg-bridge-obsidian">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {albumInfo.organization_logo_url ? (
            <img
              src={albumInfo.organization_logo_url}
              alt={albumInfo.organization_name || '조직 로고'}
              className="w-8 h-8 rounded-lg object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
              <Upload size={16} className="text-bridge-accent" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">
              {albumInfo.album_name}
            </h1>
            <p className="text-xs text-slate-500">
              {albumInfo.organization_name}
            </p>
          </div>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary shrink-0">
            {daysLeft > 0 ? `${daysLeft}d left` : `${hoursLeft}h left`}
          </span>
        </div>
      </div>

      {/* Upload Area */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-bridge-accent bg-bridge-accent/5'
                : 'border-foreground/[0.12] hover:border-foreground/[0.2] hover:bg-foreground/[0.02]'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-bridge-accent/15 flex items-center justify-center mx-auto mb-4">
              <ImagePlus className="w-6 h-6 text-bridge-accent" />
            </div>
            <p className="text-sm font-bold text-foreground mb-1">
              Drop photos here or click to browse
            </p>
            <p className="text-xs text-slate-500">
              Supports JPG, PNG, GIF, WebP
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                addFiles(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
          />

          {/* Preview grid */}
          {files.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {files.length} photo{files.length !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={() => { setFiles([]); setPreviews([]); }}
                  className="text-xs text-slate-500 hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {previews.map((preview, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="relative aspect-square rounded-xl overflow-hidden group"
                  >
                    <img
                      src={preview}
                      alt="업로드 미리보기"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(i);
                      }}
                      className="absolute top-1 right-1 p-1 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Upload {files.length} Photo{files.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </div>

      {/* Upload Progress Modal */}
      {uploading && uploadProgress && uploadProgress.totalBatches > 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm mx-4 bg-bridge-obsidian rounded-2xl border border-foreground/10 shadow-2xl overflow-hidden"
          >
            <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
            <div className="px-5 pt-5 pb-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-bridge-accent/15 flex items-center justify-center shrink-0">
                  <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Uploading...</p>
                  <p className="text-xs text-slate-500">
                    {uploadProgress.uploadedFiles} / {uploadProgress.totalFiles} photos
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-foreground/[0.08] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-bridge-accent rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(uploadProgress.uploadedFiles / uploadProgress.totalFiles) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-xs text-slate-600 text-center">
                Batch {uploadProgress.currentBatch} / {uploadProgress.totalBatches}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
