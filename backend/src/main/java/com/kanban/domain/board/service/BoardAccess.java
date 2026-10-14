package com.kanban.domain.board.service;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.kanban.domain.board.BoardRole;

/**
 * 한 사용자가 한 보드에 대해 갖는 접근 정보의 스냅샷 — {@code boardAccess} 캐시에 저장되는 값.
 *
 * <p>권한 판정(viewer/member/admin/owner)은 전부 이 레코드 위에서 순수 계산으로 끝난다. DB 는
 * {@link BoardAccessResolver#resolve(String, String)} 가 캐시 미스일 때만 본다.
 *
 * <p>판정 규칙(기존 {@code BoardService.check*} 와 동일):
 * <ul>
 *   <li>viewerOrAbove: 명시적 멤버십(역할 무관) → 허용; 아니면 시스템 ADMIN → 허용; 아니면 조직 보드 + 조직원
 *       (autoBoardAccess 설정과 무관) → 허용</li>
 *   <li>memberOrAbove: 명시적 멤버십이 있으면 VIEWER 만 거부(폴백 없음); 없으면 조직 보드 + autoBoardAccess ON +
 *       조직원 → 가상 MEMBER. 시스템 ADMIN 우회 없음</li>
 *   <li>adminOrAbove / owner: 명시적 멤버십의 역할만 본다</li>
 * </ul>
 *
 * <p>{@code systemAdmin}/{@code orgBoard}/{@code orgMember}/{@code autoBoardAccess} 는 명시적 멤버십이 <b>없을 때만</b>
 * 채워진다 — 명시적 역할이 있으면 어떤 판정에도 영향을 주지 않으므로 리졸버가 그 조회를 생략한다.
 *
 * <p>Redis 캐시 직렬화: {@code CacheConfig} 의 ObjectMapper 는 non-final 타입에만 {@code @class} 를 붙이는데
 * record 는 final 이라 타입 정보가 빠져 Map 으로 역직렬화된다. 그래서 클래스에 {@link JsonTypeInfo} 를 직접 단다.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.CLASS, include = JsonTypeInfo.As.PROPERTY, property = "@class")
@JsonIgnoreProperties(ignoreUnknown = true)
public record BoardAccess(
        BoardRole explicitRole, boolean systemAdmin, boolean orgBoard, boolean orgMember, boolean autoBoardAccess) {

    private static final BoardAccess NONE = new BoardAccess(null, false, false, false, false);

    /** 접근 정보 없음 — 보드가 없거나, 멤버도 조직원도 시스템 관리자도 아닐 때. */
    public static BoardAccess none() {
        return NONE;
    }

    /** 명시적 멤버십이 있을 때. 나머지 플래그는 판정에 쓰이지 않으므로 false 로 둔다. */
    public static BoardAccess explicit(BoardRole role) {
        return new BoardAccess(role, false, false, false, false);
    }

    @JsonIgnore
    public boolean hasExplicitRole() {
        return explicitRole != null;
    }

    @JsonIgnore
    public boolean isViewerOrAbove() {
        if (explicitRole != null) {
            return true;
        }
        return systemAdmin || (orgBoard && orgMember);
    }

    @JsonIgnore
    public boolean isMemberOrAbove() {
        if (explicitRole != null) {
            return explicitRole != BoardRole.VIEWER;
        }
        return orgBoard && autoBoardAccess && orgMember;
    }

    @JsonIgnore
    public boolean isAdminOrAbove() {
        return explicitRole == BoardRole.OWNER || explicitRole == BoardRole.ADMIN;
    }

    @JsonIgnore
    public boolean isOwner() {
        return explicitRole == BoardRole.OWNER;
    }
}
