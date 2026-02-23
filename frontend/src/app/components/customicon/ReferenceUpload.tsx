import { useState, useCallback } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { resolveFileUrl } from '../../utils/api';

interface ReferenceUploadProps {
  referenceId: string | null;
  referenceUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
}

export function ReferenceUpload({ referenceId, referenceUrl, onUpload, isUploading }: ReferenceUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onUpload(file);
    }
  }, [onUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    e.target.value = '';
  }, [onUpload]);

  return (
    <div className="space-y-3">
      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        Reference Icon
      </label>

      {referenceUrl ? (
        <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
          <img
            src={resolveFileUrl(referenceUrl)}
            alt="Reference"
            className="w-16 h-16 object-contain rounded-lg bg-white/10 p-1"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">Reference uploaded</p>
            <p className="text-xs text-slate-500 mt-0.5">ID: {referenceId?.slice(0, 8)}...</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`
            relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed
            transition-all cursor-pointer
            ${isDragging
              ? 'border-bridge-accent bg-bridge-accent/10'
              : 'border-white/10 hover:border-white/20 hover:bg-white/5'}
          `}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="absolute inset-0 opacity-0 cursor-pointer"
            disabled={isUploading}
          />
          {isUploading ? (
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                <Upload className="w-5 h-5 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-sm text-white">Drop an icon image or click to upload</p>
                <p className="text-xs text-slate-500 mt-1">PNG, SVG, JPG (max 5MB)</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
