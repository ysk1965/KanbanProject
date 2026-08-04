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

    // Auth - Personal Access Token
    PAT_NOT_FOUND(HttpStatus.NOT_FOUND, "A019", "액세스 토큰을 찾을 수 없습니다"),
    PAT_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "A020", "발급 가능한 액세스 토큰 수를 초과했습니다"),

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
    BOARD_ALREADY_DELETED(HttpStatus.CONFLICT, "B008", "이미 삭제된 보드입니다"),
    BOARD_NOT_DELETED(HttpStatus.CONFLICT, "B009", "삭제되지 않은 보드입니다"),

    // Board Join Request
    JOIN_REQUEST_ALREADY_EXISTS(HttpStatus.CONFLICT, "B010", "이미 참가 요청이 존재합니다"),
    JOIN_REQUEST_NOT_FOUND(HttpStatus.NOT_FOUND, "B011", "참가 요청을 찾을 수 없습니다"),
    JOIN_REQUEST_NOT_ORG_MEMBER(HttpStatus.FORBIDDEN, "B012", "조직 구성원만 참가 요청을 할 수 있습니다"),
    JOIN_REQUEST_ALREADY_MEMBER(HttpStatus.CONFLICT, "B013", "이미 보드 멤버입니다"),

    // Block
    BLOCK_NOT_FOUND(HttpStatus.NOT_FOUND, "BL001", "블록을 찾을 수 없습니다"),
    BLOCK_CANNOT_DELETE_FIXED(HttpStatus.BAD_REQUEST, "BL002", "고정 블록은 삭제할 수 없습니다"),
    BLOCK_CANNOT_MODIFY_FIXED(HttpStatus.BAD_REQUEST, "BL003", "고정 블록은 수정할 수 없습니다"),
    BLOCK_CANNOT_HIDE_FIXED(HttpStatus.BAD_REQUEST, "BL004", "고정 블록은 숨길 수 없습니다"),

    // Feature
    FEATURE_NOT_FOUND(HttpStatus.NOT_FOUND, "F001", "Feature를 찾을 수 없습니다"),
    CANNOT_MODIFY_INBOX_FEATURE(HttpStatus.BAD_REQUEST, "F002", "미분류 피처는 수정/삭제할 수 없습니다"),

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

    // Job Role
    JOB_ROLE_NOT_FOUND(HttpStatus.NOT_FOUND, "JR001", "직군을 찾을 수 없습니다"),
    JOB_ROLE_ALREADY_EXISTS(HttpStatus.CONFLICT, "JR002", "이미 존재하는 직군 이름입니다"),

    // Contractor
    CONTRACTOR_NOT_FOUND(HttpStatus.NOT_FOUND, "C001", "외주를 찾을 수 없습니다"),
    CONTRACTOR_ALREADY_EXISTS(HttpStatus.CONFLICT, "C002", "이미 존재하는 외주 이름입니다"),
    CONTRACTOR_MANAGER_INVALID(HttpStatus.BAD_REQUEST, "C003", "유효하지 않은 외주 관리자입니다"),

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
    INVALID_WEBHOOK_SIGNATURE(HttpStatus.UNAUTHORIZED, "S008", "유효하지 않은 Webhook 서명입니다"),

    // Milestone
    MILESTONE_NOT_FOUND(HttpStatus.NOT_FOUND, "MS001", "마일스톤을 찾을 수 없습니다"),
    MILESTONE_FEATURE_ALREADY_EXISTS(HttpStatus.CONFLICT, "MS002", "이미 연결된 Feature입니다"),
    MILESTONE_ALLOCATION_NOT_FOUND(HttpStatus.NOT_FOUND, "MS003", "마일스톤 할당 정보를 찾을 수 없습니다"),
    MILESTONE_ALLOCATION_ALREADY_EXISTS(HttpStatus.CONFLICT, "MS004", "이미 할당된 멤버입니다"),

    // Sprint
    SPRINT_NOT_FOUND(HttpStatus.NOT_FOUND, "SP001", "스프린트를 찾을 수 없습니다"),
    SPRINT_NOT_ENABLED(HttpStatus.BAD_REQUEST, "SP002", "이 마일스톤은 스프린트가 활성화되어 있지 않습니다"),
    SPRINT_TASK_NOT_IN_MILESTONE(HttpStatus.BAD_REQUEST, "SP003", "해당 마일스톤에 속한 태스크가 아닙니다"),
    SPRINT_INVALID_STAGE(HttpStatus.BAD_REQUEST, "SP004", "유효하지 않은 스프린트 단계입니다"),
    SPRINT_NOT_ACTIVE(HttpStatus.BAD_REQUEST, "SP005", "이미 종료된 스프린트입니다"),
    // SP006은 "모든 카드가 Done이어야 종료" 게이트에 쓰이던 코드. 미완료 태스크를 다음 스프린트로
    // 이월하는 방식으로 바뀌면서 종료를 막을 이유가 없어져 회수했다. (번호는 재사용하지 않는다)
    SPRINT_REACTIVATION_BLOCKED(HttpStatus.CONFLICT, "SP007", "먼저 재활성화된 스프린트를 종료해 주세요"),
    SPRINT_ALREADY_ACTIVE(HttpStatus.BAD_REQUEST, "SP008", "이미 진행 중인 스프린트입니다"),
    SPRINT_NOT_IN_REACTIVATION(HttpStatus.BAD_REQUEST, "SP009", "재활성화 중인 스프린트가 아닙니다"),
    SPRINT_COLUMN_NOT_FOUND(HttpStatus.NOT_FOUND, "SP010", "스프린트 컬럼을 찾을 수 없습니다"),
    SPRINT_COLUMN_ANCHOR_IMMUTABLE(HttpStatus.BAD_REQUEST, "SP011", "Sprint · Done 컬럼은 수정하거나 삭제할 수 없습니다"),
    SPRINT_COLUMN_NAME_REQUIRED(HttpStatus.BAD_REQUEST, "SP012", "컬럼 이름을 입력해 주세요"),

    // Calendar Event (워크로드 특별 일정)
    CALENDAR_EVENT_NOT_FOUND(HttpStatus.NOT_FOUND, "CE001", "특별 일정을 찾을 수 없습니다"),

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
    FILE_TOO_LARGE(HttpStatus.BAD_REQUEST, "FL001", "파일 크기가 30MB를 초과합니다"),
    FILE_TYPE_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "FL002", "허용되지 않는 파일 형식입니다 (이미지/영상/PDF/Office/텍스트만 가능)"),
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
    SLACK_APP_NOT_INSTALLED(HttpStatus.NOT_FOUND, "SK005", "Slack 앱이 설치되어 있지 않습니다"),
    SLACK_OAUTH_STATE_INVALID(HttpStatus.BAD_REQUEST, "SK006", "유효하지 않은 OAuth 상태입니다"),
    SLACK_OAUTH_FAILED(HttpStatus.BAD_GATEWAY, "SK007", "Slack OAuth 인증에 실패했습니다"),
    SLACK_API_ERROR(HttpStatus.BAD_GATEWAY, "SK008", "Slack API 호출에 실패했습니다"),
    SLACK_SIGNATURE_INVALID(HttpStatus.UNAUTHORIZED, "SK009", "유효하지 않은 Slack 서명입니다"),
    SLACK_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "SK011", "Slack API 요청 제한에 도달했습니다"),
    SLACK_TOKEN_DECRYPTION_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "SK012", "Slack 토큰 복호화에 실패했습니다"),
    SLACK_USER_NOT_LINKED(HttpStatus.BAD_REQUEST, "SK013", "Slack 계정이 연결되지 않았습니다"),

    // Discord Integration
    DISCORD_BOT_NOT_CONFIGURED(HttpStatus.NOT_FOUND, "DK001", "Discord Bot이 설정되지 않았습니다"),
    DISCORD_OAUTH_FAILED(HttpStatus.BAD_GATEWAY, "DK002", "Discord OAuth 인증에 실패했습니다"),
    DISCORD_API_ERROR(HttpStatus.BAD_GATEWAY, "DK003", "Discord API 호출에 실패했습니다"),
    DISCORD_PREMIUM_REQUIRED(HttpStatus.FORBIDDEN, "DK004", "Discord 연동은 Premium에서만 사용 가능합니다"),
    DISCORD_USER_NOT_LINKED(HttpStatus.NOT_FOUND, "DK005", "Discord 계정이 연동되지 않았습니다"),
    DISCORD_USER_ALREADY_LINKED(HttpStatus.CONFLICT, "DK006", "이미 Discord 계정이 연동되어 있습니다"),
    DISCORD_OAUTH_STATE_INVALID(HttpStatus.BAD_REQUEST, "DK007", "유효하지 않은 OAuth 상태입니다"),

    // JIRA Integration
    JIRA_NOT_CONFIGURED(HttpStatus.NOT_FOUND, "JI001", "JIRA 연동이 설정되지 않았습니다"),
    JIRA_ALREADY_CONFIGURED(HttpStatus.CONFLICT, "JI002", "이미 JIRA가 연결되어 있습니다"),
    JIRA_CONNECTION_FAILED(HttpStatus.BAD_GATEWAY, "JI003", "JIRA 연결에 실패했습니다. 사이트 주소·프로젝트 키·토큰을 확인해주세요"),
    JIRA_API_ERROR(HttpStatus.BAD_GATEWAY, "JI004", "JIRA API 호출에 실패했습니다"),
    JIRA_AUTH_FAILED(HttpStatus.UNAUTHORIZED, "JI005", "JIRA 인증에 실패했습니다. API 토큰을 확인해주세요"),
    JIRA_PROJECT_NOT_FOUND(HttpStatus.NOT_FOUND, "JI006", "JIRA 프로젝트를 찾을 수 없습니다"),
    JIRA_ISSUE_NOT_FOUND(HttpStatus.NOT_FOUND, "JI007", "JIRA 이슈를 찾을 수 없습니다"),
    JIRA_TRANSITION_NOT_AVAILABLE(HttpStatus.UNPROCESSABLE_ENTITY, "JI008", "해당 이슈에 사용 가능한 완료 전환이 없습니다"),
    JIRA_IMPORT_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "JI009", "JIRA 이슈 가져오기에 실패했습니다"),
    JIRA_AUTOFIX_NO_LINKED_ISSUES(HttpStatus.BAD_REQUEST, "JI010", "트리아지할 JIRA 연동 이슈가 없습니다. 먼저 이슈를 가져와주세요"),
    JIRA_AUTOFIX_TRIAGE_FAILED(HttpStatus.BAD_GATEWAY, "JI011", "이슈 트리아지에 실패했습니다 — 다시 시도해주세요"),
    JIRA_AUTOFIX_INVALID_VERDICT(HttpStatus.BAD_REQUEST, "JI012", "판정 값이 올바르지 않습니다 (CANDIDATE/CONDITIONAL/EXCLUDED)"),
    JIRA_AUTOFIX_NO_REPO(HttpStatus.BAD_REQUEST, "JI013", "보드에 연결된 GitHub 저장소가 없습니다. 먼저 저장소를 연결해주세요"),
    JIRA_AUTOFIX_AMBIGUOUS_REPO(HttpStatus.BAD_REQUEST, "JI014", "연결된 저장소가 여러 개입니다. 자동수정 대상 저장소를 하나만 남겨주세요"),
    JIRA_AUTOFIX_WORKFLOW_NOT_FOUND(HttpStatus.BAD_REQUEST, "JI015", "대상 저장소의 기본 브랜치에 자동수정 워크플로가 없습니다"),
    JIRA_AUTOFIX_JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "JI016", "자동수정 작업을 찾을 수 없습니다"),
    JIRA_AUTOFIX_JOB_NOT_CANCELLABLE(HttpStatus.CONFLICT, "JI017", "이미 러너로 넘어간 작업은 취소할 수 없습니다"),

    // System
    ANNOUNCEMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "SY001", "공지사항을 찾을 수 없습니다"),
    SYSTEM_UNDER_MAINTENANCE(HttpStatus.SERVICE_UNAVAILABLE, "SY002", "시스템 점검 중입니다"),
    SYSTEM_CONFIG_NOT_FOUND(HttpStatus.NOT_FOUND, "SY003", "시스템 설정을 찾을 수 없습니다"),

    // AI API Key 관리 (관리자)
    AI_KEY_UNKNOWN_PROVIDER(HttpStatus.BAD_REQUEST, "AK001", "지원하지 않는 AI 프로바이더입니다"),
    AI_KEY_INVALID_FORMAT(HttpStatus.BAD_REQUEST, "AK002", "API 키 형식이 올바르지 않습니다"),
    AI_KEY_REJECTED(HttpStatus.BAD_REQUEST, "AK003", "제공한 API 키가 프로바이더에서 거부되었습니다"),
    AI_KEY_VERIFICATION_UNAVAILABLE(HttpStatus.BAD_GATEWAY, "AK004", "AI 프로바이더에 연결할 수 없어 키를 검증하지 못했습니다"),
    AI_KEY_ENCRYPTION_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "AK005", "CONFIG_ENCRYPTION_KEY가 설정되지 않아 키를 저장할 수 없습니다"),
    AI_KEY_NOT_CONFIGURED(HttpStatus.NOT_FOUND, "AK006", "설정된 API 키가 없습니다"),

    // AI 프로바이더 호출 (상태별 구분이 필요한 경로에서 사용)
    AI_PROVIDER_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "AP001", "AI 프로바이더 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요"),
    AI_PROVIDER_UNAVAILABLE(HttpStatus.BAD_GATEWAY, "AP002", "AI 프로바이더 호출에 실패했습니다"),

    // 커밋 플랜 (MILKYWAY Unity 에디터 툴)
    COMMIT_PLAN_GROUPS_REQUIRED(HttpStatus.BAD_REQUEST, "CP001", "변경 파일 그룹(groups)이 필요합니다"),
    COMMIT_PLAN_REFUSED(HttpStatus.UNPROCESSABLE_ENTITY, "CP002", "모델이 요청 처리를 거절했습니다 — 로컬 분할로 진행해주세요"),
    COMMIT_PLAN_TRUNCATED(HttpStatus.BAD_GATEWAY, "CP003", "플랜이 출력 한도를 넘었습니다 — 변경을 나눠서 시도해주세요"),
    COMMIT_PLAN_MALFORMED(HttpStatus.BAD_GATEWAY, "CP004", "AI 응답을 해석할 수 없습니다 — 다시 시도해주세요"),

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

    // AI Checklist Decompose
    AI_CHECKLIST_CONTENT_EMPTY(HttpStatus.BAD_REQUEST, "ACL001", "태스크 내용이 비어있습니다"),
    AI_CHECKLIST_DECOMPOSE_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "ACL002", "AI 체크리스트 분해에 실패했습니다"),

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
    DIARY_VOICE_TTS_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "DV004", "음성 생성에 실패했습니다"),

    // Custom Icon
    CUSTOMICON_REFERENCE_NOT_FOUND(HttpStatus.NOT_FOUND, "CI001", "레퍼런스 이미지를 찾을 수 없습니다"),
    CUSTOMICON_GENERATION_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "CI002", "아이콘 생성에 실패했습니다"),
    CUSTOMICON_IMAGE_PROCESSING_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "CI003", "이미지 처리에 실패했습니다"),
    CUSTOMICON_STYLE_ANALYSIS_FAILED(HttpStatus.INTERNAL_SERVER_ERROR, "CI004", "스타일 분석에 실패했습니다"),

    // Organization
    ORGANIZATION_NOT_FOUND(HttpStatus.NOT_FOUND, "O017", "조직을 찾을 수 없습니다"),
    ORGANIZATION_ALREADY_DELETED(HttpStatus.CONFLICT, "O018", "이미 삭제된 조직입니다"),
    ORG_NOT_FOUND(HttpStatus.NOT_FOUND, "O001", "조직을 찾을 수 없습니다"),
    ORG_ACCESS_DENIED(HttpStatus.FORBIDDEN, "O002", "조직에 접근 권한이 없습니다"),
    ORG_ADMIN_REQUIRED(HttpStatus.FORBIDDEN, "O003", "조직 관리자 권한이 필요합니다"),
    ORG_OWNER_REQUIRED(HttpStatus.FORBIDDEN, "O004", "조직 소유자 권한이 필요합니다"),
    ORG_MEMBER_ALREADY_EXISTS(HttpStatus.CONFLICT, "O005", "이미 조직 구성원입니다"),
    ORG_MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "O006", "조직 구성원을 찾을 수 없습니다"),
    CANNOT_REMOVE_ORG_OWNER(HttpStatus.BAD_REQUEST, "O007", "조직 소유자는 제거할 수 없습니다"),
    CANNOT_CHANGE_ORG_OWNER_ROLE(HttpStatus.BAD_REQUEST, "O008", "조직 소유자의 역할은 변경할 수 없습니다"),
    CANNOT_TRANSFER_TO_SELF(HttpStatus.BAD_REQUEST, "O009", "본인에게 소유권을 이양할 수 없습니다"),
    CANNOT_DEACTIVATE_ORG_OWNER(HttpStatus.BAD_REQUEST, "O010", "조직 소유자는 계정을 비활성화할 수 없습니다. 먼저 소유권을 이양해주세요"),

    // Organization - Board
    NOT_ORG_MEMBER_FOR_BOARD(HttpStatus.FORBIDDEN, "O011", "조직 보드에 참여하려면 조직 구성원이어야 합니다"),
    BOARD_NOT_ELIGIBLE_FOR_ORG(HttpStatus.BAD_REQUEST, "O012", "보드를 조직에 편입할 수 없습니다. 모든 보드 멤버가 조직 구성원이어야 합니다"),
    BOARD_ALREADY_IN_ORG(HttpStatus.CONFLICT, "O013", "이미 조직에 소속된 보드입니다"),
    BOARD_NOT_IN_ORG(HttpStatus.BAD_REQUEST, "O014", "조직에 소속되지 않은 보드입니다"),
    CANNOT_REMOVE_BOARD_OWNER_FROM_ORG(HttpStatus.BAD_REQUEST, "O015", "조직 보드의 Owner인 구성원은 제거할 수 없습니다. 먼저 보드 Owner를 변경해주세요"),
    ALREADY_IN_ORGANIZATION(HttpStatus.CONFLICT, "O016", "이미 소속된 조직이 있습니다. 기존 조직을 탈퇴한 후 다시 시도해주세요"),

    // Organization - Invite
    ORG_INVITE_NOT_FOUND(HttpStatus.NOT_FOUND, "OI001", "조직 초대 링크를 찾을 수 없습니다"),
    ORG_INVITE_EXPIRED(HttpStatus.BAD_REQUEST, "OI002", "만료된 조직 초대 링크입니다"),
    ORG_INVITE_INVALID(HttpStatus.BAD_REQUEST, "OI003", "유효하지 않은 조직 초대 링크입니다"),

    // Organization - Announcement
    ORG_ANNOUNCEMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "OA001", "공지사항을 찾을 수 없습니다"),
    ORG_ANNOUNCEMENT_COMMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "OA002", "공지사항 댓글을 찾을 수 없습니다"),
    ORG_ANNOUNCEMENT_COMMENT_NOT_AUTHOR(HttpStatus.FORBIDDEN, "OA003", "본인의 댓글만 수정/삭제할 수 있습니다"),

    // Organization - Department / Job Group
    ORG_DEPARTMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "OD001", "부서를 찾을 수 없습니다"),
    ORG_DEPARTMENT_ALREADY_EXISTS(HttpStatus.CONFLICT, "OD002", "이미 존재하는 부서명입니다"),
    ORG_JOB_GROUP_NOT_FOUND(HttpStatus.NOT_FOUND, "OJ001", "직무그룹을 찾을 수 없습니다"),
    ORG_JOB_GROUP_ALREADY_EXISTS(HttpStatus.CONFLICT, "OJ002", "이미 존재하는 직무그룹명입니다"),

    ORG_POSITION_NOT_FOUND(HttpStatus.NOT_FOUND, "OP001", "직책을 찾을 수 없습니다"),
    ORG_POSITION_ALREADY_EXISTS(HttpStatus.CONFLICT, "OP002", "이미 존재하는 직책명입니다"),
    ORG_TITLE_NOT_FOUND(HttpStatus.NOT_FOUND, "OT001", "직위를 찾을 수 없습니다"),
    ORG_TITLE_ALREADY_EXISTS(HttpStatus.CONFLICT, "OT002", "이미 존재하는 직위명입니다"),
    ORG_GRADE_NOT_FOUND(HttpStatus.NOT_FOUND, "OG001", "직급을 찾을 수 없습니다"),
    ORG_GRADE_ALREADY_EXISTS(HttpStatus.CONFLICT, "OG002", "이미 존재하는 직급명입니다"),
    ORG_CONCURRENT_DEPT_ALREADY_EXISTS(HttpStatus.CONFLICT, "OC001", "이미 해당 부서에 겸직 등록되어 있습니다"),

    // Leave Management
    LEAVE_POLICY_NOT_FOUND(HttpStatus.NOT_FOUND, "L001", "휴가 정책을 찾을 수 없습니다"),
    LEAVE_BALANCE_NOT_FOUND(HttpStatus.NOT_FOUND, "L002", "휴가 잔여 정보를 찾을 수 없습니다"),
    LEAVE_REQUEST_NOT_FOUND(HttpStatus.NOT_FOUND, "L003", "휴가 신청을 찾을 수 없습니다"),
    LEAVE_INSUFFICIENT_BALANCE(HttpStatus.BAD_REQUEST, "L004", "휴가 잔여일이 부족합니다"),
    LEAVE_OVERLAP_EXISTS(HttpStatus.BAD_REQUEST, "L005", "해당 기간에 이미 휴가가 존재합니다"),
    LEAVE_HALF_DAY_MULTI_DATE(HttpStatus.BAD_REQUEST, "L006", "반차는 하루만 선택할 수 있습니다"),
    LEAVE_POLICY_INACTIVE(HttpStatus.BAD_REQUEST, "L007", "비활성화된 휴가 정책입니다"),
    LEAVE_CANNOT_APPROVE(HttpStatus.BAD_REQUEST, "L008", "승인할 수 없는 휴가 신청입니다"),
    LEAVE_CANNOT_REJECT(HttpStatus.BAD_REQUEST, "L009", "거절할 수 없는 휴가 신청입니다"),
    LEAVE_CANNOT_CANCEL(HttpStatus.BAD_REQUEST, "L010", "취소할 수 없는 휴가 신청입니다"),
    LEAVE_CANCEL_PAST_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "L011", "이미 종료된 휴가는 취소할 수 없습니다"),
    LEAVE_CANNOT_REOPEN(HttpStatus.BAD_REQUEST, "L012", "다시 신청할 수 없는 휴가입니다"),
    LEAVE_REVOKE_EXCEEDS_REMAINING(HttpStatus.BAD_REQUEST, "L013", "회수할 일수가 잔여일보다 많습니다"),

    // Organization - Anniversary / Celebration
    CELEBRATION_MESSAGE_ALREADY_EXISTS(HttpStatus.CONFLICT, "CB001", "이미 축하 메시지를 작성하셨습니다"),
    CELEBRATION_MESSAGE_NOT_FOUND(HttpStatus.NOT_FOUND, "CB002", "축하 메시지를 찾을 수 없습니다"),
    CELEBRATION_MESSAGE_FORBIDDEN(HttpStatus.FORBIDDEN, "CB003", "본인의 축하 메시지만 수정/삭제할 수 있습니다"),

    // Organization - Onboarding
    ONBOARDING_TEMPLATE_NOT_FOUND(HttpStatus.NOT_FOUND, "OB001", "온보딩 템플릿을 찾을 수 없습니다"),
    ONBOARDING_INSTANCE_NOT_FOUND(HttpStatus.NOT_FOUND, "OB002", "온보딩 인스턴스를 찾을 수 없습니다"),
    ONBOARDING_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "OB003", "온보딩 항목을 찾을 수 없습니다"),
    ONBOARDING_ALREADY_ASSIGNED(HttpStatus.CONFLICT, "OB004", "이미 진행 중인 온보딩이 있습니다"),

    // Organization - Chart / Manager
    SELF_MANAGER_NOT_ALLOWED(HttpStatus.BAD_REQUEST, "OM001", "자기 자신을 매니저로 지정할 수 없습니다"),
    CIRCULAR_MANAGER_REFERENCE(HttpStatus.BAD_REQUEST, "OM002", "순환 참조가 발생합니다"),
    MANAGER_CHAIN_TOO_DEEP(HttpStatus.BAD_REQUEST, "OM003", "매니저 체인이 너무 깁니다"),
    CIRCULAR_DEPARTMENT_REFERENCE(HttpStatus.BAD_REQUEST, "OD003", "부서 계층에 순환 참조가 발생합니다"),

    // Organization - 1:1 Meeting
    ONE_ON_ONE_ALREADY_EXISTS(HttpStatus.CONFLICT, "OO001", "이미 해당 멤버와 1:1이 존재합니다"),
    ONE_ON_ONE_NOT_FOUND(HttpStatus.NOT_FOUND, "OO002", "1:1을 찾을 수 없습니다"),
    ONE_ON_ONE_MEETING_NOT_FOUND(HttpStatus.NOT_FOUND, "OO003", "1:1 미팅을 찾을 수 없습니다"),
    ONE_ON_ONE_ACTION_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "OO004", "액션 아이템을 찾을 수 없습니다"),

    // Organization - Attendance
    ALREADY_CLOCKED_IN(HttpStatus.CONFLICT, "AT001", "이미 출근 처리되었습니다"),
    NOT_CLOCKED_IN(HttpStatus.BAD_REQUEST, "AT002", "출근 기록이 없습니다"),
    ALREADY_CLOCKED_OUT(HttpStatus.CONFLICT, "AT003", "이미 퇴근 처리되었습니다"),
    NOT_CLOCKED_OUT(HttpStatus.BAD_REQUEST, "AT007", "퇴근 기록이 없습니다"),
    ATTENDANCE_RECORD_NOT_FOUND(HttpStatus.NOT_FOUND, "AT004", "근태 기록을 찾을 수 없습니다"),
    HOLIDAY_ALREADY_EXISTS(HttpStatus.CONFLICT, "AT005", "이미 등록된 공휴일입니다"),
    HOLIDAY_NOT_FOUND(HttpStatus.NOT_FOUND, "AT006", "공휴일을 찾을 수 없습니다"),

    // Organization - Member History
    ORG_MEMBER_HISTORY_NOT_FOUND(HttpStatus.NOT_FOUND, "OH001", "인사 이력을 찾을 수 없습니다"),

    // Org Subscription
    ORG_SUBSCRIPTION_NOT_FOUND(HttpStatus.NOT_FOUND, "OS001", "Org subscription not found"),
    ORG_TEAM_REQUIRED(HttpStatus.FORBIDDEN, "OS002", "Team plan required"),
    ORG_SEAT_LIMIT_EXCEEDED(HttpStatus.PAYMENT_REQUIRED, "OS003", "Org seat limit exceeded"),
    ORG_BOARD_REQUIRES_TEAM(HttpStatus.FORBIDDEN, "OS004", "Org board requires Team plan"),
    HR_FEATURE_REQUIRES_TEAM(HttpStatus.FORBIDDEN, "OS005", "HR feature requires Team plan"),
    ORG_TRIAL_ALREADY_USED(HttpStatus.CONFLICT, "OS006", "HR trial already used"),

    // OKR
    OKR_CYCLE_NOT_FOUND(HttpStatus.NOT_FOUND, "OKR001", "OKR 사이클을 찾을 수 없습니다"),
    OKR_OBJECTIVE_NOT_FOUND(HttpStatus.NOT_FOUND, "OKR002", "OKR 목표를 찾을 수 없습니다"),
    OKR_KEY_RESULT_NOT_FOUND(HttpStatus.NOT_FOUND, "OKR003", "OKR 핵심 결과를 찾을 수 없습니다"),
    OKR_CYCLE_NOT_ACTIVE(HttpStatus.BAD_REQUEST, "OKR004", "활성 상태가 아닌 사이클입니다"),
    OKR_UNAUTHORIZED(HttpStatus.FORBIDDEN, "OKR005", "OKR 접근 권한이 없습니다"),

    // Board Resource
    BOARD_RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "BR001", "리소스를 찾을 수 없습니다"),
    BOARD_RESOURCE_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "BR002", "보드당 최대 20개의 리소스만 등록할 수 있습니다"),

    // Mention Group
    MENTION_GROUP_NOT_FOUND(HttpStatus.NOT_FOUND, "MG001", "멘션 그룹을 찾을 수 없습니다"),
    MENTION_GROUP_ALREADY_EXISTS(HttpStatus.CONFLICT, "MG002", "이미 존재하는 멘션 그룹 이름입니다"),

    // Photo Gallery
    PHOTO_TAB_NOT_FOUND(HttpStatus.NOT_FOUND, "P001", "사진 탭을 찾을 수 없습니다"),
    PHOTO_NOT_FOUND(HttpStatus.NOT_FOUND, "P002", "사진을 찾을 수 없습니다"),
    PHOTO_UPLOAD_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "P003", "사진 업로드 제한 초과 (최대 20장)"),
    PHOTO_BATCH_DOWNLOAD_LIMIT(HttpStatus.BAD_REQUEST, "P004", "일괄 다운로드 제한 초과 (최대 100장)"),
    PHOTO_SHARE_LINK_NOT_FOUND(HttpStatus.NOT_FOUND, "P005", "공유 링크를 찾을 수 없습니다"),
    PHOTO_SHARE_LINK_INVALID_TYPE(HttpStatus.BAD_REQUEST, "P006", "유효하지 않은 링크 종류입니다"),

    // Storage (마이스페이스 개인 파일 보관함)
    STORAGE_FOLDER_NOT_FOUND(HttpStatus.NOT_FOUND, "ST001", "폴더를 찾을 수 없습니다"),
    STORAGE_FILE_NOT_FOUND(HttpStatus.NOT_FOUND, "ST002", "파일을 찾을 수 없습니다"),
    STORAGE_QUOTA_EXCEEDED(HttpStatus.PAYMENT_REQUIRED, "ST003", "스토리지 용량이 부족합니다. 파일을 정리하거나 플랜을 업그레이드해주세요"),

    // GitHub (자동 보고서 커밋 수집)
    GITHUB_APP_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "GH001", "GitHub App이 서버에 설정되지 않았습니다"),
    GITHUB_NOT_CONNECTED(HttpStatus.NOT_FOUND, "GH002", "GitHub이 연결되지 않았습니다"),
    GITHUB_AUTH_FAILED(HttpStatus.UNAUTHORIZED, "GH003", "GitHub 인증에 실패했습니다. 설치를 다시 연결해주세요"),
    GITHUB_API_ERROR(HttpStatus.BAD_GATEWAY, "GH004", "GitHub API 호출에 실패했습니다"),
    GITHUB_REPO_NOT_FOUND(HttpStatus.NOT_FOUND, "GH005", "저장소를 찾을 수 없거나 설치에 포함되어 있지 않습니다"),
    GITHUB_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "GH006", "GitHub API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요"),

    // 자동 보고서
    REPORT_CONFIG_NOT_FOUND(HttpStatus.NOT_FOUND, "RP001", "보고서 발송 설정을 찾을 수 없습니다"),
    REPORT_NO_SOURCE_CONNECTED(HttpStatus.UNPROCESSABLE_ENTITY, "RP002", "연결된 소스가 없습니다. GitHub 또는 Confluence를 먼저 연결해주세요"),
    REPORT_SHARE_LINK_EXPIRED(HttpStatus.NOT_FOUND, "RP003", "만료되었거나 사용할 수 없는 공유 링크입니다"),

    // Confluence (주간보고 수집) — JIRA와 별개의 연결이다
    CONFLUENCE_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "CF001", "Confluence OAuth 앱이 서버에 설정되지 않았습니다"),
    CONFLUENCE_NOT_CONNECTED(HttpStatus.NOT_FOUND, "CF002", "Confluence가 연결되지 않았습니다"),
    CONFLUENCE_CONNECTION_FAILED(HttpStatus.BAD_GATEWAY, "CF003", "Confluence 연결에 실패했습니다"),
    CONFLUENCE_AUTH_FAILED(HttpStatus.UNAUTHORIZED, "CF004", "Confluence 인증에 실패했습니다. 연결을 다시 해주세요"),
    CONFLUENCE_API_ERROR(HttpStatus.BAD_GATEWAY, "CF005", "Confluence API 호출에 실패했습니다"),
    CONFLUENCE_NOT_FOUND(HttpStatus.NOT_FOUND, "CF006", "Confluence 사이트 또는 페이지를 찾을 수 없습니다"),
    CONFLUENCE_SITE_NOT_SELECTED(HttpStatus.UNPROCESSABLE_ENTITY, "CF007", "Confluence 사이트를 먼저 선택해주세요");

    private final HttpStatus status;
    private final String code;
    private final String message;
}
