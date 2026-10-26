package com.kanban.domain.church;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import java.util.UUID;
import lombok.*;

/**
 * 교회. 1단계는 사용자가 직접 등록한다 — 이름(공백 제거·소문자) + region 이 같으면 같은 교회.
 *
 * <p>kakao_place_id 는 2단계(카카오 장소 검색)용으로 컬럼만 둔다.
 */
@Entity
@Table(
        name = "churches",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uq_church_name_region",
                    columnNames = {"name_key", "region"}),
            @UniqueConstraint(name = "uq_church_kakao_place", columnNames = "kakao_place_id")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Church extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "name", nullable = false, length = 40)
    private String name;

    @Column(name = "name_key", nullable = false, length = 40)
    private String nameKey;

    @Column(name = "region", nullable = false, length = 40)
    private String region;

    @Column(name = "address", length = 200)
    private String address;

    @Column(name = "kakao_place_id", length = 40)
    private String kakaoPlaceId;

    @Column(name = "created_by", length = 36)
    private String createdBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
