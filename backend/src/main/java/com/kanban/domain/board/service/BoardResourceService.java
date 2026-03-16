package com.kanban.domain.board.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.BoardResource;
import com.kanban.domain.board.BoardResourceRepository;
import com.kanban.domain.board.dto.BoardResourceRequest;
import com.kanban.domain.board.dto.BoardResourceResponse;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardResourceService {

    private final BoardResourceRepository boardResourceRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;

    private static final int MAX_RESOURCES_PER_BOARD = 20;

    public BoardResourceResponse.ListResponse getResources(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        List<BoardResource> resources = boardResourceRepository.findByBoardIdOrderByDisplayOrderAsc(boardId);
        return BoardResourceResponse.ListResponse.of(resources);
    }

    @Transactional
    public BoardResourceResponse.Detail createResource(String boardId, String userId,
                                                        BoardResourceRequest.Create request) {
        boardService.checkMemberOrAbove(boardId, userId);

        long currentCount = boardResourceRepository.countByBoardId(boardId);
        if (currentCount >= MAX_RESOURCES_PER_BOARD) {
            throw new BusinessException(ErrorCode.BOARD_RESOURCE_LIMIT_EXCEEDED);
        }

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        BoardResource resource = BoardResource.builder()
                .board(board)
                .title(request.getTitle().trim())
                .url(request.getUrl().trim())
                .description(request.getDescription() != null ? request.getDescription().trim() : null)
                .faviconUrl(deriveFaviconUrl(request.getUrl()))
                .displayOrder((int) currentCount)
                .createdBy(user)
                .build();

        boardResourceRepository.save(resource);
        log.info("Board resource created: {} for board: {} by user: {}", resource.getId(), boardId, userId);

        return BoardResourceResponse.Detail.of(resource);
    }

    @Transactional
    public BoardResourceResponse.Detail updateResource(String boardId, String resourceId, String userId,
                                                        BoardResourceRequest.Update request) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardResource resource = boardResourceRepository.findById(resourceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_RESOURCE_NOT_FOUND));

        if (!resource.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BOARD_RESOURCE_NOT_FOUND);
        }

        resource.update(request.getTitle().trim(), request.getUrl().trim(),
                request.getDescription() != null ? request.getDescription().trim() : null);
        resource.updateFaviconUrl(deriveFaviconUrl(request.getUrl()));

        log.info("Board resource updated: {} for board: {} by user: {}", resourceId, boardId, userId);
        return BoardResourceResponse.Detail.of(resource);
    }

    @Transactional
    public void deleteResource(String boardId, String resourceId, String userId) {
        boardService.checkMemberOrAbove(boardId, userId);

        BoardResource resource = boardResourceRepository.findById(resourceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_RESOURCE_NOT_FOUND));

        if (!resource.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.BOARD_RESOURCE_NOT_FOUND);
        }

        boardResourceRepository.delete(resource);
        log.info("Board resource deleted: {} from board: {} by user: {}", resourceId, boardId, userId);
    }

    @Transactional
    public BoardResourceResponse.ListResponse reorderResources(String boardId, String userId,
                                                                 BoardResourceRequest.Reorder request) {
        boardService.checkMemberOrAbove(boardId, userId);

        List<BoardResource> resources = boardResourceRepository.findByBoardIdOrderByDisplayOrderAsc(boardId);

        for (int i = 0; i < request.getResourceIds().size(); i++) {
            final int order = i;
            final String id = request.getResourceIds().get(i);
            resources.stream()
                    .filter(r -> r.getId().equals(id))
                    .findFirst()
                    .ifPresent(r -> r.updateDisplayOrder(order));
        }

        return BoardResourceResponse.ListResponse.of(
                boardResourceRepository.findByBoardIdOrderByDisplayOrderAsc(boardId));
    }

    private String deriveFaviconUrl(String url) {
        try {
            URI uri = new URI(url);
            String host = uri.getHost();
            if (host != null) {
                return "https://www.google.com/s2/favicons?domain=" + host + "&sz=32";
            }
        } catch (Exception e) {
            log.debug("Failed to derive favicon URL from: {}", url);
        }
        return null;
    }
}
