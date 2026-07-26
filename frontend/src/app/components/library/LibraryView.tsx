import { NotesView } from "../notes/NotesView";

interface LibraryViewProps {
  boardId?: string;
  orgId?: string;
  personal?: boolean;
  currentUserRole: string;
}

/**
 * 자료실 탭 — 노트와 스토리지를 한 화면에서 다룬다.
 *
 * 트리 하나에 폴더·노트·파일이 함께 놓이고, 고른 대상에 따라 오른쪽이
 * 에디터(노트) 또는 미리보기(파일)로 바뀐다. 노트 엔진은 NotesView를 그대로
 * 쓰고, 스토리지 레이어만 withFiles로 켠다.
 */
export function LibraryView({
  boardId,
  orgId,
  personal,
  currentUserRole,
}: LibraryViewProps) {
  return (
    <NotesView
      boardId={boardId}
      orgId={orgId}
      personal={personal}
      currentUserRole={currentUserRole}
      withFiles
    />
  );
}
