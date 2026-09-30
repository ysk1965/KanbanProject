import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

interface SelectedPhotoGridProps {
  files: File[];
  onRemove: (index: number) => void;
  /** 미리보기로 그릴 최대 장수 — 나머지는 "+N장" 타일로 표시 */
  maxPreview?: number;
  className?: string;
}

/**
 * 업로드 대기 사진 미리보기.
 * 수천 장을 골라도 앞 maxPreview 장만 object URL 로 그리고, 목록이 바뀌면 URL 을 해제한다.
 */
export function SelectedPhotoGrid({
  files,
  onRemove,
  maxPreview = 48,
  className = "grid grid-cols-3 sm:grid-cols-4 gap-2",
}: SelectedPhotoGridProps) {
  const { t } = useTranslation();
  const shown = useMemo(() => files.slice(0, maxPreview), [files, maxPreview]);
  const urls = useMemo(() => shown.map((f) => URL.createObjectURL(f)), [shown]);

  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const hidden = files.length - shown.length;

  return (
    <div className={className}>
      {shown.map((file, i) => (
        <div
          key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
          className="relative aspect-square rounded-lg overflow-hidden border border-foreground/[0.08] group"
        >
          <img
            src={urls[i]}
            alt={file.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(i);
            }}
            aria-label={t("photoGallery.removeSelected", "Remove")}
            className="absolute top-0 right-0 w-11 h-11 flex items-start justify-end p-1"
          >
            <span className="p-0.5 rounded-full bg-black/60 hover:bg-black/80 transition-colors">
              <X size={12} className="text-white" />
            </span>
          </button>
        </div>
      ))}
      {hidden > 0 && (
        <div className="aspect-square rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] flex items-center justify-center text-center px-1">
          <span className="text-xs font-bold text-slate-400">
            {t("photoGallery.moreSelected", "+{{count}} more", { count: hidden })}
          </span>
        </div>
      )}
    </div>
  );
}
