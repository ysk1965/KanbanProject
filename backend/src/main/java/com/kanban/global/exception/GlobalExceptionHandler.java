package com.kanban.global.exception;

import io.sentry.Sentry;
import io.sentry.SentryLevel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(SeatLimitException.class)
    public ResponseEntity<ErrorResponse> handleSeatLimitException(SeatLimitException e) {
        log.warn("Seat limit exceeded: seats={}, billable={}", e.getSeatCount(), e.getBillableMemberCount());
        ErrorCode errorCode = e.getErrorCode();

        Map<String, String> seatInfo = new HashMap<>();
        seatInfo.put("seat_count", String.valueOf(e.getSeatCount()));
        seatInfo.put("billable_member_count", String.valueOf(e.getBillableMemberCount()));
        seatInfo.put("monthly_price_per_seat", String.valueOf(e.getMonthlyPricePerSeat()));
        seatInfo.put("yearly_price_per_seat", String.valueOf(e.getYearlyPricePerSeat()));

        Sentry.withScope(scope -> {
            scope.setLevel(SentryLevel.WARNING);
            scope.setTag("error.code", errorCode.getCode());
            scope.setTag("error.type", "seat_limit");
            Sentry.captureException(e);
        });

        return ResponseEntity
                .status(errorCode.getStatus())
                .body(ErrorResponse.of(errorCode, seatInfo));
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusinessException(BusinessException e) {
        log.warn("Business exception: {}", e.getMessage());
        ErrorCode errorCode = e.getErrorCode();

        // Sentry에 비즈니스 예외도 기록 (레벨: warning)
        Sentry.withScope(scope -> {
            scope.setLevel(SentryLevel.WARNING);
            scope.setTag("error.code", errorCode.getCode());
            scope.setTag("error.type", "business");
            Sentry.captureException(e);
        });

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

        // Sentry에 검증 예외 기록 (레벨: warning)
        Sentry.withScope(scope -> {
            scope.setLevel(SentryLevel.WARNING);
            scope.setTag("error.type", "validation");
            scope.setExtra("validation_errors", errors.toString());
            Sentry.captureException(e);
        });

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ErrorResponse.of(ErrorCode.INVALID_INPUT_VALUE, errors));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception e) {
        log.error("Unexpected exception", e);

        // Sentry에 예상치 못한 예외 기록 (레벨: error)
        Sentry.withScope(scope -> {
            scope.setLevel(SentryLevel.ERROR);
            scope.setTag("error.type", "unexpected");
            Sentry.captureException(e);
        });

        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErrorResponse.of(ErrorCode.INTERNAL_SERVER_ERROR));
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
