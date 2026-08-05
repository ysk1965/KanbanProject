package com.kanban.domain.integration.jira;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 위임할 때 사람이 직접 올린 자료(스크린샷·재현 영상) 한 건.
 *
 * <p>댓글 첨부({@code comment_attachments})와 따로 두는 이유는 <b>수명과 범위가 다르기</b> 때문이다.
 * 댓글 첨부는 태스크에 붙어 모든 작업이 함께 보지만, 여기 올라온 파일은 "이 지시문을 이해하는 데
 * 필요한 그림"이라 그 작업에만 붙는다. 같은 태스크에 두 번 맡기면서 다른 스크린샷을 주는 것이
 * 정상 흐름인데, 댓글로 저장하면 두 번째 위임이 첫 번째 그림까지 끌고 간다.
 *
 * <p>한 번의 위임이 체크리스트 항목 N건으로 갈라지면 <b>같은 파일을 N행이 가리킨다</b>. S3 객체는
 * 하나만 올린다 — 행마다 복사하면 같은 그림이 용량만 N배로 남는다. 그래서 개별 행을 지울 때
 * S3 객체를 함께 지우지 않는다(형제 작업이 아직 그 URL을 본다).
 */
@Entity
@Table(name = "jira_autofix_job_materials", indexes = {
    @Index(name = "idx_autofix_job_material_job", columnList = "job_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JiraAutofixJobMaterial {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    /**
     * 소속 작업. 연관관계 대신 id만 들고 있다 — 이 표는 claim 시점에 한 번 읽히고 끝이라
     * 양방향 매핑이 주는 것이 없고, {@code JiraAutofixJob}에 컬렉션이 붙으면 큐 조회마다
     * 자료까지 딸려 나온다.
     */
    @Column(name = "job_id", nullable = false, length = 36)
    private String jobId;

    @Column(name = "original_file_name", length = 500)
    private String originalFileName;

    @Column(name = "s3_key", nullable = false, length = 500)
    private String s3Key;

    /** 러너가 직접 받아갈 주소. 파일 자체는 작업 명세에 싣지 않는다. */
    @Column(name = "url", nullable = false, length = 1000)
    private String url;

    /** {@code image/*} / {@code video/*} — 러너가 영상이면 프레임을 뽑는다. */
    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        if (this.createdAt == null) this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /** 영구 저장소로 옮긴 파일 하나를 작업에 붙인다. */
    public static JiraAutofixJobMaterial of(String jobId, String originalFileName, String s3Key,
                                            String url, String contentType, Long fileSize) {
        return JiraAutofixJobMaterial.builder()
                .id(UUID.randomUUID().toString())
                .jobId(jobId)
                .originalFileName(originalFileName)
                .s3Key(s3Key)
                .url(url)
                .contentType(contentType)
                .fileSize(fileSize)
                .build();
    }
}
