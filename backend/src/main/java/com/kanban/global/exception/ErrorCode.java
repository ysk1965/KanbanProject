package com.kanban.global.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {

    // Common
    INVALID_INPUT_VALUE(HttpStatus.BAD_REQUEST, "C001", "잘못된 입력값입니다"),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "C002", "서버 오류가 발생했습니다"),

    // Auth
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "A001", "이미 사용 중인 이메일입니다"),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "A002", "이메일 또는 비밀번호가 올바르지 않습니다"),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "A003", "유효하지 않은 토큰입니다"),
    EXPIRED_TOKEN(HttpStatus.UNAUTHORIZED, "A004", "만료된 토큰입니다"),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "A005", "인증이 필요합니다"),

    // User
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "U001", "사용자를 찾을 수 없습니다"),

    // Board
    BOARD_NOT_FOUND(HttpStatus.NOT_FOUND, "B001", "보드를 찾을 수 없습니다"),
    BOARD_ACCESS_DENIED(HttpStatus.FORBIDDEN, "B002", "보드에 접근 권한이 없습니다"),
    BOARD_SUSPENDED(HttpStatus.FORBIDDEN, "B003", "보드가 정지 상태입니다"),

    // Block
    BLOCK_NOT_FOUND(HttpStatus.NOT_FOUND, "BL001", "블록을 찾을 수 없습니다"),
    BLOCK_CANNOT_DELETE_FIXED(HttpStatus.BAD_REQUEST, "BL002", "고정 블록은 삭제할 수 없습니다"),
    BLOCK_CANNOT_MODIFY_FIXED(HttpStatus.BAD_REQUEST, "BL003", "고정 블록은 수정할 수 없습니다"),

    // Feature
    FEATURE_NOT_FOUND(HttpStatus.NOT_FOUND, "F001", "Feature를 찾을 수 없습니다"),

    // Task
    TASK_NOT_FOUND(HttpStatus.NOT_FOUND, "T001", "Task를 찾을 수 없습니다"),
    TASK_INVALID_BLOCK(HttpStatus.BAD_REQUEST, "T002", "Task를 이동할 수 없는 블록입니다"),

    // Tag
    TAG_NOT_FOUND(HttpStatus.NOT_FOUND, "TG001", "태그를 찾을 수 없습니다"),
    TAG_ALREADY_EXISTS(HttpStatus.CONFLICT, "TG002", "이미 존재하는 태그입니다"),

    // Checklist
    CHECKLIST_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "CL001", "체크리스트 항목을 찾을 수 없습니다"),

    // Member
    MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "M001", "멤버를 찾을 수 없습니다"),
    MEMBER_ALREADY_EXISTS(HttpStatus.CONFLICT, "M002", "이미 멤버입니다"),
    CANNOT_REMOVE_OWNER(HttpStatus.BAD_REQUEST, "M003", "Owner는 내보낼 수 없습니다"),
    CANNOT_CHANGE_OWNER_ROLE(HttpStatus.BAD_REQUEST, "M004", "Owner의 역할은 변경할 수 없습니다"),

    // Invite
    INVITE_LINK_NOT_FOUND(HttpStatus.NOT_FOUND, "I001", "초대 링크를 찾을 수 없습니다"),
    INVITE_LINK_EXPIRED(HttpStatus.BAD_REQUEST, "I002", "만료된 초대 링크입니다"),
    INVITE_LINK_INVALID(HttpStatus.BAD_REQUEST, "I003", "유효하지 않은 초대 링크입니다"),

    // Subscription
    SUBSCRIPTION_NOT_FOUND(HttpStatus.NOT_FOUND, "S001", "구독 정보를 찾을 수 없습니다"),
    TRIAL_EXPIRED(HttpStatus.FORBIDDEN, "S002", "체험 기간이 만료되었습니다"),
    PAYMENT_REQUIRED(HttpStatus.PAYMENT_REQUIRED, "S003", "결제가 필요합니다"),
    MEMBER_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "S004", "멤버 수 제한을 초과했습니다");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
