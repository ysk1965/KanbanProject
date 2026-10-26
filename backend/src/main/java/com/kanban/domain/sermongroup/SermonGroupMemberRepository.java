package com.kanban.domain.sermongroup;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SermonGroupMemberRepository extends JpaRepository<SermonGroupMember, String> {

    Optional<SermonGroupMember> findByGroupIdAndUserId(String groupId, String userId);

    List<SermonGroupMember> findByGroupIdOrderByJoinedAtAsc(String groupId);

    List<SermonGroupMember> findByGroupIdIn(Collection<String> groupIds);

    List<SermonGroupMember> findByUserId(String userId);

    long countByGroupId(String groupId);

    long countByGroupIdAndStatus(String groupId, String status);

    /** 삭제되지 않은 모임 중 내가 active·pending 인 수 (유저당 상한 검사) */
    @Query("SELECT COUNT(m) FROM SermonGroupMember m, SermonGroup g "
            + "WHERE g.id = m.groupId AND g.deletedAt IS NULL AND m.userId = :userId")
    long countLiveMemberships(@Param("userId") String userId);
}
