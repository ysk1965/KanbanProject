package com.kanban.global.exception;

import com.kanban.domain.monitoring.service.MonitoringAlertService;
import com.kanban.global.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;

import java.io.IOException;
import java.nio.channels.ClosedChannelException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final MonitoringAlertService monitoringAlertService;

    @ExceptionHandler(OrgSeatLimitException.class)
    public ResponseEntity<ErrorResponse> handleOrgSeatLimitException(OrgSeatLimitException e) {
        log.warn("Org seat limit exceeded: orgId={}, seats={}, active={}",
                e.getOrgId(), e.getSeatCount(), e.getActiveMemberCount());
        ErrorCode errorCode = e.getErrorCode();

        Map<String, String> seatInfo = new HashMap<>();
        seatInfo.put("org_id", e.getOrgId());
        seatInfo.put("seat_count", String.valueOf(e.getSeatCount()));
        seatInfo.put("active_member_count", String.valueOf(e.getActiveMemberCount()));
        seatInfo.put("monthly_price_per_seat", String.valueOf(e.getMonthlyPricePerSeat()));
        seatInfo.put("yearly_price_per_seat", String.valueOf(e.getYearlyPricePerSeat()));
        seatInfo.put("is_org_admin", String.valueOf(e.isOrgAdmin()));

        return ResponseEntity
                .status(errorCode.getStatus())
                .body(ErrorResponse.of(errorCode, seatInfo));
    }

    @ExceptionHandler(SeatLimitException.class)
    public ResponseEntity<ErrorResponse> handleSeatLimitException(SeatLimitException e) {
        log.warn("Seat limit exceeded: seats={}, billable={}", e.getSeatCount(), e.getBillableMemberCount());
        ErrorCode errorCode = e.getErrorCode();

        Map<String, String> seatInfo = new HashMap<>();
        seatInfo.put("seat_count", String.valueOf(e.getSeatCount()));
        seatInfo.put("billable_member_count", String.valueOf(e.getBillableMemberCount()));
        seatInfo.put("monthly_price_per_seat", String.valueOf(e.getMonthlyPricePerSeat()));
        seatInfo.put("yearly_price_per_seat", String.valueOf(e.getYearlyPricePerSeat()));

        return ResponseEntity
                .status(errorCode.getStatus())
                .body(ErrorResponse.of(errorCode, seatInfo));
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException e) {
        log.warn("Business exception: {}", e.getMessage());
        ErrorCode errorCode = e.getErrorCode();

        return ResponseEntity
                .status(errorCode.getStatus())
                .body(ErrorResponse.of(errorCode));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(MethodArgumentNotValidException e) {
        Map<String, String> errors = new HashMap<>();
        e.getBindingResult().getAllErrors().forEach(error -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            errors.put(fieldName, errorMessage);
        });

        log.warn("Validation exception: {}", errors);

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(ErrorCode.INVALID_INPUT_VALUE, errors));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorResponse> handleNoResourceFound(NoResourceFoundException e) {
        log.debug("No resource found: {}", e.getMessage());
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(ErrorResponse.of(ErrorCode.INTERNAL_SERVER_ERROR));
    }

    /**
     * 클라이언트가 응답을 받기 전에 연결을 끊었다. 서버 장애가 아니다.
     *
     * <p>새로고침·페이지 이탈·요청 취소, 또는 게이트웨이 idle timeout으로 소켓이 먼저 닫히면
     * 응답을 쓰는 순간 이 예외가 난다. 처리 자체는 이미 끝났고 되돌릴 것도 없는데, 여기까지
     * 흘려보내면 CRITICAL 슬랙 + 이메일이 나간다 — 사람이 새로고침 한 번 할 때마다 울리는
     * 알림은 정작 필요할 때 무시당한다.
     *
     * <p>본문을 싣지 않는다. 읽을 상대가 이미 없어서 쓰기가 또 실패할 뿐이다.
     */
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public ResponseEntity<Void> handleClientDisconnect(AsyncRequestNotUsableException e,
                                                       HttpServletRequest request) {
        log.debug("Client disconnected before response: {} {} ({})",
                request.getMethod(), request.getRequestURI(), e.getMessage());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception e, HttpServletRequest request) {
        String requestInfo = request.getMethod() + " " + request.getRequestURI();
        if (request.getQueryString() != null) {
            requestInfo += "?" + request.getQueryString();
        }

        // 끊긴 연결은 컨테이너별로 다른 예외로 올라온다(Tomcat ClientAbortException 등)
        if (isClientDisconnect(e)) {
            log.debug("Client disconnected before response: {} ({})", requestInfo, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }

        String userInfo = extractUserInfo();
        log.error("Unexpected exception at {} by {}", requestInfo, userInfo, e);

        monitoringAlertService.sendUnexpectedErrorAlert(e, requestInfo, userInfo);

        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of(ErrorCode.INTERNAL_SERVER_ERROR));
    }

    /**
     * 상대가 먼저 끊어서 난 예외인가.
     *
     * <p>원인 사슬을 훑는다 — 끊긴 연결은 대개 {@code ClosedChannelException}이나
     * "Broken pipe" IOException으로 감싸여 올라온다. 판정을 좁게 잡는다: 여기서 넓게 삼키면
     * 진짜 I/O 장애가 알림 없이 사라진다.
     */
    private boolean isClientDisconnect(Throwable e) {
        for (Throwable t = e; t != null && t != t.getCause(); t = t.getCause()) {
            if (t instanceof AsyncRequestNotUsableException || t instanceof ClosedChannelException) {
                return true;
            }
            if (t.getClass().getName().endsWith("ClientAbortException")) {
                return true;
            }
            String message = t.getMessage();
            if (t instanceof IOException && message != null
                    && (message.contains("Broken pipe") || message.contains("Connection reset"))) {
                return true;
            }
        }
        return false;
    }

    private String extractUserInfo() {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof UserPrincipal principal) {
                return principal.getEmail() != null ? principal.getEmail() : principal.getUserId();
            }
        } catch (Exception ignored) {}
        return "anonymous";
    }

    public record ErrorResponse(
            String code,
            String message,
            Map<String, String> errors,
            LocalDateTime timestamp
    ) {
        public static ErrorResponse of(ErrorCode errorCode) {
            return new ErrorResponse(
                    errorCode.getCode(),
                    errorCode.getMessage(),
                    null,
                    LocalDateTime.now(ZoneOffset.UTC)
            );
        }

        public static ErrorResponse of(ErrorCode errorCode, Map<String, String> errors) {
            return new ErrorResponse(
                    errorCode.getCode(),
                    errorCode.getMessage(),
                    errors,
                    LocalDateTime.now(ZoneOffset.UTC)
            );
        }
    }
}
