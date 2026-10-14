package com.kanban.domain.board.service;

import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.event.BoardAccessScopeChangedEvent;
import com.kanban.domain.board.event.BoardMembershipChangedEvent;
import com.kanban.domain.board.event.OrgMembershipChangedEvent;
import com.kanban.domain.board.event.OrgSettingsChangedEvent;
import com.kanban.domain.board.event.UserSystemRoleChangedEvent;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * {@code boardAccess} 캐시 무효화 API. 모든 evict 는 <b>즉시 + 커밋 뒤</b> 두 번 실행된다:
 * <ul>
 *   <li>즉시: 같은 트랜잭션 안에서 이어지는 권한 체크가 새 상태를 보도록</li>
 *   <li>커밋 뒤: 그 사이 다른 트랜잭션/인스턴스가 커밋 전 상태를 다시 캐시했을 수 있으므로</li>
 * </ul>
 * 트랜잭션 밖에서 불리면 즉시 한 번만 실행된다.
 *
 * <p>엔티티 변경은 {@code BoardAccessEntityListener} 가 이벤트로 넘겨 자동 처리된다. 서비스에서 직접 부를 일은
 * JPA 콜백을 타지 않는 {@code @Modifying} 벌크 삭제 뒤뿐이다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BoardAccessCacheEvictor {

    private final BoardAccessCache cache;
    private final BoardRepository boardRepository;

    public void evict(String boardId, String userId) {
        nowAndAfterCommit(() -> cache.evict(boardId, userId));
    }

    public void evictBoard(String boardId) {
        nowAndAfterCommit(() -> cache.evictBoard(boardId));
    }

    public void evictUser(String userId) {
        nowAndAfterCommit(() -> cache.evictUser(userId));
    }

    /** 조직의 (삭제되지 않은) 모든 보드. 보드 목록은 지금 조회해 커밋 뒤 콜백에서는 DB 를 안 본다. */
    public void evictOrganization(String orgId) {
        List<String> boardIds = boardRepository.findBoardIdsByOrgId(orgId);
        nowAndAfterCommit(() -> cache.evictBoards(boardIds));
    }

    public void evictAll() {
        nowAndAfterCommit(cache::clear);
    }

    // ── 엔티티 리스너 이벤트 (발행 시점에 동기 호출 — 트랜잭션 안) ──

    @EventListener
    public void on(BoardMembershipChangedEvent event) {
        evict(event.boardId(), event.userId());
    }

    /**
     * 조직 멤버십 변경 → 그 사용자의 모든 보드 엔트리. 조직의 보드 목록을 조회하면 더 좁힐 수 있지만 이 이벤트는
     * flush 도중({@code @PreUpdate}) 올 수 있어 콜백 안에서 쿼리를 내지 않는다.
     */
    @EventListener
    public void on(OrgMembershipChangedEvent event) {
        evictUser(event.userId());
    }

    /** 조직 설정(autoBoardAccess)·삭제 — 드문 이벤트라 캐시 전체를 비운다(보드 목록 조회 없이). */
    @EventListener
    public void on(OrgSettingsChangedEvent event) {
        log.debug("boardAccess: clearing all entries (org {} settings changed)", event.orgId());
        evictAll();
    }

    @EventListener
    public void on(UserSystemRoleChangedEvent event) {
        evictUser(event.userId());
    }

    @EventListener
    public void on(BoardAccessScopeChangedEvent event) {
        evictBoard(event.boardId());
    }

    private static void nowAndAfterCommit(Runnable eviction) {
        eviction.run();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    eviction.run();
                }
            });
        }
    }
}
