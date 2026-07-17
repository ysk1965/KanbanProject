package com.kanban.domain.monitoring.service;

import com.kanban.domain.monitoring.dto.ClientErrorRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 프론트엔드 클라이언트 에러 리포트 수집 (Sentry 미설정 환경용 경량 폴백).
 * 별도 영속화 없이 애플리케이션 로그(prod: CloudWatch)에 남긴다.
 * Sentry가 켜져 있으면 FE가 이 경로를 호출하지 않으므로 중복되지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClientErrorService {

    public void record(ClientErrorRequest.Report report, String clientIp) {
        log.warn(
                "[client-error] kind={} release={} ip={} url={} ua={} message={}\nstack={}\ncomponentStack={}",
                report.getKind(),
                report.getRelease(),
                clientIp,
                report.getUrl(),
                report.getUserAgent(),
                report.getMessage(),
                report.getStack(),
                report.getComponentStack());
    }
}
