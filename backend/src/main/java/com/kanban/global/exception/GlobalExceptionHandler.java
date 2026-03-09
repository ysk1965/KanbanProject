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
import org.springframework.web.servlet.resource.NoResourceFoundException;

import jakarta.servlet.http.HttpServletRequest;

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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception e, HttpServletRequest request) {
        String requestInfo = request.getMethod() + " " + request.getRequestURI();
        if (request.getQueryString() != null) {
            requestInfo += "?" + request.getQueryString();
        }
        String userInfo = extractUserInfo();
        log.error("Unexpected exception at {} by {}", requestInfo, userInfo, e);

        monitoringAlertService.sendUnexpectedErrorAlert(e, requestInfo, userInfo);

        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of(ErrorCode.INTERNAL_SERVER_ERROR));
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
