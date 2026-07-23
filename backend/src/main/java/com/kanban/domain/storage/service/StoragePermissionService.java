package com.kanban.domain.storage.service;

import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.organization.service.OrganizationService;
import com.kanban.domain.storage.StorageScope;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 스코프별 권한 검증. 노트 도메인의 권한 체크 방식을 그대로 따른다.
 *  - OWNER: 쿼리 레벨(owner.id) 격리로 충분 (no-op)
 *  - BOARD: read=viewer+, write=member+, strong=admin+
 *  - ORG: read/write=조직 멤버, strong=admin+
 */
@Service
@RequiredArgsConstructor
public class StoragePermissionService {

    private final BoardService boardService;
    private final OrganizationService organizationService;

    public void checkRead(StorageScope scope, String userId) {
        switch (scope.type()) {
            case OWNER -> { /* 쿼리 레벨 격리 */ }
            case BOARD -> boardService.checkViewerOrAbove(scope.boardId(), userId);
            case ORG -> organizationService.getOrgMemberOrThrow(scope.organizationId(), userId);
        }
    }

    public void checkWrite(StorageScope scope, String userId) {
        switch (scope.type()) {
            case OWNER -> { /* 쿼리 레벨 격리 */ }
            case BOARD -> boardService.checkMemberOrAbove(scope.boardId(), userId);
            case ORG -> organizationService.getOrgMemberOrThrow(scope.organizationId(), userId);
        }
    }

    public void checkStrong(StorageScope scope, String userId) {
        switch (scope.type()) {
            case OWNER -> { /* 쿼리 레벨 격리 */ }
            case BOARD -> boardService.checkAdminOrAbove(scope.boardId(), userId);
            case ORG -> organizationService.checkAdminOrAbove(scope.organizationId(), userId);
        }
    }
}
