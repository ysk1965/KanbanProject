package com.kanban.domain.storage.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.storage.StorageScope;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 스코프별 스토리지 용량 한도(quota) 산출.
 *  - OWNER(개인): 소유 보드 구독 중 ACTIVE 있으면 PREMIUM, 있으면 STANDARD, 없으면 BASE
 *  - BOARD: 해당 보드 구독이 ACTIVE 면 PREMIUM, 아니면 STANDARD
 *  - ORG(조직): 조직 공용 용량(설정값)
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StorageQuotaService {

    private final BoardRepository boardRepository;
    private final SubscriptionRepository subscriptionRepository;

    @Value("${app.storage.quota.base-bytes:1073741824}")
    private long baseBytes;          // 1GB (개인 체험)

    @Value("${app.storage.quota.standard-bytes:5368709120}")
    private long standardBytes;      // 5GB

    @Value("${app.storage.quota.premium-bytes:21474836480}")
    private long premiumBytes;       // 20GB

    @Value("${app.storage.quota.org-bytes:53687091200}")
    private long orgBytes;           // 50GB (조직 공용)

    public record Quota(long bytes, String tier) {}

    public Quota resolve(StorageScope scope) {
        return switch (scope.type()) {
            case OWNER -> resolveOwner(scope.ownerUserId());
            case BOARD -> resolveBoard(scope.boardId());
            case ORG -> new Quota(orgBytes, "ORG");
        };
    }

    private Quota resolveOwner(String userId) {
        List<Board> ownedBoards = boardRepository.findByOwnerId(userId);
        if (ownedBoards.isEmpty()) {
            return new Quota(baseBytes, "BASE");
        }
        List<String> boardIds = ownedBoards.stream().map(Board::getId).toList();
        boolean premium = subscriptionRepository.findByBoardIdIn(boardIds).stream()
                .anyMatch(Subscription::isActive);
        return premium ? new Quota(premiumBytes, "PREMIUM") : new Quota(standardBytes, "STANDARD");
    }

    private Quota resolveBoard(String boardId) {
        boolean premium = subscriptionRepository.findByBoardId(boardId)
                .map(Subscription::isActive)
                .orElse(false);
        return premium ? new Quota(premiumBytes, "PREMIUM") : new Quota(standardBytes, "STANDARD");
    }
}
