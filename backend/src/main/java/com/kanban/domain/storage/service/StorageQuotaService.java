package com.kanban.domain.storage.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.subscription.Subscription;
import com.kanban.domain.subscription.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 사용자별 스토리지 용량 한도(quota)를 구독 티어에 연동해 산출한다.
 *
 * 구독 모델은 보드 단위(Subscription ↔ Board)이므로, 사용자가 소유한 보드들의 구독을 조사해
 * "가장 높은 티어"를 사용자 티어로 본다.
 *  - 소유 보드 중 ACTIVE(유료) 구독이 하나라도 있으면 PREMIUM
 *  - 그 외 보드가 있으면 STANDARD (무료)
 *  - 소유 보드가 없으면 BASE (체험)
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StorageQuotaService {

    private final BoardRepository boardRepository;
    private final SubscriptionRepository subscriptionRepository;

    /** BASE(체험) 기본 1GB */
    @Value("${app.storage.quota.base-bytes:1073741824}")
    private long baseBytes;

    /** STANDARD(무료) 5GB */
    @Value("${app.storage.quota.standard-bytes:5368709120}")
    private long standardBytes;

    /** PREMIUM 20GB */
    @Value("${app.storage.quota.premium-bytes:21474836480}")
    private long premiumBytes;

    public record Quota(long bytes, String tier) {}

    public Quota resolve(String userId) {
        List<Board> ownedBoards = boardRepository.findByOwnerId(userId);
        if (ownedBoards.isEmpty()) {
            return new Quota(baseBytes, "BASE");
        }

        List<String> boardIds = ownedBoards.stream().map(Board::getId).toList();
        List<Subscription> subs = subscriptionRepository.findByBoardIdIn(boardIds);

        boolean premium = subs.stream().anyMatch(Subscription::isActive);
        if (premium) {
            return new Quota(premiumBytes, "PREMIUM");
        }
        return new Quota(standardBytes, "STANDARD");
    }
}
