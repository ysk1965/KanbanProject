package com.kanban.domain.organization.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardMember;
import com.kanban.domain.board.BoardMemberRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.dto.BoardRequest;
import com.kanban.domain.board.dto.BoardResponse;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.organization.OrgActivityType;
import com.kanban.domain.organization.Organization;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.organization.dto.OrgBoardRequest;
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
    private final OrgActivityService orgActivityService;
    private final BoardService boardService;

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

        // Log activity
        OrganizationMember actor = organizationService.getOrgMemberOrThrow(orgId, userId);
        orgActivityService.log(org, actor.getUser().getName(),
                OrgActivityType.BOARD_ADDED, board.getName(), null);

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

        // Log activity before removing
        Organization org = organizationService.getActiveOrgOrThrow(orgId);
        OrganizationMember actor = organizationService.getOrgMemberOrThrow(orgId, userId);
        orgActivityService.log(org, actor.getUser().getName(),
                OrgActivityType.BOARD_REMOVED, board.getName(), null);

        board.removeOrganization();
        log.info("Board removed from organization: boardId={}, orgId={}", boardId, orgId);
    }

    @Transactional
    public OrgBoardResponse.Simple createBoardForOrg(String orgId, OrgBoardRequest.CreateBoard request, String userId) {
        Organization org = organizationRepository.findActiveByIdWithLock(orgId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ORG_NOT_FOUND));
        organizationService.checkAdminOrAbove(orgId, userId);

        // Create board via BoardService (creates board + owner member + default blocks + subscription)
        BoardRequest.Create boardRequest = new BoardRequest.Create(request.getName(), request.getDescription(), null);
        BoardResponse.Detail detail = boardService.createBoard(userId, boardRequest);

        // Link to organization
        Board board = boardRepository.findActiveById(detail.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        board.setOrganization(org);

        int memberCount = boardMemberRepository.findByBoardId(board.getId()).size();

        // Log activity
        OrganizationMember actor = organizationService.getOrgMemberOrThrow(orgId, userId);
        orgActivityService.log(org, actor.getUser().getName(),
                OrgActivityType.BOARD_CREATED, board.getName(), null);

        log.info("Board created for organization: boardId={}, orgId={}", board.getId(), orgId);
        return OrgBoardResponse.Simple.of(board, memberCount);
    }
}
