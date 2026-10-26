package com.kanban.domain.ranking.service;

import com.kanban.domain.ranking.RankingProfile;
import com.kanban.domain.ranking.RankingProfileRepository;
import java.security.SecureRandom;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** 랭킹 프로필 조회·생성과 이름 표시 규칙 */
@Component
@RequiredArgsConstructor
public class RankingProfileSupport {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final RankingProfileRepository repository;
    private final PlatformTransactionManager transactionManager;

    /** 없으면 만든다. 동시에 만들어도 한 줄만 남도록 별도 트랜잭션에서 넣고 다시 읽는다. */
    public RankingProfile getOrCreate(String userId) {
        return repository.findById(userId).orElseGet(() -> {
            TransactionTemplate tx = new TransactionTemplate(transactionManager);
            tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            try {
                tx.executeWithoutResult(s -> repository.saveAndFlush(RankingProfile.builder()
                        .userId(userId)
                        .anonNo(100 + RANDOM.nextInt(900))
                        .leagueTier(RankingProfile.TIER_MIN)
                        .build()));
            } catch (DataIntegrityViolationException ignored) {
                // 다른 요청이 먼저 만들었다
            }
            return repository.findById(userId).orElseThrow();
        });
    }

    public Map<String, RankingProfile> byUserIds(Collection<String> userIds) {
        if (userIds.isEmpty()) return Map.of();
        List<RankingProfile> list = repository.findByUserIdIn(userIds);
        return list.stream().collect(Collectors.toMap(RankingProfile::getUserId, Function.identity()));
    }

    /** 랭킹 이름: 익명 → anon_name, 닉네임 → "닉네임#tag", 없으면 "이름 없는 양 #{tag 또는 id 앞 4자리}" */
    public static String displayName(RankingProfile profile, String userId) {
        if (profile != null && profile.isAnonymous()) return profile.anonName();
        if (profile != null && profile.getNickname() != null) {
            return profile.getTag() != null ? profile.getNickname() + "#" + profile.getTag() : profile.getNickname();
        }
        String suffix = profile != null && profile.getTag() != null
                ? profile.getTag()
                : userId.substring(0, Math.min(4, userId.length()));
        return "이름 없는 양 #" + suffix;
    }

    public static boolean isAnonymous(RankingProfile profile) {
        return profile != null && profile.isAnonymous();
    }
}
