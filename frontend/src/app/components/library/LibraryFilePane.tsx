import { Download, Link2, Menu, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

import type { StorageFileItem } from "../../utils/api";
import { formatBytes, fileIconFor } from "../storage/storageUtils";
import { formatDateTime } from "../../utils/dateUtils";
import { IconButton } from "../ui/IconButton";

interface LibraryFilePaneProps {
  file: StorageFileItem;
  canEdit: boolean;
  onDownload: (file: StorageFileItem) => void;
  onToggleShare: (file: StorageFileItem) => void;
  onDelete: (file: StorageFileItem) => void;
  onOpenSidebar: () => void;
}

/**
 * 자료실에서 트리의 파일 노드를 골랐을 때 오른쪽에 열리는 화면.
 * 노트를 고르면 NoteEditor가, 파일을 고르면 이 패널이 같은 자리에 열린다.
 */
export function LibraryFilePane({
  file,
  canEdit,
  onDownload,
  onToggleShare,
  onDelete,
  onOpenSidebar,
}: LibraryFilePaneProps) {
  const Icon = fileIconFor(file.content_type);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 모바일: 사이드바 열기 + 파일명 */}
      <div className="flex md:hidden items-center gap-2 px-3 py-2 border-b border-foreground/5">
        <IconButton onClick={onOpenSidebar} aria-label="사이드바 열기">
          <Menu />
        </IconButton>
        <span className="text-sm text-foreground font-medium truncate">
          {file.original_filename}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto flex flex-col gap-4"
        >
          {/* 헤더 */}
          <div className="flex items-start gap-3 flex-wrap">
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                파일
              </span>
              <h1
                className="text-sm md:text-lg font-bold text-foreground tracking-tight truncate"
                title={file.original_filename}
              >
                {file.original_filename}
              </h1>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onToggleShare(file)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                    file.is_shared
                      ? "bg-bridge-accent/15 text-bridge-accent"
                      : "bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10"
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {file.is_shared ? "공유 중" : "공유 링크"}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDownload(file)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                다운로드
              </button>
              {canEdit && (
                <IconButton
                  aria-label="파일 삭제"
                  onClick={() => {
                    if (window.confirm("이 파일을 휴지통으로 옮길까요?")) {
                      onDelete(file);
                    }
                  }}
                >
                  <Trash2 />
                </IconButton>
              )}
            </div>
          </div>

          {/* 미리보기 */}
          <div className="rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian overflow-hidden flex items-center justify-center min-h-[240px]">
            {file.is_image ? (
              <img
                src={file.url}
                alt={file.original_filename}
                className="max-h-[56vh] w-auto object-contain"
              />
            ) : file.is_video ? (
              <video src={file.url} controls className="max-h-[56vh] w-full" />
            ) : file.content_type === "application/pdf" ? (
              <iframe
                src={file.url}
                title={file.original_filename}
                className="w-full h-[56vh]"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
                <Icon className="w-14 h-14" />
                <span className="text-xs">
                  미리보기를 지원하지 않는 형식입니다
                </span>
              </div>
            )}
          </div>

          {/* 파일 정보 */}
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Meta label="크기" value={formatBytes(file.file_size)} />
            <Meta label="형식" value={file.content_type || "알 수 없음"} />
            <Meta
              label="올린 날짜"
              value={file.created_at ? formatDateTime(file.created_at) : "—"}
            />
            <Meta
              label="공유"
              value={file.is_shared ? "공개 링크 있음" : "비공개"}
            />
          </dl>
        </motion.div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {label}
      </dt>
      <dd className="text-xs text-foreground mt-1 truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}
