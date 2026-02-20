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

    // Rate Limiting
    RATE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "R001", "요청이 너무 많습니다. 잠시 후 다시 시도해주세요"),

    // Auth
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "A001", "이미 사용 중인 이메일입니다"),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "A002", "이메일 또는 비밀번호가 올바르지 않습니다"),
    WEAK_PASSWORD(HttpStatus.BAD_REQUEST, "A008", "비밀번호가 보안 요구사항을 충족하지 않습니다"),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "A003", "유효하지 않은 토큰입니다"),
    EXPIRED_TOKEN(HttpStatus.UNAUTHORIZED, "A004", "만료된 토큰입니다"),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "A005", "인증이 필요합니다"),

    // Auth - OAuth
    INVALID_GOOGLE_TOKEN(HttpStatus.UNAUTHORIZED, "A006", "유효하지 않은 Google 토큰입니다"),
    OAUTH_EMAIL_NOT_VERIFIED(HttpStatus.BAD_REQUEST, "A007", "이메일 인증이 완료되지 않았습니다"),

    // Auth - Email Verification
    EMAIL_NOT_VERIFIED(HttpStatus.FORBIDDEN, "A009", "이메일 인증이 필요합니다"),
    VERIFICATION_TOKEN_EXPIRED(HttpStatus.BAD_REQUEST, "A010", "인증 링크가 만료되었습니다"),
    VERIFICATION_TOKEN_INVALID(HttpStatus.BAD_REQUEST, "A011", "유효하지 않은 인증 링크입니다"),
    VERIFICATION_TOKEN_ALREADY_USED(HttpStatus.BAD_REQUEST, "A012", "이미 사용된 인증 링크입니다"),
    VERIFICATION_EMAIL_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "A013", "잠시 후 다시 시도해주세요"),
    ALREADY_VERIFIED(HttpStatus.BAD_REQUEST, "A014", "이미 인증된 이메일입니다"),

    // Auth - Password Reset
    PASSWORD_RESET_TOKEN_EXPIRED(HttpStatus.BAD_REQUEST, "A015", "비밀번호 재설정 링크가 만료되었습니다"),
    PASSWORD_RESET_TOKEN_INVALID(HttpStatus.BAD_REQUEST, "A016", "유효하지 않은 비밀번호 재설정 링크입니다"),
    PASSWORD_RESET_TOKEN_ALREADY_USED(HttpStatus.BAD_REQUEST, "A017", "이미 사용된 비밀번호 재설정 링크입니다"),
    PASSWORD_RESET_EMAIL_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "A018", "잠시 후 다시 시도해주세요"),

    // User
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "U001", "사용자를 찾을 수 없습니다"),
    CURRENT_PASSWORD_MISMATCH(HttpStatus.BAD_REQUEST, "U002", "현재 비밀번호가 일치하지 않습니다"),
    CANNOT_DELETE_BOARD_OWNER(HttpStatus.BAD_REQUEST, "U003", "보드 Owner는 탈퇴할 수 없습니다. 먼저 보드를 삭제하거나 Owner를 양도해주세요"),
    USER_DEACTIVATED(HttpStatus.FORBIDDEN, "U004", "비활성화된 계정입니다. 관리자에게 문의하세요"),
    USER_ALREADY_ACTIVE(HttpStatus.BAD_REQUEST, "U005", "이미 활성화된 계정입니다"),
    USER_ALREADY_DEACTIVATED(HttpStatus.BAD_REQUEST, "U006", "이미 비활성화된 계정입니다"),
    GOOGLE_USER_NO_PASSWORD(HttpStatus.BAD_REQUEST, "U007", "Google 계정은 비밀번호를 사용하지 않습니다"),
    CANNOT_DEACTIVATE_ADMIN(HttpStatus.BAD_REQUEST, "U008", "관리자 계정은 비활성화할 수 없습니다"),

    // Board
    BOARD_NOT_FOUND(HttpStatus.NOT_FOUND, "B001", "보드를 찾을 수 없습니다"),
    BOARD_ACCESS_DENIED(HttpStatus.FORBIDDEN, "B002", "보드에 접근 권한이 없습니다"),
    BOARD_SUSPENDED(HttpStatus.FORBIDDEN, "B003", "보드가 정지 상태입니다"),
    PREMIUM_FEATURE_REQUIRED(HttpStatus.FORBIDDEN, "B004", "이 기능은 Premium에서만 사용 가능합니다"),
    PERSONAL_BOARD_NO_INVITE(HttpStatus.FORBIDDEN, "B006", "개인 보드에는 멤버를 초대할 수 없습니다"),
    PERSONAL_SPACE_ALREADY_ENABLED(HttpStatus.CONFLICT, "B007", "이미 개인 공간이 활성화되어 있습니다"),

    // Block
    BLOCK_NOT_FOUND(HttpStatus.NOT_FOUND, "BL001", "블록을 찾을 수 없습니다"),
    BLOCK_CANNOT_DELETE_FIXED(HttpStatus.BAD_REQUEST, "BL002", "고정 블록은 삭제할 수 없습니다"),
    BLOCK_CANNOT_MODIFY_FIXED(HttpStatus.BAD_REQUEST, "BL003", "고정 블록은 수정할 수 없습니다"),

    // Feature
    FEATURE_NOT_FOUND(HttpStatus.NOT_FOUND, "F001", "Feature를 찾을 수 없습니다"),

    // Task
    TASK_NOT_FOUND(HttpStatus.NOT_FOUND, "T001", "Task를 찾을 수 없습니다"),
    TASK_INVALID_BLOCK(HttpStatus.BAD_REQUEST, "T002", "Task를 이동할 수 없는 블록입니다"),
    TASK_LIMIT_EXCEEDED(HttpStatus.FORBIDDEN, "T003", "Standard 보드의 Task 제한(10개)에 도달했습니다"),

    // Tag
    TAG_NOT_FOUND(HttpStatus.NOT_FOUND, "TG001", "태그를 찾을 수 없습니다"),
    TAG_ALREADY_EXISTS(HttpStatus.CONFLICT, "TG002", "이미 존재하는 태그입니다"),

    // Checklist
    CHECKLIST_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "CL001", "체크리스트 항목을 찾을 수 없습니다"),

    // Schedule
    SCHEDULE_BLOCK_NOT_FOUND(HttpStatus.NOT_FOUND, "SC001", "스케줄 블록을 찾을 수 없습니다"),

    // Note
    NOTE_NOT_FOUND(HttpStatus.NOT_FOUND, "NT001", "노트를 찾을 수 없습니다"),
    NOTE_VERSION_NOT_FOUND(HttpStatus.NOT_FOUND, "NT002", "노트 버전을 찾을 수 없습니다"),
    NOTE_COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "NT003", "노트 댓글을 찾을 수 없습니다"),
    NOTE_COMMENT_NOT_AUTHOR(HttpStatus.FORBIDDEN, "NT004", "본인의 댓글만 수정/삭제할 수 있습니다"),

    // Meeting
    MEETING_NOT_FOUND(HttpStatus.NOT_FOUND, "MT001", "회의를 찾을 수 없습니다"),

    // AI Meeting Organize
    AI_MEETING_MEMO_EMPTY(HttpStatus.BAD_REQUEST, "AM001", "회의록 메모가 비어있습니다"),
    AI_MEETING_PARSE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "AM002", "AI 응답 파싱에 실패했습니다"),

    // Transcription (STT)
    TRANSCRIPTION_FILE_EMPTY(HttpStatus.BAD_REQUEST, "TR001", "음성 파일이 비어있습니다"),
    TRANSCRIPTION_FILE_TOO_LARGE(HttpStatus.BAD_REQUEST, "TR002", "음성 파일이 100MB를 초과합니다"),
    TRANSCRIPTION_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "TR003", "음성 변환에 실패했습니다"),

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
    MEMBER_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "S004", "멤버 수 제한을 초과했습니다"),
    SEAT_LIMIT_EXCEEDED(HttpStatus.PAYMENT_REQUIRED, "S005", "시트 수가 부족합니다. 추가 시트를 구매해주세요"),
    PAYMENT_CONFIRM_FAILED(HttpStatus.BAD_GATEWAY, "S006", "결제 승인에 실패했습니다"),
    PAYMENT_AMOUNT_MISMATCH(HttpStatus.BAD_REQUEST, "S007", "결제 금액이 일치하지 않습니다"),

    // Milestone
    MILESTONE_NOT_FOUND(HttpStatus.NOT_FOUND, "MS001", "마일스톤을 찾을 수 없습니다"),
    MILESTONE_FEATURE_ALREADY_EXISTS(HttpStatus.CONFLICT, "MS002", "이미 연결된 Feature입니다"),
    MILESTONE_ALLOCATION_NOT_FOUND(HttpStatus.NOT_FOUND, "MS003", "마일스톤 할당 정보를 찾을 수 없습니다"),
    MILESTONE_ALLOCATION_ALREADY_EXISTS(HttpStatus.CONFLICT, "MS004", "이미 할당된 멤버입니다"),

    // Weight Level
    WEIGHT_LEVEL_NOT_FOUND(HttpStatus.NOT_FOUND, "W001", "가중치 레벨을 찾을 수 없습니다"),

    // Comment
    COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "CM001", "댓글을 찾을 수 없습니다"),
    COMMENT_NOT_AUTHOR(HttpStatus.FORBIDDEN, "CM002", "본인의 댓글만 수정/삭제할 수 있습니다"),

    // Daily Checklist
    DAILY_CHECKLIST_NOT_FOUND(HttpStatus.NOT_FOUND, "DC001", "데일리 체크리스트 항목을 찾을 수 없습니다"),
    DAILY_CHECKLIST_ALREADY_EXISTS(HttpStatus.CONFLICT, "DC002", "해당 날짜에 이미 추가된 체크리스트입니다"),

    // Notification
    NOTIFICATION_NOT_FOUND(HttpStatus.NOT_FOUND, "N001", "알림을 찾을 수 없습니다"),

    // File Upload
    FILE_TOO_LARGE(HttpStatus.BAD_REQUEST, "FL001", "파일 크기가 5MB를 초과합니다"),
    FILE_TYPE_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "FL002", "허용되지 않는 파일 형식입니다 (jpg/png/gif/webp만 가능)"),
    ATTACHMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "FL003", "첨부파일을 찾을 수 없습니다"),
    ATTACHMENT_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "FL004", "첨부파일은 최대 5개까지 가능합니다"),
    TEMP_FILE_NOT_FOUND(HttpStatus.BAD_REQUEST, "FL005", "업로드된 임시 파일을 찾을 수 없습니다"),

    // Admin
    ADMIN_ACCESS_DENIED(HttpStatus.FORBIDDEN, "AD001", "관리자 권한이 필요합니다"),
    CANNOT_REMOVE_LAST_ADMIN(HttpStatus.BAD_REQUEST, "AD002", "마지막 관리자는 역할을 변경할 수 없습니다"),
    CANNOT_DEMOTE_SELF(HttpStatus.BAD_REQUEST, "AD003", "자신의 관리자 역할은 변경할 수 없습니다"),
    CANNOT_DELETE_ACTIVE_USER(HttpStatus.BAD_REQUEST, "AD004", "활성 상태의 사용자는 삭제할 수 없습니다. 먼저 비활성화하세요"),
    CANNOT_DELETE_ADMIN_USER(HttpStatus.BAD_REQUEST, "AD005", "관리자 계정은 삭제할 수 없습니다"),

    // Inquiry
    INQUIRY_NOT_FOUND(HttpStatus.NOT_FOUND, "IQ001", "문의사항을 찾을 수 없습니다"),
    INQUIRY_ACCESS_DENIED(HttpStatus.FORBIDDEN, "IQ002", "해당 문의에 접근할 수 없습니다"),
    INQUIRY_CLOSED(HttpStatus.BAD_REQUEST, "IQ003", "종료된 문의에는 답변할 수 없습니다"),

    // Slack Integration
    SLACK_WEBHOOK_NOT_FOUND(HttpStatus.NOT_FOUND, "SK001", "Slack 웹훅 설정을 찾을 수 없습니다"),
    SLACK_WEBHOOK_INVALID_URL(HttpStatus.BAD_REQUEST, "SK002", "유효하지 않은 Slack 웹훅 URL입니다"),
    SLACK_WEBHOOK_TEST_FAILED(HttpStatus.BAD_GATEWAY, "SK003", "Slack 테스트 메시지 전송에 실패했습니다"),
    SLACK_PREMIUM_REQUIRED(HttpStatus.FORBIDDEN, "SK004", "Slack 연동은 Premium에서만 사용 가능합니다"),

    // System
    ANNOUNCEMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "SY001", "공지사항을 찾을 수 없습니다"),
    SYSTEM_UNDER_MAINTENANCE(HttpStatus.SERVICE_UNAVAILABLE, "SY002", "시스템 점검 중입니다"),
    SYSTEM_CONFIG_NOT_FOUND(HttpStatus.NOT_FOUND, "SY003", "시스템 설정을 찾을 수 없습니다"),

    // AI Note Organize
    AI_NOTE_CONTENT_EMPTY(HttpStatus.BAD_REQUEST, "AN001", "노트 내용이 비어있습니다"),
    AI_NOTE_PARSE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "AN002", "AI 응답 파싱에 실패했습니다"),

    // AI Report
    AI_REPORT_NOT_FOUND(HttpStatus.NOT_FOUND, "AR001", "보고서를 찾을 수 없습니다"),
    AI_REPORT_GENERATION_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "AR002", "AI 보고서 생성에 실패했습니다"),
    AI_SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "AR003", "AI 서비스가 일시적으로 이용 불가합니다"),

    // AI Credits
    AI_CREDITS_EXHAUSTED(HttpStatus.PAYMENT_REQUIRED, "AC001", "AI 크레딧이 소진되었습니다. 추가 크레딧을 구매해주세요"),
    AI_CREDIT_PURCHASE_AMOUNT_INVALID(HttpStatus.BAD_REQUEST, "AC002", "유효하지 않은 크레딧 구매 금액입니다"),
    AI_CREDIT_PURCHASE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "AC003", "크레딧 구매 처리 중 오류가 발생했습니다"),
    PERSONAL_AI_CREDITS_EXHAUSTED(HttpStatus.PAYMENT_REQUIRED, "AC004", "개인 AI 크레딧이 소진되었습니다"),

    // AI Feature Decompose
    AI_FEATURE_CONTENT_EMPTY(HttpStatus.BAD_REQUEST, "AF001", "피처 내용이 비어있습니다"),
    AI_FEATURE_DECOMPOSE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "AF002", "AI 태스크 분해에 실패했습니다"),

    // AI Comment Summary
    AI_COMMENT_SUMMARY_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "ACS001", "AI 댓글 요약에 실패했습니다"),
    AI_COMMENT_INSUFFICIENT(HttpStatus.BAD_REQUEST, "ACS002", "요약하기에 댓글 수가 부족합니다"),

    // Personal
    PERSONAL_EVENT_NOT_FOUND(HttpStatus.NOT_FOUND, "PE001", "개인 일정을 찾을 수 없습니다"),
    PERSONAL_ACCESS_DENIED(HttpStatus.FORBIDDEN, "PE002", "본인의 데이터만 접근할 수 있습니다"),
    PERSONAL_TASK_NOT_FOUND(HttpStatus.NOT_FOUND, "PT001", "개인 할 일을 찾을 수 없습니다"),
PERSONAL_TAG_NOT_FOUND(HttpStatus.NOT_FOUND, "PT003", "태그를 찾을 수 없습니다"),
    PERSONAL_TAG_DUPLICATE(HttpStatus.CONFLICT, "PT004", "이미 동일한 이름의 태그가 존재합니다"),
    PERSONAL_TAG_ALREADY_ASSIGNED(HttpStatus.CONFLICT, "PT005", "이미 할당된 태그입니다"),
    PERSONAL_HABIT_NOT_FOUND(HttpStatus.NOT_FOUND, "PH001", "습관을 찾을 수 없습니다"),

    // Diary
    DIARY_NOT_FOUND(HttpStatus.NOT_FOUND, "DI001", "일기를 찾을 수 없습니다"),
    DIARY_ALREADY_EXISTS(HttpStatus.CONFLICT, "DI002", "해당 날짜에 이미 일기가 존재합니다"),
    DIARY_ACCESS_DENIED(HttpStatus.FORBIDDEN, "DI003", "본인의 일기만 접근할 수 있습니다"),
    DIARY_ALREADY_COMPLETED(HttpStatus.BAD_REQUEST, "DI004", "이미 완성된 일기입니다"),

    // Diary Voice
    DIARY_VOICE_FILE_EMPTY(HttpStatus.BAD_REQUEST, "DV001", "음성 파일이 비어있습니다"),
    DIARY_VOICE_FILE_TOO_LARGE(HttpStatus.BAD_REQUEST, "DV002", "음성 파일이 25MB를 초과합니다"),
    DIARY_VOICE_STT_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "DV003", "음성 인식에 실패했습니다"),
    DIARY_VOICE_TTS_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "DV004", "음성 생성에 실패했습니다");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
