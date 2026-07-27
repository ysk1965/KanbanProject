package com.kanban.domain.report.service;

import com.kanban.domain.report.ReportDispatchSlot;
import com.kanban.domain.report.ReportDispatchSlotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 발송 슬롯 테이블에 대한 짧은 <b>독립 트랜잭션</b> 쓰기. {@link ReportDispatchLock}과 분리한 이유는
 * INSERT 충돌 예외가 바깥이 아닌 이 {@code REQUIRES_NEW} 경계에서만 롤백되도록 하기 위해서다
 * (같은 빈 안의 자기호출로는 트랜잭션 프록시가 걸리지 않는다). 스케줄러는 트랜잭션 밖에서 도므로
 * 여기서 새 트랜잭션을 열어 커밋해야 다른 인스턴스가 그 선점을 볼 수 있다.
 */
@Component
@RequiredArgsConstructor
class ReportDispatchSlotWriter {

    private final ReportDispatchSlotRepository repository;

    /**
     * 슬롯을 원자적으로 선점한다. 이미 있으면 PK 충돌로 {@code DataIntegrityViolationException}이
     * 나고 이 트랜잭션만 롤백된다 — 호출부는 그 예외를 "이미 선점됨"으로 읽는다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void claim(String lockKey, LocalDateTime now) {
        repository.saveAndFlush(new ReportDispatchSlot(lockKey, now));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void free(String lockKey) {
        repository.deleteByLockKey(lockKey);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int cleanup(LocalDateTime before) {
        return repository.deleteAcquiredBefore(before);
    }
}
