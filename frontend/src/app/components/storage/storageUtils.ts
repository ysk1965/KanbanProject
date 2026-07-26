import {
  FileText,
  FileVideo,
  File as FileIcon,
  FileArchive,
  FileAudio,
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
  if (contentType.includes("zip") || contentType.includes("compressed"))
    return FileArchive;
  if (
    contentType.startsWith("text/") ||
    contentType.includes("word") ||
    contentType.includes("document")
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
