package com.kanban.domain.sermonnote.service;

import com.kanban.domain.sermongroup.SermonNoteShareRepository;
import com.kanban.domain.sermongroup.SermonReactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 설교 노트 문서를 지울 때(소프트 삭제) 그 노트에 딸린 것을 함께 지운다 — 버전 기록, 내 공개 사본(모임)과 거기 달린 반응.
 *
 * <p>{@code PersonalFeatureDocService.delete} 가 같은 트랜잭션 안에서 부른다(노트만 지워지고 사본이 남는 일이 없게).
 * 공개 사본의 note_id 는 클라이언트가 보낸 값이라, 서버 문서 id 와 같은 것만 지운다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SermonNoteDocHook {

    private final SermonNoteVersionService versionService;
    private final SermonNoteShareRepository shareRepository;
    private final SermonReactionRepository reactionRepository;

    @Transactional(propagation = Propagation.MANDATORY)
    public void docDeleted(String userId, String docId) {
        int versions = versionService.deleteAllOf(userId, docId);
        // 반응은 PG 에선 FK cascade 지만 H2 스키마엔 없을 수 있어 먼저 지운다
        int reactions = reactionRepository.deleteOnSharesOfNote(userId, docId);
        int shares = shareRepository.deleteByUserAndNote(userId, docId);
        log.debug(
                "Sermon note deleted: user={}, doc={}, versions={}, shares={}, reactions={}",
                userId,
                docId,
                versions,
                shares,
                reactions);
    }
}
