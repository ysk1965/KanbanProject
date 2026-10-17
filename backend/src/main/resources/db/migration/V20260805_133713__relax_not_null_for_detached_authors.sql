-- 작성자/생성자 참조를 비울 수 있게 한다. 엔티티가 이미 null을 허용하는 열만 맞춘다.
--
-- V9가 같은 일을 하지만 baseline(V86) 아래라 dev/prod에서는 한 번도 실행된 적이 없다.
-- 그래서 엔티티는 null을 허용하는데(계정을 지울 때 참조만 끊는 설계) 실제 스키마는 거부하는
-- 상태가 남았고, 자동수정 결과 댓글이 그 틈에서 터졌다 — author_id 없는 INSERT가 커밋 시점에
-- 실패하면서 같은 트랜잭션에 있던 작업 결과 확정까지 롤백됐다.
--
-- V9에 있던 tasks.created_by는 일부러 뺐다. Task 엔티티는 아직 nullable=false로 선언되어 있어
-- 스키마만 풀면 코드와 어긋난다 — 그쪽을 비우려면 엔티티부터 바꿔야 한다.
--
-- 멱등: DROP NOT NULL은 이미 nullable인 열에 다시 걸어도 오류가 아니다.

ALTER TABLE comments ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE features ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE milestones ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE invite_links ALTER COLUMN created_by DROP NOT NULL;
