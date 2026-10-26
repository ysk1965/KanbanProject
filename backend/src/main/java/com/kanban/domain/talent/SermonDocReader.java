package com.kanban.domain.talent;

import com.kanban.domain.personal.feature.PersonalFeatureDoc;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** 달란트 계산이 설교 노트 문서를 읽는 창구(쓰기 없음). 갈피를 다른 노트로 넘길 때만 쓴다. */
public interface SermonDocReader extends Repository<PersonalFeatureDoc, String> {

    @Query("SELECT d FROM PersonalFeatureDoc d WHERE d.user.id = :userId AND d.featureKey = 'sermon' "
            + "AND d.deletedAt IS NULL AND d.id <> :excludeId")
    List<PersonalFeatureDoc> findLiveSermonDocs(@Param("userId") String userId, @Param("excludeId") String excludeId);
}
