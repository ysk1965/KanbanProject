package com.kanban.domain.church;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserChurchRepository extends JpaRepository<UserChurch, String> {

    long countByChurchId(String churchId);

    List<UserChurch> findByChurchId(String churchId);

    List<UserChurch> findByUserIdIn(Collection<String> userIds);

    /** [church_id, count] */
    @Query("SELECT uc.churchId, COUNT(uc) FROM UserChurch uc WHERE uc.churchId IN :ids GROUP BY uc.churchId")
    List<Object[]> countByChurchIds(@Param("ids") Collection<String> ids);
}
