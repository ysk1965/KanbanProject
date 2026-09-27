package com.kanban.domain.personal.feature;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PersonalFeatureTermRepository extends JpaRepository<PersonalFeatureTerm, String> {

    Optional<PersonalFeatureTerm> findByUserIdAndFeatureKeyAndFieldAndValue(
            String userId, String featureKey, String field, String value);

    List<PersonalFeatureTerm> findByUserIdAndFeatureKeyAndFieldOrderByUseCountDescLastUsedAtDesc(
            String userId, String featureKey, String field);

    List<PersonalFeatureTerm> findByUserIdAndFeatureKeyOrderByFieldAscUseCountDescLastUsedAtDesc(
            String userId, String featureKey);

    void deleteByUserIdAndFeatureKeyAndFieldAndValue(
            String userId, String featureKey, String field, String value);
}
