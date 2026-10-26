package com.kanban.domain.talent.service;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 설교 노트 문서 저장 → 달란트 계산 연결부.
 *
 * <p>노트 트랜잭션이 커밋된 뒤 별도 트랜잭션으로 돈다. 어떤 예외도 노트 저장을 실패시키지 않는다(잡아서 로그만).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SermonTalentHook {

    private final TalentAccrualService accrualService;

    public void docSaved(String userId, String docId, String title, Map<String, Object> content) {
        afterCommit(() -> accrualService.onSermonDocSaved(userId, docId, title, content), userId, docId);
    }

    public void docDeleted(String userId, String docId) {
        afterCommit(() -> accrualService.onSermonDocDeleted(userId, docId), userId, docId);
    }

    private void afterCommit(Runnable task, String userId, String docId) {
        Runnable safe = () -> {
            try {
                task.run();
            } catch (Exception e) {
                log.warn("Talent accrual failed - user: {}, doc: {}", userId, docId, e);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    safe.run();
                }
            });
        } else {
            safe.run();
        }
    }
}
