-- 휴지통(is_deleted = true)에 있지만 deleted_at 이 비어 있는 레거시 노트 행을 채운다.
-- NoteTrashCleanupScheduler 는 deleted_at < cutoff 로만 만료를 판정하므로,
-- null 행은 30일 자동 삭제 대상에서 영구히 빠지고 UI 에도 삭제 시각이 "—" 로 표시된다.
-- 멱등: 이미 채워진 행은 조건에 걸리지 않는다.
UPDATE notes
SET deleted_at = COALESCE(updated_at, created_at)
WHERE is_deleted = TRUE
  AND deleted_at IS NULL;
