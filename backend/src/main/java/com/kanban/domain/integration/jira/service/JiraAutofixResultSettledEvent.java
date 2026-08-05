package com.kanban.domain.integration.jira.service;

import com.kanban.domain.integration.jira.AutofixJobStatus;

/**
 * 러너 회신이 반영되어 작업 결과가 확정됐다. 통지(JIRA 댓글·카드 댓글·슬랙)를 결과 확정
 * 트랜잭션에서 떼어내기 위한 신호다.
 *
 * <p>엔티티가 아니라 식별자와 값만 싣는다 — 받는 쪽은 커밋 이후에 돌고, 그때 앞 트랜잭션의
 * 엔티티는 준영속이라 지연 로딩이 터진다.
 *
 * @param result    확정된 결과. 작업을 다시 읽어도 알 수 있지만, 통지 문구가 무엇을 근거로
 *                  갈리는지는 신호에 드러나 있는 편이 낫다.
 * @param corrected 회수된 뒤 늦게 도착한 회신으로 결과가 뒤집힌 경우
 */
public record JiraAutofixResultSettledEvent(
        String boardId,
        String jobId,
        AutofixJobStatus result,
        boolean corrected
) { }
