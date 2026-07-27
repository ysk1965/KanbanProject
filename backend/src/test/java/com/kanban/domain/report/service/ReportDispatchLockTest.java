package com.kanban.domain.report.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDateTime;
import java.time.Month;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ReportDispatchLockTest {

    @Mock
    ReportDispatchSlotWriter writer;

    @InjectMocks
    ReportDispatchLock lock;

    private static final LocalDateTime SLOT = LocalDateTime.of(2026, Month.JULY, 27, 0, 0);

    @Test
    void 슬롯을_처음_잡으면_발송을_맡는다() {
        doNothing().when(writer).claim(any(), any());
        assertTrue(lock.acquire("b", "DAILY_DEV", SLOT));
    }

    @Test
    void 이미_선점된_슬롯이면_발송을_건너뛴다() {
        doThrow(new DataIntegrityViolationException("dup key"))
                .when(writer).claim(any(), any());
        assertFalse(lock.acquire("b", "DAILY_DEV", SLOT), "PK 충돌 = 다른 인스턴스가 이미 선점");
    }

    @Test
    void 예상못한_DB오류는_락_없이_진행한다_faildOpen() {
        doThrow(new RuntimeException("connection reset"))
                .when(writer).claim(any(), any());
        assertTrue(lock.acquire("b", "DAILY_DEV", SLOT),
                "보고서를 못 보내는 것보다 드물게 중복되는 편이 낫다");
    }

    @Test
    void 키는_보드_종류_분슬롯으로_구성된다() {
        lock.acquire("board-1", "DAILY_DEV", SLOT);
        verify(writer).claim(eq("report:dispatch:DAILY_DEV:board-1:2026-07-27T00:00"), any());
    }
}
