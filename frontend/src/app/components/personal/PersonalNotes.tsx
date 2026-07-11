import { NotesView } from '../notes/NotesView';

/**
 * 마이 스페이스 개인 노트 탭.
 * 보드/조직 노트와 동일한 NotesView를 personal 스코프로 렌더링한다.
 * 개인 노트는 항상 소유자 == 현재 사용자이므로 role은 'owner' 고정.
 */
export function PersonalNotes() {
  return (
    <div className="flex-1 min-h-0">
      <NotesView personal currentUserRole="owner" />
    </div>
  );
}
