package com.kanban.domain.auth.pat;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PersonalAccessTokenRepository extends JpaRepository<PersonalAccessToken, String> {

    Optional<PersonalAccessToken> findByTokenHash(String tokenHash);

    List<PersonalAccessToken> findByUserIdAndRevokedAtIsNullOrderByCreatedAtDesc(String userId);

    Optional<PersonalAccessToken> findByIdAndUserId(String id, String userId);

    long countByUserIdAndRevokedAtIsNull(String userId);
}
