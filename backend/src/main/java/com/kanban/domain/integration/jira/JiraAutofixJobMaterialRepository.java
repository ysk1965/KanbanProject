package com.kanban.domain.integration.jira;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface JiraAutofixJobMaterialRepository extends JpaRepository<JiraAutofixJobMaterial, String> {

    /** claim 시점에 작업 명세를 조립하며 읽는다. 올린 순서가 사람이 설명한 순서다. */
    List<JiraAutofixJobMaterial> findByJobIdOrderByCreatedAtAsc(String jobId);
}
