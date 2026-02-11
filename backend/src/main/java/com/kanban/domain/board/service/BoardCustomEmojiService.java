package com.kanban.domain.board.service;

import com.kanban.domain.board.Board;
import com.kanban.domain.board.BoardCustomEmoji;
import com.kanban.domain.board.BoardCustomEmojiRepository;
import com.kanban.domain.board.BoardRepository;
import com.kanban.domain.board.dto.BoardCustomEmojiResponse;
import com.kanban.domain.comment.CommentReactionRepository;
import com.kanban.domain.user.User;
import com.kanban.domain.user.UserRepository;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import com.kanban.global.service.FileUploadService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardCustomEmojiService {

    private final BoardCustomEmojiRepository customEmojiRepository;
    private final BoardRepository boardRepository;
    private final UserRepository userRepository;
    private final BoardService boardService;
    private final FileUploadService fileUploadService;
    private final CommentReactionRepository commentReactionRepository;

    private static final long MAX_EMOJI_SIZE = 128 * 1024; // 128KB
    private static final Set<String> ALLOWED_EMOJI_TYPES = Set.of(
            "image/png", "image/gif", "image/webp"
    );
    private static final int MAX_CUSTOM_EMOJIS_PER_BOARD = 50;

    /**
     * 보드의 커스텀 이모지 목록 조회
     */
    public BoardCustomEmojiResponse.ListResponse getEmojis(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        List<BoardCustomEmoji> emojis = customEmojiRepository.findByBoardIdOrderByCreatedAtAsc(boardId);
        return BoardCustomEmojiResponse.ListResponse.of(emojis);
    }

    /**
     * 커스텀 이모지 업로드 (Admin+)
     */
    @Transactional
    public BoardCustomEmojiResponse.Detail uploadEmoji(String boardId, String userId,
                                                        String name, MultipartFile file) {
        boardService.checkAdminOrAbove(boardId, userId);

        // 개수 제한
        long currentCount = customEmojiRepository.findByBoardIdOrderByCreatedAtAsc(boardId).size();
        if (currentCount >= MAX_CUSTOM_EMOJIS_PER_BOARD) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // 파일 검증
        validateEmojiFile(file);

        Board board = boardRepository.findById(boardId)
                .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // 파일 업로드 (temp → permanent)
        FileUploadService.TempUploadResult tempResult = fileUploadService.uploadTemp(file);
        FileUploadService.PermanentResult result = fileUploadService.moveToPermanent(
                tempResult.getTempKey(), boardId, "emojis");

        BoardCustomEmoji emoji = BoardCustomEmoji.builder()
                .board(board)
                .name(name.trim())
                .imageUrl(result.getUrl())
                .s3Key(result.getS3Key())
                .contentType(result.getContentType())
                .fileSize(result.getFileSize())
                .uploadedBy(user)
                .build();

        customEmojiRepository.save(emoji);
        log.info("Custom emoji uploaded: {} ({}) for board: {} by user: {}",
                emoji.getName(), emoji.getId(), boardId, userId);

        return BoardCustomEmojiResponse.Detail.of(emoji);
    }

    /**
     * 커스텀 이모지 삭제 (Admin+)
     */
    @Transactional
    public void deleteEmoji(String boardId, String emojiId, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);

        BoardCustomEmoji emoji = customEmojiRepository.findById(emojiId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT_VALUE));

        if (!emoji.getBoard().getId().equals(boardId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // S3 파일 삭제
        fileUploadService.delete(emoji.getS3Key());

        // 해당 이모지를 사용한 리액션 삭제
        String customEmojiKey = "custom:" + emojiId;
        commentReactionRepository.deleteByEmoji(customEmojiKey);

        customEmojiRepository.delete(emoji);
        log.info("Custom emoji deleted: {} ({}) from board: {} by user: {}",
                emoji.getName(), emojiId, boardId, userId);
    }

    /**
     * 커스텀 이모지 존재 확인 (리액션 토글 시 사용)
     */
    public boolean existsById(String emojiId) {
        return customEmojiRepository.existsById(emojiId);
    }

    /**
     * ID로 커스텀 이모지 조회
     */
    public BoardCustomEmoji findById(String emojiId) {
        return customEmojiRepository.findById(emojiId).orElse(null);
    }

    private void validateEmojiFile(MultipartFile file) {
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_EMOJI_TYPES.contains(contentType)) {
            throw new BusinessException(ErrorCode.FILE_TYPE_NOT_ALLOWED);
        }
        if (file.getSize() > MAX_EMOJI_SIZE) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }
    }
}
