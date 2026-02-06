# Admin 기능 확장 명세서

> 작성일: 2026-02-06
> 상태: Draft

## 목차

1. [사용자 관리](#1-사용자-관리)
   - 1.1 계정 비활성화
   - 1.2 비밀번호 리셋 메일 발송
   - 1.3 이메일 인증 강제 처리
2. [보드 관리](#2-보드-관리)
   - 2.1 티어 강제 변경
   - 2.2 소유권 이전
   - 2.3 보드 강제 삭제
   - 2.4 Trial 기간 연장
3. [분석/리포트](#3-분석리포트)
   - 3.1 가입자 추이 차트
   - 3.2 DAU/WAU/MAU
   - 3.3 결제 전환율
4. [시스템 관리](#4-시스템-관리)
   - 4.1 공지사항 관리
   - 4.2 점검 모드

---

## 1. 사용자 관리

### 1.1 계정 비활성화

#### 기능 설명
- 문제 유저의 계정을 일시 정지하는 기능
- 비활성화된 계정은 로그인 불가
- 관리자가 다시 활성화 가능

#### Backend 변경사항

**1) User 엔티티 수정**
```java
// User.java
@Column(name = "is_active", nullable = false)
@Builder.Default
private Boolean isActive = true;

@Column(name = "deactivated_at")
private LocalDateTime deactivatedAt;

@Column(name = "deactivated_reason", length = 500)
private String deactivatedReason;

public void deactivate(String reason) {
    this.isActive = false;
    this.deactivatedAt = LocalDateTime.now();
    this.deactivatedReason = reason;
}

public void activate() {
    this.isActive = true;
    this.deactivatedAt = null;
    this.deactivatedReason = null;
}
```

**2) DB 마이그레이션 (V7)**
```sql
-- V7__add_user_active_status.sql
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN deactivated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN deactivated_reason VARCHAR(500);
```

**3) AdminController API 추가**
```java
@PostMapping("/users/{userId}/deactivate")
public ResponseEntity<AdminResponse.UserSummary> deactivateUser(
    @PathVariable String userId,
    @RequestBody AdminRequest.DeactivateUser request) {
    // reason 필드 포함
}

@PostMapping("/users/{userId}/activate")
public ResponseEntity<AdminResponse.UserSummary> activateUser(
    @PathVariable String userId) {
}
```

**4) AuthService 로그인 체크 추가**
```java
// 로그인 시 isActive 체크
if (!user.getIsActive()) {
    throw new BusinessException(ErrorCode.USER_DEACTIVATED);
}
```

**5) ErrorCode 추가**
```java
USER_DEACTIVATED(HttpStatus.FORBIDDEN, "U005", "비활성화된 계정입니다. 관리자에게 문의하세요.")
```

#### Frontend 변경사항

**1) AdminUserDetail 타입 수정**
```typescript
interface AdminUserDetail {
  // ... 기존 필드
  is_active: boolean;
  deactivated_at?: string | null;
  deactivated_reason?: string | null;
}
```

**2) AdminUserDetailModal.tsx 수정**
- 활성/비활성 상태 배지 표시
- 비활성화 버튼 (사유 입력 모달)
- 활성화 버튼

**3) API 서비스 추가**
```typescript
deactivateUser: (userId: string, reason: string) => Promise<AdminUserSummary>
activateUser: (userId: string) => Promise<AdminUserSummary>
```

#### 예상 작업량
- Backend: 2시간
- Frontend: 1.5시간
- **총: 3.5시간**

---

### 1.2 비밀번호 리셋 메일 발송

#### 기능 설명
- 관리자가 특정 사용자에게 비밀번호 리셋 이메일을 강제 발송
- 기존 비밀번호 리셋 로직 재활용

#### Backend 변경사항

**1) AdminController API 추가**
```java
@PostMapping("/users/{userId}/send-password-reset")
public ResponseEntity<Map<String, String>> sendPasswordResetEmail(
    @PathVariable String userId) {
    // 기존 AuthService.sendPasswordResetEmail() 재활용
}
```

**2) AdminService 메서드 추가**
```java
public void sendPasswordResetEmailByAdmin(String userId) {
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

    // Google 계정은 비밀번호 리셋 불가
    if ("GOOGLE".equals(user.getAuthProvider())) {
        throw new BusinessException(ErrorCode.GOOGLE_USER_NO_PASSWORD);
    }

    authService.sendPasswordResetEmail(user.getEmail());
}
```

**3) ErrorCode 추가**
```java
GOOGLE_USER_NO_PASSWORD(HttpStatus.BAD_REQUEST, "A010", "Google 계정은 비밀번호를 사용하지 않습니다.")
```

#### Frontend 변경사항

**1) AdminUserDetailModal.tsx 수정**
- "비밀번호 리셋 메일 발송" 버튼 추가
- Google 로그인 사용자는 버튼 비활성화
- 발송 확인 모달

**2) API 서비스 추가**
```typescript
sendPasswordResetEmail: (userId: string) => Promise<{ message: string }>
```

#### 예상 작업량
- Backend: 1시간
- Frontend: 1시간
- **총: 2시간**

---

### 1.3 이메일 인증 강제 처리

#### 기능 설명
- 관리자가 수동으로 사용자의 이메일 인증을 완료 처리
- 이메일 인증 메일을 받지 못한 사용자 CS 대응용

#### Backend 변경사항

**1) AdminController API 추가**
```java
@PostMapping("/users/{userId}/verify-email")
public ResponseEntity<AdminResponse.UserSummary> verifyUserEmail(
    @PathVariable String userId) {
}
```

**2) AdminService 메서드 추가**
```java
public AdminResponse.UserSummary verifyUserEmailByAdmin(String userId) {
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

    if (user.getEmailVerified()) {
        throw new BusinessException(ErrorCode.EMAIL_ALREADY_VERIFIED);
    }

    user.verifyEmail();
    userRepository.save(user);

    return AdminResponse.UserSummary.of(user, boardCount);
}
```

**3) ErrorCode 추가**
```java
EMAIL_ALREADY_VERIFIED(HttpStatus.BAD_REQUEST, "A011", "이미 인증된 이메일입니다.")
```

#### Frontend 변경사항

**1) AdminUserDetailModal.tsx 수정**
- 이메일 인증 상태 옆에 "강제 인증" 버튼 추가
- 이미 인증된 경우 버튼 숨김

**2) API 서비스 추가**
```typescript
verifyUserEmail: (userId: string) => Promise<AdminUserSummary>
```

#### 예상 작업량
- Backend: 0.5시간
- Frontend: 0.5시간
- **총: 1시간**

---

## 2. 보드 관리

### 2.1 티어 강제 변경

#### 기능 설명
- 관리자가 보드의 티어를 강제로 변경 (FREE ↔ STANDARD ↔ PREMIUM ↔ ENTERPRISE)
- CS 대응용 (무료 업그레이드, 다운그레이드 등)

#### Backend 변경사항

**이미 구현됨**: `AdminController.updateBoardTier()`

**확인 필요 사항:**
```java
@PatchMapping("/boards/{boardId}/tier")
public ResponseEntity<AdminResponse.BoardSummary> updateBoardTier(
    @PathVariable String boardId,
    @Valid @RequestBody AdminRequest.UpdateBoardTier request) {
    // 이미 존재
}
```

#### Frontend 변경사항

**1) AdminBoardDetailModal.tsx 확인/수정**
- 티어 변경 드롭다운 UI 추가
- 변경 확인 모달

**2) API 서비스 확인**
```typescript
updateBoardTier: (boardId: string, tier: BoardTier) => Promise<AdminBoardSummary>
```

#### 예상 작업량
- Backend: 이미 구현됨 (확인만)
- Frontend: 1시간
- **총: 1시간**

---

### 2.2 소유권 이전

#### 기능 설명
- 보드의 Owner를 다른 사용자로 변경
- 기존 Owner는 Admin으로 강등

#### Backend 변경사항

**1) AdminController API 추가**
```java
@PostMapping("/boards/{boardId}/transfer-ownership")
public ResponseEntity<AdminResponse.BoardDetail> transferBoardOwnership(
    @PathVariable String boardId,
    @RequestBody AdminRequest.TransferOwnership request) {
    // newOwnerId: 새로운 Owner의 userId
}
```

**2) AdminRequest DTO 추가**
```java
@Getter
@NoArgsConstructor
@AllArgsConstructor
public static class TransferOwnership {
    @NotBlank
    private String newOwnerId;
}
```

**3) AdminService 메서드 추가**
```java
@Transactional
public AdminResponse.BoardDetail transferBoardOwnership(String boardId, String newOwnerId) {
    Board board = boardRepository.findById(boardId)
        .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

    User newOwner = userRepository.findById(newOwnerId)
        .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

    User oldOwner = board.getOwner();

    // 1. 새 Owner가 이미 멤버인지 확인
    Optional<BoardMember> existingMember = boardMemberRepository
        .findByBoardAndUser(board, newOwner);

    if (existingMember.isPresent()) {
        // 기존 멤버면 OWNER로 역할 변경
        existingMember.get().updateRole(BoardRole.OWNER);
    } else {
        // 새 멤버로 추가
        BoardMember newMember = BoardMember.builder()
            .board(board)
            .user(newOwner)
            .role(BoardRole.OWNER)
            .build();
        boardMemberRepository.save(newMember);
    }

    // 2. 기존 Owner를 ADMIN으로 변경
    BoardMember oldOwnerMember = boardMemberRepository
        .findByBoardAndUser(board, oldOwner)
        .orElseThrow();
    oldOwnerMember.updateRole(BoardRole.ADMIN);

    // 3. Board의 owner 필드 업데이트
    board.updateOwner(newOwner);

    return buildBoardDetail(board);
}
```

**4) Board 엔티티 메서드 추가**
```java
public void updateOwner(User newOwner) {
    this.owner = newOwner;
}
```

#### Frontend 변경사항

**1) AdminBoardDetailModal.tsx 수정**
- "소유권 이전" 버튼 추가
- 사용자 검색/선택 모달
- 이전 확인 다이얼로그

**2) API 서비스 추가**
```typescript
transferBoardOwnership: (boardId: string, newOwnerId: string) => Promise<AdminBoardDetail>
```

#### 예상 작업량
- Backend: 2시간
- Frontend: 2시간
- **총: 4시간**

---

### 2.3 보드 강제 삭제

#### 기능 설명
- 관리자 권한으로 보드 삭제
- 관련 데이터 모두 삭제 (cascade)

#### Backend 변경사항

**이미 구현됨**: `AdminController.deleteBoard()`

```java
@DeleteMapping("/boards/{boardId}")
public ResponseEntity<Map<String, String>> deleteBoard(
    @PathVariable String boardId) {
    // 이미 존재
}
```

#### Frontend 변경사항

**1) AdminBoardDetailModal.tsx 확인/수정**
- "보드 삭제" 버튼 추가
- 삭제 확인 모달 (보드명 입력 확인)

**2) API 서비스 확인**
```typescript
deleteBoard: (boardId: string) => Promise<{ message: string }>
```

#### 예상 작업량
- Backend: 이미 구현됨
- Frontend: 1시간
- **총: 1시간**

---

### 2.4 Trial 기간 연장

#### 기능 설명
- 특정 보드의 Trial 기간을 연장
- 원하는 날짜까지 연장 가능

#### Backend 변경사항

**1) AdminController API 추가**
```java
@PatchMapping("/boards/{boardId}/extend-trial")
public ResponseEntity<AdminResponse.BoardSummary> extendTrial(
    @PathVariable String boardId,
    @RequestBody AdminRequest.ExtendTrial request) {
    // extendDays 또는 newTrialEndsAt
}
```

**2) AdminRequest DTO 추가**
```java
@Getter
@NoArgsConstructor
@AllArgsConstructor
public static class ExtendTrial {
    private Integer extendDays;  // 연장할 일수
    private LocalDateTime newTrialEndsAt;  // 또는 직접 지정
}
```

**3) AdminService 메서드 추가**
```java
@Transactional
public AdminResponse.BoardSummary extendTrial(String boardId, AdminRequest.ExtendTrial request) {
    Board board = boardRepository.findById(boardId)
        .orElseThrow(() -> new BusinessException(ErrorCode.BOARD_NOT_FOUND));

    LocalDateTime newTrialEndsAt;
    if (request.getNewTrialEndsAt() != null) {
        newTrialEndsAt = request.getNewTrialEndsAt();
    } else if (request.getExtendDays() != null) {
        LocalDateTime current = board.getTrialEndsAt() != null
            ? board.getTrialEndsAt()
            : LocalDateTime.now();
        newTrialEndsAt = current.plusDays(request.getExtendDays());
    } else {
        throw new BusinessException(ErrorCode.INVALID_REQUEST);
    }

    board.extendTrial(newTrialEndsAt);
    return buildBoardSummary(board);
}
```

**4) Board 엔티티 메서드 추가**
```java
public void extendTrial(LocalDateTime newTrialEndsAt) {
    this.trialEndsAt = newTrialEndsAt;
}
```

#### Frontend 변경사항

**1) AdminBoardDetailModal.tsx 수정**
- "Trial 연장" 버튼 추가
- 연장 일수 입력 또는 날짜 선택 UI
- 현재 Trial 종료일 표시

**2) API 서비스 추가**
```typescript
extendTrial: (boardId: string, days: number) => Promise<AdminBoardSummary>
```

#### 예상 작업량
- Backend: 1시간
- Frontend: 1.5시간
- **총: 2.5시간**

---

## 3. 분석/리포트

### 3.1 가입자 추이 차트

#### 기능 설명
- 일간/주간/월간 신규 가입자 수 추이
- 차트로 시각화

#### Backend 변경사항

**1) AdminController API 추가**
```java
@GetMapping("/statistics/signups")
public ResponseEntity<AdminResponse.SignupTrend> getSignupTrend(
    @RequestParam(defaultValue = "DAILY") TrendPeriod period,
    @RequestParam(defaultValue = "30") int days) {
}
```

**2) AdminResponse DTO 추가**
```java
@Getter
@Builder
@AllArgsConstructor
public static class SignupTrend {
    private List<TrendData> data;
    private long total;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class TrendData {
        private String date;  // "2026-02-06" 또는 "2026-W06" 또는 "2026-02"
        private long count;
        private long emailCount;
        private long googleCount;
    }
}
```

**3) AdminService 메서드 추가**
```java
public AdminResponse.SignupTrend getSignupTrend(TrendPeriod period, int days) {
    LocalDateTime startDate = LocalDateTime.now().minusDays(days);

    // Native Query 또는 JPQL로 그룹핑
    // SELECT DATE(created_at) as date, COUNT(*) as count,
    //        SUM(CASE WHEN auth_provider = 'email' THEN 1 ELSE 0 END) as email_count,
    //        SUM(CASE WHEN auth_provider = 'GOOGLE' THEN 1 ELSE 0 END) as google_count
    // FROM users
    // WHERE created_at >= :startDate
    // GROUP BY DATE(created_at)
    // ORDER BY date
}
```

**4) UserRepository 쿼리 추가**
```java
@Query(value = """
    SELECT DATE(created_at) as date,
           COUNT(*) as count,
           SUM(CASE WHEN auth_provider = 'email' THEN 1 ELSE 0 END) as emailCount,
           SUM(CASE WHEN auth_provider = 'GOOGLE' THEN 1 ELSE 0 END) as googleCount
    FROM users
    WHERE created_at >= :startDate
    GROUP BY DATE(created_at)
    ORDER BY date
    """, nativeQuery = true)
List<Object[]> getSignupTrendDaily(@Param("startDate") LocalDateTime startDate);
```

#### Frontend 변경사항

**1) 새 탭 또는 대시보드 확장**
- AdminAnalyticsTab.tsx 생성 (새 탭)
- 또는 AdminDashboardTab에 차트 섹션 추가

**2) 차트 라이브러리 설치**
```bash
npm install recharts
# 또는
npm install chart.js react-chartjs-2
```

**3) 컴포넌트 구현**
```typescript
// SignupTrendChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface SignupTrendData {
  date: string;
  count: number;
  email_count: number;
  google_count: number;
}
```

**4) API 서비스 추가**
```typescript
getSignupTrend: (period: 'DAILY' | 'WEEKLY' | 'MONTHLY', days: number) => Promise<SignupTrend>
```

#### 예상 작업량
- Backend: 2시간
- Frontend: 3시간 (차트 라이브러리 포함)
- **총: 5시간**

---

### 3.2 DAU/WAU/MAU

#### 기능 설명
- Daily Active Users: 일간 활성 사용자
- Weekly Active Users: 주간 활성 사용자
- Monthly Active Users: 월간 활성 사용자
- `last_login_at` 기준으로 집계

#### Backend 변경사항

**1) AdminController API 추가**
```java
@GetMapping("/statistics/active-users")
public ResponseEntity<AdminResponse.ActiveUserStats> getActiveUserStats(
    @RequestParam(defaultValue = "30") int days) {
}
```

**2) AdminResponse DTO 추가**
```java
@Getter
@Builder
@AllArgsConstructor
public static class ActiveUserStats {
    private long dau;  // 오늘
    private long wau;  // 최근 7일
    private long mau;  // 최근 30일
    private List<DailyActiveData> trend;  // DAU 추이

    @Getter
    @Builder
    @AllArgsConstructor
    public static class DailyActiveData {
        private String date;
        private long count;
    }
}
```

**3) AdminService 메서드 추가**
```java
public AdminResponse.ActiveUserStats getActiveUserStats(int days) {
    LocalDateTime now = LocalDateTime.now();

    long dau = userRepository.countByLastLoginAtAfter(now.minusDays(1));
    long wau = userRepository.countByLastLoginAtAfter(now.minusDays(7));
    long mau = userRepository.countByLastLoginAtAfter(now.minusDays(30));

    // DAU 추이 (최근 N일)
    List<DailyActiveData> trend = userRepository.getDailyActiveUserTrend(now.minusDays(days));

    return ActiveUserStats.builder()
        .dau(dau)
        .wau(wau)
        .mau(mau)
        .trend(trend)
        .build();
}
```

**4) UserRepository 쿼리 추가**
```java
long countByLastLoginAtAfter(LocalDateTime dateTime);

@Query(value = """
    SELECT DATE(last_login_at) as date, COUNT(DISTINCT id) as count
    FROM users
    WHERE last_login_at >= :startDate
    GROUP BY DATE(last_login_at)
    ORDER BY date
    """, nativeQuery = true)
List<Object[]> getDailyActiveUserTrend(@Param("startDate") LocalDateTime startDate);
```

#### Frontend 변경사항

**1) AdminAnalyticsTab 또는 대시보드 확장**
- DAU/WAU/MAU 카드 표시
- DAU 추이 차트

**2) API 서비스 추가**
```typescript
getActiveUserStats: (days: number) => Promise<ActiveUserStats>
```

#### 예상 작업량
- Backend: 1.5시간
- Frontend: 2시간
- **총: 3.5시간**

---

### 3.3 결제 전환율

#### 기능 설명
- Trial → Paid 전환율 추적
- 기간별 전환율 추이

#### Backend 변경사항

**1) AdminController API 추가**
```java
@GetMapping("/statistics/conversion")
public ResponseEntity<AdminResponse.ConversionStats> getConversionStats(
    @RequestParam(defaultValue = "30") int days) {
}
```

**2) AdminResponse DTO 추가**
```java
@Getter
@Builder
@AllArgsConstructor
public static class ConversionStats {
    private long totalTrialStarted;      // Trial 시작한 보드 수
    private long totalConverted;          // 유료 전환한 보드 수
    private double conversionRate;        // 전환율 (%)
    private long trialInProgress;         // 현재 Trial 중인 보드
    private long trialExpiredNotConverted; // Trial 만료 후 미전환
    private List<MonthlyConversion> trend;

    @Getter
    @Builder
    @AllArgsConstructor
    public static class MonthlyConversion {
        private String month;  // "2026-01"
        private long trialStarted;
        private long converted;
        private double rate;
    }
}
```

**3) AdminService 메서드 추가**
```java
public AdminResponse.ConversionStats getConversionStats(int days) {
    // Subscription 테이블에서 Trial → Active 전환 추적
    // Board의 tier 변경 이력 필요할 수 있음
}
```

**참고**: 정확한 전환율 추적을 위해서는 `subscription_history` 또는 `board_tier_history` 테이블이 필요할 수 있음

#### Frontend 변경사항

**1) AdminAnalyticsTab 확장**
- 전환율 지표 카드
- 월별 전환율 차트
- 퍼널 시각화 (Trial → Paid)

#### 예상 작업량
- Backend: 3시간 (히스토리 테이블 설계 포함)
- Frontend: 2시간
- **총: 5시간**

---

## 4. 시스템 관리

### 4.1 공지사항 관리

#### 기능 설명
- 시스템 공지사항 등록/수정/삭제
- 팝업 공지, 배너 공지 등
- 표시 기간, 대상 설정

#### Backend 변경사항

**1) 새 도메인 패키지 생성**: `com.kanban.domain.announcement`

**2) Announcement 엔티티**
```java
@Entity
@Table(name = "announcements")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class Announcement extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", length = 20)
    private AnnouncementType type;  // POPUP, BANNER, NOTICE

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "start_at")
    private LocalDateTime startAt;

    @Column(name = "end_at")
    private LocalDateTime endAt;

    @Column(name = "priority")
    @Builder.Default
    private Integer priority = 0;  // 높을수록 우선 표시

    @Column(name = "target_role", length = 20)
    private String targetRole;  // null = 전체, "USER", "TESTER" 등

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
```

**3) DB 마이그레이션 (V8)**
```sql
-- V8__create_announcements_table.sql
CREATE TABLE announcements (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    type VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT true,
    start_at TIMESTAMP,
    end_at TIMESTAMP,
    priority INTEGER DEFAULT 0,
    target_role VARCHAR(20),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
```

**4) AdminController API 추가**
```java
// 공지사항 목록
@GetMapping("/announcements")
public ResponseEntity<List<AnnouncementResponse>> getAnnouncements();

// 공지사항 생성
@PostMapping("/announcements")
public ResponseEntity<AnnouncementResponse> createAnnouncement(
    @RequestBody AnnouncementRequest request);

// 공지사항 수정
@PutMapping("/announcements/{id}")
public ResponseEntity<AnnouncementResponse> updateAnnouncement(
    @PathVariable String id,
    @RequestBody AnnouncementRequest request);

// 공지사항 삭제
@DeleteMapping("/announcements/{id}")
public ResponseEntity<Void> deleteAnnouncement(@PathVariable String id);
```

**5) 일반 사용자용 API (AuthController 또는 별도)**
```java
// 현재 활성 공지사항 조회
@GetMapping("/announcements/active")
public ResponseEntity<List<AnnouncementResponse>> getActiveAnnouncements();
```

#### Frontend 변경사항

**1) 새 탭 생성**: `AdminAnnouncementsTab.tsx`
- 공지사항 목록 테이블
- 생성/수정 모달
- 삭제 기능

**2) 공지사항 표시 컴포넌트**
- `AnnouncementPopup.tsx`: 팝업 형태
- `AnnouncementBanner.tsx`: 상단 배너 형태

**3) 공지사항 Context 또는 Hook**
```typescript
// useAnnouncements.ts
export function useAnnouncements() {
  // 활성 공지사항 조회
  // 로컬 스토리지로 "오늘 하루 보지 않기" 관리
}
```

#### 예상 작업량
- Backend: 3시간 (새 도메인 + CRUD)
- Frontend: 4시간 (관리 UI + 표시 UI)
- **총: 7시간**

---

### 4.2 점검 모드

#### 기능 설명
- 서비스 점검 시 사용자 접근 차단
- 점검 중 안내 페이지 표시
- 관리자는 점검 중에도 접근 가능

#### Backend 변경사항

**1) SystemConfig 엔티티 (또는 설정 테이블)**
```java
@Entity
@Table(name = "system_config")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@AllArgsConstructor
public class SystemConfig {

    @Id
    @Column(name = "config_key", length = 100)
    private String key;

    @Column(name = "config_value", columnDefinition = "TEXT")
    private String value;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
```

**2) MaintenanceMode 설정값**
```
key: "maintenance_mode"
value: {
  "enabled": true,
  "message": "시스템 점검 중입니다.",
  "estimated_end": "2026-02-06T18:00:00",
  "allow_admin": true
}
```

**3) MaintenanceFilter 추가**
```java
@Component
@Order(1)
public class MaintenanceFilter extends OncePerRequestFilter {

    @Autowired
    private SystemConfigRepository systemConfigRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) {
        // 1. maintenance_mode 설정 확인
        // 2. 활성화되어 있으면
        //    - Admin 유저는 통과
        //    - 일반 유저는 503 응답
        // 3. /api/v1/system/status는 항상 통과 (점검 상태 확인용)
    }
}
```

**4) AdminController API 추가**
```java
@GetMapping("/system/maintenance")
public ResponseEntity<MaintenanceStatus> getMaintenanceStatus();

@PostMapping("/system/maintenance")
public ResponseEntity<MaintenanceStatus> setMaintenanceMode(
    @RequestBody MaintenanceRequest request);
```

**5) 일반 API**
```java
// 점검 상태 확인 (비인증)
@GetMapping("/system/status")
public ResponseEntity<SystemStatus> getSystemStatus();
```

#### Frontend 변경사항

**1) 시스템 관리 섹션 (AdminDashboardTab 또는 새 탭)**
- 점검 모드 ON/OFF 토글
- 점검 메시지 입력
- 예상 종료 시간 설정

**2) MaintenancePage.tsx**
- 점검 중 안내 페이지
- 예상 종료 시간 표시
- 자동 새로고침

**3) App.tsx 또는 루트 레벨**
```typescript
// 앱 시작 시 점검 상태 확인
// 점검 중이면 MaintenancePage로 리다이렉트
useEffect(() => {
  checkMaintenanceStatus();
}, []);
```

#### 예상 작업량
- Backend: 3시간
- Frontend: 3시간
- **총: 6시간**

---

## 총 예상 작업량

| 카테고리 | 기능 | 예상 시간 |
|---------|------|----------|
| 사용자 관리 | 계정 비활성화 | 3.5h |
| | 비밀번호 리셋 메일 | 2h |
| | 이메일 인증 강제 처리 | 1h |
| 보드 관리 | 티어 강제 변경 | 1h |
| | 소유권 이전 | 4h |
| | 보드 강제 삭제 | 1h |
| | Trial 기간 연장 | 2.5h |
| 분석/리포트 | 가입자 추이 차트 | 5h |
| | DAU/WAU/MAU | 3.5h |
| | 결제 전환율 | 5h |
| 시스템 관리 | 공지사항 관리 | 7h |
| | 점검 모드 | 6h |
| **합계** | | **41.5h** |

---

## 구현 순서 제안

### Phase 1: 사용자/보드 관리 기본 (11h)
1. 계정 비활성화 (3.5h)
2. 비밀번호 리셋 메일 (2h)
3. 이메일 인증 강제 처리 (1h)
4. 티어 강제 변경 (1h) - FE만
5. 보드 강제 삭제 (1h) - FE만
6. Trial 기간 연장 (2.5h)

### Phase 2: 보드 관리 고급 (4h)
7. 소유권 이전 (4h)

### Phase 3: 분석/리포트 (13.5h)
8. 가입자 추이 차트 (5h)
9. DAU/WAU/MAU (3.5h)
10. 결제 전환율 (5h)

### Phase 4: 시스템 관리 (13h)
11. 공지사항 관리 (7h)
12. 점검 모드 (6h)

---

## 참고사항

### 공통 필요 작업
- 차트 라이브러리 설치 (recharts 권장)
- 날짜 선택 컴포넌트 (react-datepicker 또는 기존 사용 중인 것)

### DB 마이그레이션 정리
- V7: users 테이블 active 상태 필드
- V8: announcements 테이블
- V9: system_config 테이블

### 테스트 고려사항
- Admin 권한 체크 테스트
- 비활성화된 사용자 로그인 차단 테스트
- 점검 모드 필터 테스트
