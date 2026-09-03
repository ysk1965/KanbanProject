import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Film,
  FolderClock,
  Image as ImageIcon,
  Link2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import type { NoteTreeItem } from "../../utils/api";
import type { FileActions } from "../notes/NoteTreeSidebar";
import type { ReportArchiveGroup } from "./libraryTree";

/**
 * 보고서 아카이브 섹션 — 자동 생성된 보고서 자료(REPORT_ROOT)를 노트 트리에서
 * 분리해 하단 고정 섹션으로 그린다. 월 폴더는 펼치는 폴더가 아니라 구분 라벨이 되고,
 * 보고서 폴더는 들여쓰기 없는 플랫 행(펼치면 수집 파일)이 된다.
 */

/** 최근 월 그룹 몇 개까지 바로 보여줄지 — 나머지는 "더 보기" 뒤로 */
const VISIBLE_GROUPS = 3;

interface ReportArchiveSectionProps {
  groups: ReportArchiveGroup[];
  searchQuery: string;
  canEdit: boolean;
  fileActions: FileActions;
  selectedFileNodeId: string | null;
  onOpenFile: (nodeId: string) => void;
  /** 패널 높이를 함께 조절하는 부모(NotesView)가 열림 상태를 소유한다 */
  open: boolean;
  onToggleOpen: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function ReportArchiveSection({
  groups,
  searchQuery,
  canEdit,
  fileActions,
  selectedFileNodeId,
  onOpenFile,
  open,
  onToggleOpen,
}: ReportArchiveSectionProps) {
  const { t } = useTranslation();
  const [expandedReports, setExpandedReports] = useState<Set<string>>(
    new Set(),
  );
  const [showAll, setShowAll] = useState(false);

  // 검색 중엔 제목·파일명이 걸리는 항목만 남긴다 (트리 검색과 같은 동작)
  const filtered = useMemo(() => {
    if (!searchQuery) return groups;
    const q = searchQuery.toLowerCase();
    const matchFile = (file: NoteTreeItem) =>
      file.title.toLowerCase().includes(q);
    return groups
      .map((group) => ({
        ...group,
        reports: group.reports
          .map((report) =>
            report.title.toLowerCase().includes(q)
              ? report
              : { ...report, files: report.files.filter(matchFile) },
          )
          .filter(
            (report) =>
              report.title.toLowerCase().includes(q) || report.files.length > 0,
          ),
        files: group.files.filter(matchFile),
      }))
      .filter((group) => group.reports.length > 0 || group.files.length > 0);
  }, [groups, searchQuery]);

  const totalCount = useMemo(
    () =>
      groups.reduce(
        (sum, group) => sum + group.reports.length + group.files.length,
        0,
      ),
    [groups],
  );

  if (totalCount === 0 || (searchQuery && filtered.length === 0)) return null;

  const visibleGroups =
    showAll || searchQuery ? filtered : filtered.slice(0, VISIBLE_GROUPS);
  const hiddenCount = filtered
    .slice(visibleGroups.length)
    .reduce((sum, group) => sum + group.reports.length + group.files.length, 0);

  const toggleReport = (id: string) => {
    setExpandedReports((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderFileRow = (file: NoteTreeItem, indent: boolean) => {
    const meta = file.file;
    if (!meta) return null;
    const isSelected = selectedFileNodeId === file.id;
    return (
      <div
        key={file.id}
        onClick={() => onOpenFile(file.id)}
        className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-[14px] ${
          isSelected
            ? "bg-bridge-accent/15 text-foreground"
            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        }`}
        style={{ paddingLeft: indent ? 34 : 10 }}
      >
        {meta.is_image ? (
          <ImageIcon
            size={16}
            className="flex-shrink-0 text-bridge-secondary"
          />
        ) : meta.is_video ? (
          <Film size={16} className="flex-shrink-0 text-bridge-secondary" />
        ) : (
          <FileText size={16} className="flex-shrink-0 text-bridge-secondary" />
        )}
        <span className="flex-1 min-w-0 truncate">{file.title}</span>
        <span className="flex-shrink-0 text-xs text-slate-500 tabular-nums group-hover:hidden">
          {formatFileSize(meta.file_size)}
        </span>
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-0.5 hover:bg-foreground/10 rounded"
                aria-label={t("library.fileMenu", "파일 메뉴")}
              >
                <MoreHorizontal size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={4}
              className="bg-bridge-obsidian border-foreground/10 rounded-lg shadow-xl min-w-[160px]"
            >
              <DropdownMenuItem
                onClick={() => fileActions.onDownload(meta)}
                className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
              >
                <Download size={14} /> {t("library.download", "다운로드")}
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem
                  onClick={() => fileActions.onToggleShare(meta)}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                >
                  <Link2 size={14} />{" "}
                  {meta.is_shared
                    ? t("library.unshare", "공유 해제")
                    : t("library.share", "공유 링크")}
                </DropdownMenuItem>
              )}
              {canEdit && (
                <>
                  <DropdownMenuSeparator className="border-foreground/[0.08]" />
                  <DropdownMenuItem
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "library.confirmDeleteFile",
                            "이 파일을 휴지통으로 옮길까요?",
                          ),
                        )
                      ) {
                        fileActions.onDelete(meta);
                      }
                    }}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
                  >
                    <Trash2 size={14} /> {t("common.delete", "삭제")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* 섹션 헤더 — 패널 내부 스크롤 시에도 상단에 고정 */}
      <div className="sticky top-0 z-10 bg-bridge-dark pt-2 pb-0.5">
        <button
          onClick={onToggleOpen}
          className="flex items-center gap-2 w-full px-2.5 py-2 text-xs font-bold text-slate-400 hover:text-foreground transition-colors rounded-lg hover:bg-foreground/5"
        >
          {open ? (
            <ChevronDown size={13} className="flex-shrink-0" />
          ) : (
            <ChevronRight size={13} className="flex-shrink-0" />
          )}
          <FolderClock
            size={14}
            className="flex-shrink-0 text-bridge-secondary"
          />
          <span className="truncate">
            {t("library.reportArchive", "보고서 아카이브")}
          </span>
          <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary flex-shrink-0">
            {totalCount}
          </span>
        </button>
      </div>

      {open && (
        <>
          {visibleGroups.map((group) => (
            <div key={group.id}>
              {/* 월 라벨 — 폴더가 아니라 구분선 역할 */}
              <div className="px-2.5 pt-2.5 pb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                {group.label}
              </div>

              {group.reports.map((report) => {
                const expanded =
                  !!searchQuery || expandedReports.has(report.id);
                return (
                  <div key={report.id}>
                    <div
                      onClick={() => toggleReport(report.id)}
                      className="group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-[15px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    >
                      {expanded ? (
                        <ChevronDown size={15} className="flex-shrink-0" />
                      ) : (
                        <ChevronRight size={15} className="flex-shrink-0" />
                      )}
                      <FileText
                        size={16}
                        className="flex-shrink-0 text-bridge-secondary"
                      />
                      <span className="flex-1 min-w-0 truncate">
                        {report.title}
                      </span>
                      <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-slate-400">
                        {report.files.length}
                      </span>
                    </div>
                    {expanded &&
                      report.files.map((file) => renderFileRow(file, true))}
                  </div>
                );
              })}

              {/* 그룹 바로 아래 파일 (미분류 등) */}
              {group.files.map((file) => renderFileRow(file, false))}
            </div>
          ))}

          {!searchQuery && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full text-left px-2.5 py-2 text-xs text-slate-500 hover:text-foreground rounded-lg hover:bg-foreground/5 transition-colors"
            >
              {t(
                "library.reportArchiveMore",
                "지난 보고서 {{count}}건 더 보기",
                {
                  count: hiddenCount,
                },
              )}
            </button>
          )}
          {!searchQuery && showAll && filtered.length > VISIBLE_GROUPS && (
            <button
              onClick={() => setShowAll(false)}
              className="w-full text-left px-2.5 py-2 text-xs text-slate-500 hover:text-foreground rounded-lg hover:bg-foreground/5 transition-colors"
            >
              {t("library.reportArchiveLess", "접기")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
