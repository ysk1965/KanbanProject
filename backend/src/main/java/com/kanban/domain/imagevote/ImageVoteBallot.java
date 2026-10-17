package com.kanban.domain.imagevote;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/** 한 명의 투표 (1·2·3위 선택). voter_key 로 브라우저 단위 재투표(수정) 허용. */
@Entity
@Table(name = "image_vote_ballots",
        uniqueConstraints = {
                @UniqueConstraint(name = "uq_ivb_vote_voter", columnNames = {"vote_id", "voter_key"})
        },
        indexes = {
                @Index(name = "idx_ivb_vote", columnList = "vote_id")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ImageVoteBallot extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "vote_id", nullable = false)
    private ImageVote vote;

    @Column(name = "voter_name", nullable = false, length = 100)
    private String voterName;

    /** 클라이언트 생성 익명 키 (localStorage UUID) */
    @Column(name = "voter_key", nullable = false, length = 64)
    private String voterKey;

    @Column(name = "first_candidate_id", nullable = false, length = 36)
    private String firstCandidateId;

    @Column(name = "second_candidate_id", nullable = false, length = 36)
    private String secondCandidateId;

    @Column(name = "third_candidate_id", nullable = false, length = 36)
    private String thirdCandidateId;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updatePicks(String voterName, String first, String second, String third) {
        this.voterName = voterName;
        this.firstCandidateId = first;
        this.secondCandidateId = second;
        this.thirdCandidateId = third;
    }
}
