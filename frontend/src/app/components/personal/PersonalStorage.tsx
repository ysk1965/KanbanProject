import { StorageView } from "../storage/StorageView";

/** 마이스페이스 '스토리지' 탭 래퍼. (노트의 PersonalNotes → NotesView 구조 미러) */
export function PersonalStorage() {
  return (
    <div className="flex-1 min-h-0">
      <StorageView personal />
    </div>
  );
}
