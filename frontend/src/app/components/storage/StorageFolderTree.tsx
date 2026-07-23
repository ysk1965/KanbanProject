import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, HardDrive } from "lucide-react";
import type { StorageFolderTree as FolderNode } from "../../utils/api";

interface StorageFolderTreeProps {
  folders: FolderNode[];
  currentFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  /** 파일 카드를 폴더로 드롭했을 때 (fileId, targetFolderId) — targetFolderId=null 은 루트 */
  onDropFile: (fileId: string, targetFolderId: string | null) => void;
}

/**
 * 스토리지 폴더 트리 사이드바. HTML5 네이티브 드래그로 파일을 폴더에 드롭해 이동한다.
 */
export function StorageFolderTree({
  folders,
  currentFolderId,
  onSelect,
  onDropFile,
}: StorageFolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | "root" | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDrop = (e: React.DragEvent, targetId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const fileId = e.dataTransfer.getData("text/storage-file-id");
    if (fileId) onDropFile(fileId, targetId);
  };

  const renderNode = (node: FolderNode, depth: number) => {
    const isOpen = expanded.has(node.id);
    const isSelected = currentFolderId === node.id;
    const hasChildren = node.children.length > 0;
    const isDragTarget = dragOver === node.id;

    return (
      <div key={node.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelect(node.id)}
          onKeyDown={(e) => e.key === "Enter" && onSelect(node.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(node.id);
          }}
          onDragLeave={() => setDragOver((v) => (v === node.id ? null : v))}
          onDrop={(e) => handleDrop(e, node.id)}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`group flex items-center gap-1.5 pr-2 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
            isSelected
              ? "bg-bridge-accent/15 text-bridge-accent"
              : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
          } ${isDragTarget ? "ring-2 ring-bridge-accent/60" : ""}`}
        >
          <button
            type="button"
            aria-label={isOpen ? "접기" : "펼치기"}
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
            className={`p-0.5 rounded transition-transform ${hasChildren ? "" : "invisible"} ${
              isOpen ? "rotate-90" : ""
            }`}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {isSelected || isOpen ? (
            <FolderOpen className="w-4 h-4 flex-none" />
          ) : (
            <Folder className="w-4 h-4 flex-none" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {isOpen && hasChildren && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(null)}
        onKeyDown={(e) => e.key === "Enter" && onSelect(null)}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver("root");
        }}
        onDragLeave={() => setDragOver((v) => (v === "root" ? null : v))}
        onDrop={(e) => handleDrop(e, null)}
        className={`flex items-center gap-1.5 px-2 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium ${
          currentFolderId === null
            ? "bg-bridge-accent/15 text-bridge-accent"
            : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
        } ${dragOver === "root" ? "ring-2 ring-bridge-accent/60" : ""}`}
      >
        <HardDrive className="w-4 h-4 flex-none" />
        <span className="truncate">전체 파일</span>
      </div>
      {folders.map((node) => renderNode(node, 0))}
    </nav>
  );
}
