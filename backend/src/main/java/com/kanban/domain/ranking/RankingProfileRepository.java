package com.kanban.domain.ranking;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RankingProfileRepository extends JpaRepository<RankingProfile, String> {

    List<RankingProfile> findByUserIdIn(Collection<String> userIds);

    boolean existsByNicknameAndTag(String nickname, String tag);
}
