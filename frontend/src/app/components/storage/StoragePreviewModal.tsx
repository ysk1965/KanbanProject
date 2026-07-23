import { Download, Link2, X } from "lucide-react";
import { MotionModal } from "../ui/MotionModal";
import type { StorageFileItem } from "../../utils/api";
import { formatBytes, fileIconFor } from "./storageUtils";

interface StoragePreviewModalProps {
  file: StorageFileItem | null;
  onClose: () => void;
  onDownload: (file: StorageFileItem) => void;
  onToggleShare: (file: StorageFileItem) => void;
}

/** 파일 미리보기: 이미지 라이트박스 / 영상 인라인 재생 / 그 외 아이콘 + 다운로드 */
export function StoragePreviewModal({
  file,
  onClose,
  onDownload,
  onToggleShare,
}: StoragePreviewModalProps) {
  if (!file) return null;
  const Icon = fileIconFor(file.content_type);

  return (
    <MotionModal
      open={!!file}
      onClose={onClose}
      accentColor
      aria-label={`${file.original_filename} 미리보기`}
      className="w-full sm:max-w-3xl bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <p
          className="text-sm font-bold text-foreground truncate"
          title={file.original_filename}
        >
          {file.original_filename}
        </p>
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1.5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 pb-5 pt-4">
        <div className="w-full max-h-[60vh] rounded-xl overflow-hidden bg-foreground/[0.04] flex items-center justify-center">
          {file.is_image ? (
            <img
              src={file.url}
              alt={file.original_filename}
              className="max-h-[60vh] w-auto object-contain"
            />
          ) : file.is_video ? (
            <video src={file.url} controls className="max-h-[60vh] w-full" />
          ) : file.content_type === "application/pdf" ? (
            <iframe
              src={file.url}
              title={file.original_filename}
              className="w-full h-[60vh]"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
              <Icon className="w-16 h-16" />
              <span className="text-xs">{formatBytes(file.file_size)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-500">
          {formatBytes(file.file_size)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleShare(file)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              file.is_shared
                ? "bg-bridge-accent/15 text-bridge-accent"
                : "bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10"
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            {file.is_shared ? "공유 중" : "공유"}
          </button>
          <button
            type="button"
            onClick={() => onDownload(file)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            다운로드
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
