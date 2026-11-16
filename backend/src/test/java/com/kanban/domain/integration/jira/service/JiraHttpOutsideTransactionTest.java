package com.kanban.domain.integration.jira.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockRepository;
import com.kanban.domain.block.FixedBlockType;
import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.service.BoardPermissionService;
import com.kanban.domain.integration.jira.*;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * JIRA HTTP 호출이 트랜잭션(=DB 커넥션 점유) 밖에서 일어나는지 검증한다.
 *
 * <p>2026-11-16 dev 장애: 2분 폴링이 트랜잭션 안에서 JIRA 를 호출하는 동안 커넥션을 쥐고 있어
 * 풀(5개)이 고갈되고 다른 요청이 20초 대기 후 500 으로 끝났다. 누가 다시 HTTP 를 트랜잭션 안으로
 * 옮기면 이 테스트가 깨진다.
 */
class JiraHttpOutsideTransactionTest {

    /** execute 중인지 기록하는 TransactionTemplate — 실제 트랜잭션 없이 경계만 흉내 낸다. */
    static class RecordingTx extends TransactionTemplate {
        boolean active;
        int count;

        @Override
        public <T> T execute(TransactionCallback<T> action) {
            active = true;
            count++;
            try {
                return action.doInTransaction(null);
            } finally {
                active = false;
            }
        }
    }

    @Nested
    @ExtendWith(MockitoExtension.class)
    class WriteBack {

        @Mock
        JiraIntegrationConfigRepository configRepository;

        @Mock
        JiraIssueLinkRepository issueLinkRepository;

        @Mock
        JiraMilestoneScopeRepository scopeRepository;

        @Mock
        BlockRepository blockRepository;

        @Mock
        JiraApiClient jiraApiClient;

        @Mock
        JiraOAuthService oauthService;

        @Mock
        ObjectMapper objectMapper;

        @Mock
        EntityManager entityManager;

        @Spy
        RecordingTx tx = new RecordingTx();

        @InjectMocks
        JiraWriteBackService service;

        @Test
        @SuppressWarnings("unchecked")
        void 완료_역동기화는_트랜잭션_밖에서_전환하고_결과는_따로_기록한다() {
            Board board = mock(Board.class);
            when(board.getId()).thenReturn("board-1");
            JiraIntegrationConfig config = mock(JiraIntegrationConfig.class);
            when(config.getActive()).thenReturn(true);
            when(config.getWriteBackEnabled()).thenReturn(true);
            when(config.getBoard()).thenReturn(board);
            when(config.getWriteBackTargetStatusId()).thenReturn("31");
            when(configRepository.findById("cfg-1")).thenReturn(Optional.of(config));

            JiraIssueLink link = mock(JiraIssueLink.class);
            when(link.getId()).thenReturn("link-1");
            when(link.getTargetId()).thenReturn("task-1");
            when(link.getJiraIssueKey()).thenReturn("QA-1");
            when(issueLinkRepository.findWriteBackCandidates("board-1", JiraLinkTargetType.TASK))
                    .thenReturn(List.of(link));
            TypedQuery<String> query = mock(TypedQuery.class);
            when(entityManager.createQuery(anyString(), eq(String.class))).thenReturn(query);
            when(query.setParameter(anyString(), any())).thenReturn(query);
            when(query.getResultList()).thenReturn(List.of("task-1"));
            when(oauthService.resolveToken(config)).thenReturn("token");

            List<Boolean> txDuringHttp = new ArrayList<>();
            when(jiraApiClient.getTransitions(any(), eq("QA-1"))).thenAnswer(inv -> {
                txDuringHttp.add(tx.active);
                return new ObjectMapper().readTree("{\"transitions\":[{\"id\":\"7\",\"to\":{\"id\":\"31\"}}]}");
            });
            doAnswer(inv -> {
                        txDuringHttp.add(tx.active);
                        return null;
                    })
                    .when(jiraApiClient)
                    .transitionIssue(any(), eq("QA-1"), eq("7"));
            when(issueLinkRepository.findAllById(List.of("link-1"))).thenAnswer(inv -> {
                assertThat(tx.active).isTrue();
                return List.of(link);
            });

            int done = service.syncBoard("cfg-1");

            assertThat(done).isEqualTo(1);
            assertThat(txDuringHttp).containsExactly(false, false);
            verify(link).markWriteBackDone();
            verify(config, never()).markError(anyString());
        }

        @Test
        void 보낼_게_없으면_토큰도_JIRA도_건드리지_않는다() {
            Board board = mock(Board.class);
            when(board.getId()).thenReturn("board-1");
            JiraIntegrationConfig config = mock(JiraIntegrationConfig.class);
            when(config.getActive()).thenReturn(true);
            when(config.getWriteBackEnabled()).thenReturn(true);
            when(config.getBoard()).thenReturn(board);
            when(config.getWriteBackTargetStatusId()).thenReturn("31");
            when(configRepository.findById("cfg-1")).thenReturn(Optional.of(config));
            when(issueLinkRepository.findWriteBackCandidates("board-1", JiraLinkTargetType.TASK))
                    .thenReturn(List.of());

            assertThat(service.syncBoard("cfg-1")).isZero();
            verifyNoInteractions(oauthService, jiraApiClient);
        }
    }

    @Nested
    @ExtendWith(MockitoExtension.class)
    class Pull {

        @Mock
        JiraApiClient jiraApiClient;

        @Mock
        JiraOAuthService oauthService;

        @Mock
        JiraIntegrationConfigRepository configRepository;

        @Mock
        JiraIssueLinkRepository issueLinkRepository;

        @Mock
        BoardPermissionService boardPermissionService;

        @Mock
        BoardMemberRepository boardMemberRepository;

        @Mock
        BoardRepository boardRepository;

        @Mock
        UserRepository userRepository;

        @Mock
        BlockRepository blockRepository;

        @Spy
        RecordingTx tx = new RecordingTx();

        @InjectMocks
        JiraImportService service;

        @Test
        void 증분_pull_은_JIRA_검색을_트랜잭션_밖에서_하고_보드_락은_쓰기_트랜잭션에서만_잡는다() throws Exception {
            JiraIntegrationConfig config = mock(JiraIntegrationConfig.class);
            when(config.getProjectKey()).thenReturn("QA");
            when(configRepository.findActiveByBoardId("board-1")).thenReturn(Optional.of(config));
            when(oauthService.resolveToken(config)).thenAnswer(inv -> {
                assertThat(tx.active).isTrue(); // 회전 refresh 토큰 저장 때문에 트랜잭션 안이어야 한다
                return "token";
            });

            List<Boolean> txDuringSearch = new ArrayList<>();
            when(jiraApiClient.searchIssues(any(), anyString(), any(), anyInt()))
                    .thenAnswer(inv -> {
                        txDuringSearch.add(tx.active);
                        return new ObjectMapper().readTree("{\"issues\":[]}");
                    });
            when(boardRepository.findByIdWithLock("board-1")).thenAnswer(inv -> {
                assertThat(tx.active).isTrue();
                return Optional.of(mock(Board.class));
            });
            when(userRepository.findById("user-1")).thenReturn(Optional.of(mock(User.class)));
            when(blockRepository.findByBoardIdAndFixedType("board-1", FixedBlockType.TASK))
                    .thenReturn(Optional.of(mock(Block.class)));
            when(issueLinkRepository.findByBoardId("board-1")).thenReturn(List.of());

            service.pullIssues("board-1", "user-1", 5);

            assertThat(txDuringSearch).containsExactly(false);
            assertThat(tx.count).isEqualTo(2); // ① 준비 ③ 쓰기
            verify(config).markSynced();
        }
    }
}
