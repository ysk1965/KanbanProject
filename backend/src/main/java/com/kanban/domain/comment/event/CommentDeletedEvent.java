package com.kanban.domain.comment.event;

/**
 * 사용자가 삭제한 댓글이 커밋된 뒤 발행되는 도메인 이벤트.
 *
 * <p>수신 시점엔 댓글 행이 이미 없다. 그래서 JIRA 코멘트 역참조는 FK 없는
 * {@code JiraCommentLink}(comment_id 보존)로 하며, 전파를 마친 뒤 그 링크 행을 지운다.
 *
 * <p>{@link CommentCreatedEvent}와 마찬가지로 시스템 경로(JIRA 인바운드 삭제)에서는 발행하지 않는다.
 */
public record CommentDeletedEvent(
    String boardId,
    String taskId,
    String commentId
) {}
