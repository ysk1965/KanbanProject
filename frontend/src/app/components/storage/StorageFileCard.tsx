import { Download, Link2, Trash2, Play } from "lucide-react";
import type { StorageFileItem } from "../../utils/api";
import { formatBytes, fileIconFor } from "./storageUtils";

interface StorageFileCardProps {
  file: StorageFileItem;
  onPreview: (file: StorageFileItem) => void;
  onDownload: (file: StorageFileItem) => void;
  onToggleShare: (file: StorageFileItem) => void;
  onDelete: (file: StorageFileItem) => void;
}

/** 스토리지 파일 타일 (썸네일 그리드용). HTML5 draggable 로 폴더 트리에 드롭 이동 지원. */
export function StorageFileCard({
  file,
  onPreview,
  onDownload,
  onToggleShare,
  onDelete,
}: StorageFileCardProps) {
  const Icon = fileIconFor(file.content_type);
  const hasThumb = (file.is_image || file.is_video) && file.thumbnail_url;

  return (
    <div
      draggable
      onDragStart={(e) =>
        e.dataTransfer.setData("text/storage-file-id", file.id)
      }
      className="group relative flex flex-col rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] bg-bridge-obsidian overflow-hidden transition-colors"
    >
      <button
        type="button"
        onClick={() => onPreview(file)}
        className="relative aspect-square w-full bg-foreground/[0.04] flex items-center justify-center overflow-hidden"
        aria-label={`${file.original_filename} 미리보기`}
      >
        {hasThumb ? (
          <img
            src={file.thumbnail_url as string}
            alt={file.original_filename}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <Icon className="w-10 h-10 text-slate-500" />
        )}
        {file.is_video && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-9 h-9 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="w-4 h-4 text-white fill-white" />
            </span>
          </span>
        )}
        {file.is_shared && (
          <span className="absolute top-1.5 left-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
            공유
          </span>
        )}
      </button>

      <div className="px-2.5 py-2 border-t border-foreground/[0.06]">
        <p
          className="text-xs font-medium text-foreground truncate"
          title={file.original_filename}
        >
          {file.original_filename}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {formatBytes(file.file_size)}
        </p>
      </div>

      {/* Hover actions */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label="다운로드"
          onClick={() => onDownload(file)}
          className="w-7 h-7 rounded-lg bg-black/50 text-white hover:bg-black/70 flex items-center justify-center"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label={file.is_shared ? "공유 해제" : "공유 링크 생성"}
          onClick={() => onToggleShare(file)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            file.is_shared
              ? "bg-bridge-accent text-white"
              : "bg-black/50 text-white hover:bg-black/70"
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="삭제"
          onClick={() => onDelete(file)}
          className="w-7 h-7 rounded-lg bg-black/50 text-white hover:bg-rose-500 flex items-center justify-center"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
