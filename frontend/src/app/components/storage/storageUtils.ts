import {
  FileText,
  FileVideo,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type { StorageFolderTree } from "../../utils/api";

const API_ORIGIN = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1"
).replace(/\/$/, "");

/** 공유 코드로 만드는 공개 다운로드 링크 */
export function publicFileLink(shareCode: string): string {
  return `${API_ORIGIN}/public/storage/files/${shareCode}/download`;
}

/** 바이트를 사람이 읽는 단위로 포맷 */
export function formatBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** content_type 별 Lucide 아이콘 (이미지/영상은 카드에서 썸네일을 우선 사용) */
export function fileIconFor(contentType: string | null): LucideIcon {
  if (!contentType) return FileIcon;
  if (contentType.startsWith("video/")) return FileVideo;
  if (contentType.startsWith("audio/")) return FileAudio;
  if (contentType === "application/pdf") return FileText;
  if (
    contentType.includes("spreadsheet") ||
    contentType === "application/vnd.ms-excel" ||
    contentType === "text/csv"
  )
    return FileSpreadsheet;
  if (contentType.includes("zip") || contentType.includes("compressed"))
    return FileArchive;
  if (
    contentType.includes("presentation") ||
    contentType === "application/vnd.ms-powerpoint"
  )
    return Presentation;
  if (
    contentType.startsWith("text/") ||
    contentType.includes("word") ||
    contentType.includes("document") ||
    contentType.includes("hwp")
  )
    return FileText;
  return FileIcon;
}

/** 트리에서 folderId 까지의 경로(브레드크럼) 반환. 루트는 빈 배열. */
export function folderPath(
  folders: StorageFolderTree[],
  folderId: string | null,
): StorageFolderTree[] {
  if (!folderId) return [];
  const path: StorageFolderTree[] = [];
  const walk = (
    nodes: StorageFolderTree[],
    trail: StorageFolderTree[],
  ): boolean => {
    for (const node of nodes) {
      const next = [...trail, node];
      if (node.id === folderId) {
        path.push(...next);
        return true;
      }
      if (node.children.length && walk(node.children, next)) return true;
    }
    return false;
  };
  walk(folders, []);
  return path;
}

const SPREADSHEET_EXTENSIONS = new Set([
  "xlsx",
  "xlsm",
  "xls",
  "csv",
  "tsv",
  "ods",
]);

/** 확장자 (소문자, 점 없음). 없으면 빈 문자열 */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

/**
 * 표 뷰어로 열 수 있는 파일인지. hwp 처럼 브라우저가 타입을 모르는 파일은
 * content_type 이 octet-stream 으로 저장되므로 확장자를 우선 본다.
 */
export function isSpreadsheetFile(file: {
  original_filename: string;
  content_type: string | null;
}): boolean {
  if (SPREADSHEET_EXTENSIONS.has(fileExtension(file.original_filename)))
    return true;
  const type = file.content_type ?? "";
  return (
    type.includes("spreadsheet") ||
    type === "application/vnd.ms-excel" ||
    type === "text/csv" ||
    type === "text/tab-separated-values"
  );
}

/** 서버가 LibreOffice 로 PDF 변환해 주는 문서 확장자 (DocumentPreviewService 와 동일) */
const CONVERTIBLE_DOCUMENT_EXTENSIONS = new Set([
  "doc",
  "docx",
  "ppt",
  "pptx",
  "hwp",
  "hwpx",
  "odt",
  "odp",
  "rtf",
]);

export function isConvertibleDocument(file: {
  original_filename: string;
}): boolean {
  return CONVERTIBLE_DOCUMENT_EXTENSIONS.has(
    fileExtension(file.original_filename),
  );
}
