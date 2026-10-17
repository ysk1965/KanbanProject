-- 체크리스트 항목 댓글: comments에 소속 항목을 한 칸 적는다.
--
-- 별도 댓글 테이블을 만들지 않는 이유 —
--   태스크 모달의 댓글 목록에 항목 댓글이 "그대로 섞여" 보여야 한다. 저장소를 나누면
--   정렬·실시간·알림·JIRA 동기화마다 두 목록을 합치는 코드가 반복된다.
--
-- FK 제약을 걸지 않는 이유 —
--   checklist_items는 soft delete(휴지통)를 쓴다. FK를 걸면 영구삭제 시 댓글까지 끌려가거나
--   삭제를 막는다. 항목이 사라지면 이 컬럼만 NULL로 떨어뜨리고 댓글은 태스크 댓글로 남긴다.

DO $$ BEGIN
    ALTER TABLE comments ADD COLUMN checklist_item_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_comment_checklist_item
    ON comments(checklist_item_id);

-- 태스크를 열 때 항목별 댓글 수를 한 번의 group by로 세기 위한 복합 인덱스
CREATE INDEX IF NOT EXISTS idx_comment_task_checklist
    ON comments(task_id, checklist_item_id);
