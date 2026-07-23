package com.kanban.domain.storage;

/**
 * 스토리지 스코프 (개인 / 보드 / 조직). 노트의 3-way 스코프를 값 객체로 표현.
 * 리포지토리/서비스는 이 스코프로 리소스를 격리하며, 권한 검증(멤버십/역할)은 각 스코프 컨트롤러가 선행한다.
 */
public record StorageScope(Type type, String ownerUserId, String boardId, String organizationId) {

    public enum Type { OWNER, BOARD, ORG }

    public static StorageScope owner(String userId) {
        return new StorageScope(Type.OWNER, userId, null, null);
    }

    public static StorageScope board(String boardId) {
        return new StorageScope(Type.BOARD, null, boardId, null);
    }

    public static StorageScope org(String orgId) {
        return new StorageScope(Type.ORG, null, null, orgId);
    }

    /** 리포지토리 스코프 매칭용 타입 문자열 ("OWNER" | "BOARD" | "ORG") */
    public String typeName() {
        return type.name();
    }

    /** 리포지토리 스코프 매칭용 스코프 id (userId | boardId | orgId) */
    public String scopeId() {
        return switch (type) {
            case OWNER -> ownerUserId;
            case BOARD -> boardId;
            case ORG -> organizationId;
        };
    }

    /** S3 key 프리픽스 세그먼트 (예: storage/owner/{userId}/..., storage/board/{boardId}/...) */
    public String keySegment() {
        return switch (type) {
            case OWNER -> "owner/" + ownerUserId;
            case BOARD -> "board/" + boardId;
            case ORG -> "org/" + organizationId;
        };
    }
}
