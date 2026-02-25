package com.kanban.domain.organization.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.dto.OrgBoardResponse;
import com.kanban.domain.organization.repository.OrgMemberRepository;
import com.kanban.domain.organization.repository.OrganizationRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrganizationFacadeService {

    private final OrganizationRepository organizationRepository;
    private final OrgMemberRepository orgMemberRepository;
    private final BoardRepository boardRepository;
    private final BoardMemberRepository boardMemberRepository;
    private final OrganizationService organizationService;

    public List<OrgBoardResponse.Simple> getOrgBoards(String orgId, String userId) {
        organizationService.getOrgMemberOrThrow(orgId, userId);
        List<Board> boards = boardRepository.findByOrganizationId(orgId);
        return boards.stream().map(board -> {
            int memberCount = boardMemberRepository.findByBoardId(board.getId()).size();
            return OrgBoardResponse.Simple.of(board, memberCount);
        }).collect(Collectors.toList());
    }

    public OrgBoardResponse.EligibilityCheck checkBoardEligibility(String orgId, String boardId, String userId) {
        organizationService.checkAdminOrAbove(orgId, userId);

        Board board = boardRepository.findActiveById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        // Check board is not already in an org
        if (board.getOrganization() != null) {
            throw new BusinessException(ErrorCode.BOARD_ALREADY_IN_ORG);
        }

        // Check user is Board Owner
        if (!board.isOwner(userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        // Get all board members and check if they are org members
        List<BoardMember> boardMembers = boardMemberRepository.findByBoardId(boardId);
        List<OrgBoardResponse.NonOrgMemberInfo> nonOrgMembers = new ArrayList<>();

        for (BoardMember bm : boardMembers) {
            if (!orgMemberRepository.existsByOrganizationIdAndUserId(orgId, bm.getUser().getId())) {
                nonOrgMembers.add(OrgBoardResponse.NonOrgMemberInfo.builder()
                        .userId(bm.getUser().getId())
                        .name(bm.getUser().getName())
                        .email(bm.getUser().getEmail())
                        .build());
            }
        }

        return OrgBoardResponse.EligibilityCheck.builder()
                .boardId(board.getId())
                .boardName(board.getName())
                .isEligible(nonOrgMembers.isEmpty())
                .totalMembers(boardMembers.size())
                .nonOrgMembers(nonOrgMembers)
                .build();
    }

    @Transactional
    public OrgBoardResponse.Simple addBoardToOrg(String orgId, String boardId, String userId) {
        // Use pessimistic lock to prevent R1/R3 race condition
        Organization org = organizationRepository.findActiveByIdWithLock(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_NOT_FOUND));
        organizationService.checkAdminOrAbove(orgId, userId);

        Board board = boardRepository.findActiveById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (board.getOrganization() != null) {
            throw new BusinessException(ErrorCode.BOARD_ALREADY_IN_ORG);
        }

        if (!board.isOwner(userId)) {
            throw new BusinessException(ErrorCode.BOARD_ACCESS_DENIED);
        }

        // R1: Verify all board members are org members
        List<BoardMember> boardMembers = boardMemberRepository.findByBoardId(boardId);
        for (BoardMember bm : boardMembers) {
            if (!orgMemberRepository.existsByOrganizationIdAndUserId(orgId, bm.getUser().getId())) {
                throw new BusinessException(ErrorCode.BOARD_NOT_ELIGIBLE_FOR_ORG);
            }
        }

        board.setOrganization(org);
        int memberCount = boardMembers.size();
        log.info("Board added to organization: boardId={}, orgId={}", boardId, orgId);
        return OrgBoardResponse.Simple.of(board, memberCount);
    }

    @Transactional
    public void removeBoardFromOrg(String orgId, String boardId, String userId) {
        organizationService.getActiveOrgOrThrow(orgId);
        organizationService.checkAdminOrAbove(orgId, userId);

        Board board = boardRepository.findActiveById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

        if (board.getOrganization() == null || !board.getOrganization().getId().equals(orgId)) {
            throw new BusinessException(ErrorCode.BOARD_NOT_IN_ORG);
        }

        board.removeOrganization();
        log.info("Board removed from organization: boardId={}, orgId={}", boardId, orgId);
    }
}
