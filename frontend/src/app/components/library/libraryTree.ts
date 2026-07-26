import type {
  NoteTreeItem,
  NoteUserInfo,
  StorageFileItem,
  StorageFolderTree,
} from "../../utils/api";

/**
 * 자료실 트리 어댑터.
 *
 * 노트 트리(note API)와 스토리지 폴더·파일(storage API)은 서버에서 별개지만
 * id · parent_id · position · depth · children 구조가 같다. 여기서 두 트리를
 * 하나로 합쳐 NoteTreeSidebar가 그대로 그릴 수 있는 형태로 만든다.
 *
 * 병합 규칙
 * - 같은 계층에서 이름이 같은 폴더는 하나로 본다 (trim + 대소문자 무시).
 * - 단, 보고서가 자동으로 만든 시스템 폴더(system_key)는 이름이 같아도 합치지 않는다 —
 *   사용자가 만든 "보고서 자료" 노트 폴더가 시스템 폴더를 삼켜버리면 안 된다.
 * - 짝이 없는 스토리지 폴더는 합성 폴더 노드로 남겨 파일에 접근할 수 있게 한다.
 * - 파일은 대응되는 폴더의 자식으로 붙는다. 폴더 없는 파일은 루트에 붙는다.
 *
 * 서버는 그대로 두고 화면에서만 합치므로 되돌리기 쉽다.
 */

export const FILE_NODE_PREFIX = "file:";
export const STORAGE_FOLDER_NODE_PREFIX = "sfolder:";

/** 보고서 자료 루트 폴더의 system_key (백엔드 ReportFileFiler와 맞춘 값) */
export const REPORT_ROOT_KEY = "REPORT_ROOT";
const REPORT_MONTH_PREFIX = "REPORT_MONTH:";

export function isReportFolderNode(item: NoteTreeItem): boolean {
  return !!item.system_key;
}

export function isFileNodeId(nodeId: string): boolean {
  return nodeId.startsWith(FILE_NODE_PREFIX);
}

export function fileIdFromNodeId(nodeId: string): string {
  return nodeId.slice(FILE_NODE_PREFIX.length);
}

export function isStorageFolderNodeId(nodeId: string): boolean {
  return nodeId.startsWith(STORAGE_FOLDER_NODE_PREFIX);
}

export function storageFolderIdFromNodeId(nodeId: string): string {
  return nodeId.slice(STORAGE_FOLDER_NODE_PREFIX.length);
}

export interface LibraryTree {
  /** NoteTreeSidebar에 그대로 넘기는 병합 트리 */
  tree: NoteTreeItem[];
  /** 트리 폴더 노드 id → 업로드 대상 스토리지 폴더 id (짝이 없으면 없음) */
  storageFolderByNode: Map<string, string>;
  /** 파일 노드 id → 원본 파일 */
  fileByNodeId: Map<string, StorageFileItem>;
}

const SYSTEM_USER: NoteUserInfo = {
  id: "storage",
  name: "",
  profile_image: null,
};

const normalize = (name: string) => name.trim().toLowerCase();

/**
 * 보고서 폴더는 최신이 위에 오는 게 자연스럽다.
 * - 보고서 자료 아래: 월 폴더를 최신순(2026-07 → 2026-06), "미분류"는 맨 끝.
 * - 월 폴더 아래: 나중에 만들어진 보고서(= position이 큰 쪽)가 위로.
 * 그 밖의 폴더는 서버 순서를 그대로 둔다.
 */
function orderReportChildren(folder: StorageFolderTree): StorageFolderTree[] {
  if (folder.system_key === REPORT_ROOT_KEY) {
    return [...folder.children].sort((a, b) => {
      const aMonth = a.system_key?.startsWith(REPORT_MONTH_PREFIX) ?? false;
      const bMonth = b.system_key?.startsWith(REPORT_MONTH_PREFIX) ?? false;
      if (aMonth !== bMonth) return aMonth ? -1 : 1; // 미분류는 뒤로
      return b.name.localeCompare(a.name);
    });
  }
  if (folder.system_key?.startsWith(REPORT_MONTH_PREFIX)) {
    return [...folder.children].sort((a, b) => b.position - a.position);
  }
  return folder.children;
}

function toFileNode(
  file: StorageFileItem,
  parentNodeId: string | null,
  depth: number,
): NoteTreeItem {
  return {
    id: FILE_NODE_PREFIX + file.id,
    parent_id: parentNodeId,
    type: "FILE",
    title: file.original_filename,
    position: 0,
    depth,
    tags: [],
    created_by: SYSTEM_USER,
    updated_by: SYSTEM_USER,
    created_at: file.created_at,
    updated_at: file.created_at,
    children: [],
    file,
  };
}

export function buildLibraryTree(
  noteTree: NoteTreeItem[],
  storageFolders: StorageFolderTree[],
  filesByFolder: Map<string | null, StorageFileItem[]>,
): LibraryTree {
  const storageFolderByNode = new Map<string, string>();
  const fileByNodeId = new Map<string, StorageFileItem>();

  const filesOf = (
    storageFolderId: string | null,
    parentNodeId: string | null,
    depth: number,
  ): NoteTreeItem[] =>
    (filesByFolder.get(storageFolderId) ?? []).map((file) => {
      const node = toFileNode(file, parentNodeId, depth);
      fileByNodeId.set(node.id, file);
      return node;
    });

  /** 스토리지 전용 폴더를 합성 폴더 노드로 변환 (하위 폴더·파일까지) */
  const toStorageFolderNode = (
    folder: StorageFolderTree,
    parentNodeId: string | null,
    depth: number,
  ): NoteTreeItem => {
    const nodeId = STORAGE_FOLDER_NODE_PREFIX + folder.id;
    storageFolderByNode.set(nodeId, folder.id);
    return {
      id: nodeId,
      parent_id: parentNodeId,
      type: "FOLDER",
      title: folder.name,
      position: folder.position,
      depth,
      tags: [],
      created_by: SYSTEM_USER,
      updated_by: SYSTEM_USER,
      created_at: "",
      updated_at: "",
      children: [
        ...orderReportChildren(folder).map((child) =>
          toStorageFolderNode(child, nodeId, depth + 1),
        ),
        ...filesOf(folder.id, nodeId, depth + 1),
      ],
      system_key: folder.system_key,
    };
  };

  const mergeLevel = (
    notes: NoteTreeItem[],
    folders: StorageFolderTree[],
    parentNodeId: string | null,
    depth: number,
  ): NoteTreeItem[] => {
    // 같은 이름이 여럿이면 앞에서부터 하나씩 짝지어 나간다.
    // 시스템 폴더(보고서 자료…)는 짝짓기 대상에서 빼 항상 독립 노드로 남긴다.
    const queueByName = new Map<string, StorageFolderTree[]>();
    folders.forEach((folder) => {
      if (folder.system_key) return;
      const key = normalize(folder.name);
      const queue = queueByName.get(key);
      if (queue) queue.push(folder);
      else queueByName.set(key, [folder]);
    });
    const consumed = new Set<string>();

    const merged = notes.map((note) => {
      if (note.type !== "FOLDER") {
        return {
          ...note,
          children: mergeLevel(note.children ?? [], [], note.id, depth + 1),
        };
      }

      const pair = queueByName.get(normalize(note.title))?.shift();
      if (pair) {
        consumed.add(pair.id);
        storageFolderByNode.set(note.id, pair.id);
      }

      return {
        ...note,
        children: [
          ...mergeLevel(
            note.children ?? [],
            pair?.children ?? [],
            note.id,
            depth + 1,
          ),
          ...(pair ? filesOf(pair.id, note.id, depth + 1) : []),
        ],
      };
    });

    const leftovers = folders
      .filter((folder) => !consumed.has(folder.id))
      // 자동 생성된 "보고서 자료"는 사용자가 만든 폴더 뒤로 보낸다.
      .sort((a, b) => Number(!!a.system_key) - Number(!!b.system_key))
      .map((folder) => toStorageFolderNode(folder, parentNodeId, depth));

    return [...merged, ...leftovers];
  };

  const tree = [
    ...mergeLevel(noteTree, storageFolders, null, 0),
    ...filesOf(null, null, 0),
  ];

  return { tree, storageFolderByNode, fileByNodeId };
}

function indexTree(tree: NoteTreeItem[]) {
  const parentOf = new Map<string, string | null>();
  const nodeById = new Map<string, NoteTreeItem>();
  const walk = (items: NoteTreeItem[], parent: string | null) => {
    items.forEach((item) => {
      parentOf.set(item.id, parent);
      nodeById.set(item.id, item);
      if (item.children?.length) walk(item.children, item.id);
    });
  };
  walk(tree, null);
  return { parentOf, nodeById };
}

/**
 * 선택한 노드가 속한 폴더 노드. 폴더가 아니면 부모로 거슬러 올라가고,
 * 루트면 null. 업로드 목적지와 새 폴더 생성 위치를 정할 때 쓴다.
 */
export function folderNodeOf(
  tree: NoteTreeItem[],
  selectedNodeId: string | null,
): NoteTreeItem | null {
  if (!selectedNodeId) return null;
  const { parentOf, nodeById } = indexTree(tree);

  let cursor: string | null = selectedNodeId;
  while (cursor) {
    const node = nodeById.get(cursor);
    if (node?.type === "FOLDER") return node;
    cursor = parentOf.get(cursor) ?? null;
  }
  return null;
}

/** 루트에서 해당 폴더까지의 이름 경로. 스토리지에 같은 계층을 만들 때 쓴다. */
export function folderTitlePath(
  tree: NoteTreeItem[],
  folderNodeId: string,
): string[] {
  const { parentOf, nodeById } = indexTree(tree);
  const path: string[] = [];
  let cursor: string | null = folderNodeId;
  while (cursor) {
    const node = nodeById.get(cursor);
    if (node?.type === "FOLDER") path.unshift(node.title);
    cursor = parentOf.get(cursor) ?? null;
  }
  return path;
}

function flattenStorage(folders: StorageFolderTree[]): StorageFolderTree[] {
  return folders.flatMap((folder) => [
    folder,
    ...flattenStorage(folder.children),
  ]);
}

/** 스토리지 트리에서 특정 부모 아래 같은 이름의 폴더를 찾는다. */
export function findStorageChild(
  folders: StorageFolderTree[],
  parentId: string | null,
  name: string,
): StorageFolderTree | null {
  const siblings = parentId
    ? (flattenStorage(folders).find((f) => f.id === parentId)?.children ?? [])
    : folders;
  return (
    siblings.find((folder) => normalize(folder.name) === normalize(name)) ??
    null
  );
}
