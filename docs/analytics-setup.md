# Firebase Analytics & Sentry 설정 가이드

이 문서는 BRIDGE 프로젝트에 Firebase Analytics와 Sentry 에러 트래킹을 설정하는 방법을 안내합니다.

---

## 1. Firebase 프로젝트 설정

### 1.1 Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: `bridge-spots`)
4. Google Analytics 활성화 (권장)
5. 프로젝트 생성 완료

### 1.2 웹 앱 추가

1. 프로젝트 설정 > 일반 > 내 앱 > 웹 앱 추가
2. 앱 닉네임 입력 (예: `bridge-frontend`)
3. Firebase SDK 설정 값 복사

```javascript
// 아래 값들을 환경변수로 설정
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
  measurementId: "G-XXXXXXXXXX"
};
```

---

## 2. Sentry 프로젝트 설정

### 2.1 Sentry 프로젝트 생성

1. [Sentry](https://sentry.io/) 접속 및 로그인
2. Projects > Create Project
3. **Frontend**: Platform = React 선택
4. **Backend**: Platform = Spring Boot 선택
5. 프로젝트 생성 후 DSN 복사

### 2.2 DSN 확인

- Settings > Projects > [Your Project] > Client Keys (DSN)
- 형식: `https://xxxxx@sentry.io/xxxxx`

---

## 3. 환경변수 설정

### 3.1 Frontend 환경변수

`.env.local` 파일 생성 (frontend 루트):

```bash
# Google OAuth (기존)
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# API (기존)
VITE_API_BASE_URL=http://localhost:8080/api/v1

# Firebase Analytics
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Sentry
VITE_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
VITE_SENTRY_ENVIRONMENT=development
VITE_SENTRY_RELEASE=0.0.1
```

### 3.2 Backend 환경변수

```bash
# Sentry (기존 환경변수에 추가)
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=0.1
```

### 3.3 GitHub Secrets 설정 (CI/CD용)

Repository Settings > Secrets and variables > Actions에 추가:

| Secret Name | Description |
|-------------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API Key |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `VITE_FIREBASE_APP_ID` | Firebase App ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Measurement ID (G-xxx) |
| `VITE_SENTRY_DSN` | Sentry Frontend DSN |
| `SENTRY_DSN` | Sentry Backend DSN |

---

## 4. 추적되는 이벤트

### 4.1 자동 추적 (페이지뷰)

- 모든 라우트 변경 시 자동으로 `page_view` 이벤트 발생
- 페이지 이름 자동 매핑: `/boards` → `board_list`, `/boards/:id` → `board_detail`

### 4.2 수동 추적 이벤트

| 카테고리 | 이벤트 | 파라미터 |
|---------|--------|----------|
| **인증** | `sign_up` | `method` (email/google) |
| | `login` | `method` (email/google) |
| | `logout` | - |
| **보드** | `board_create` | `board_id` |
| | `board_view` | `board_id` |
| | `board_share` | `board_id`, `member_count` |
| | `board_delete` | `board_id` |
| **카드** | `card_create` | `board_id`, `block_name` |
| | `card_view` | `board_id`, `card_id` |
| | `card_move` | `board_id`, `from_block`, `to_block` |
| **태스크** | `task_create` | `board_id`, `feature_id` |
| | `task_complete` | `board_id`, `feature_id` |
| **협업** | `comment_add` | `board_id`, `target_type` |
| | `member_invite` | `board_id`, `role` |
| | `file_upload` | `board_id`, `file_type`, `size_kb` |
| **결제** | `payment_start` | `board_id`, `plan_type` |
| | `payment_complete` | `board_id`, `plan_type`, `amount` |
| **에러** | `error` | `error_type`, `error_message` |

---

## 5. 사용 방법

### 5.1 컴포넌트에서 이벤트 추적

```tsx
import { useAnalyticsContext } from '../contexts/AnalyticsContext';

function MyComponent() {
  const { track } = useAnalyticsContext();

  const handleAction = () => {
    track('card_create', {
      board_id: 'board-123',
      block_name: 'Feature'
    });
  };

  return <button onClick={handleAction}>카드 생성</button>;
}
```

### 5.2 React 외부에서 이벤트 추적

```tsx
import { trackEvent } from '../contexts/AnalyticsContext';

// 서비스 레이어, 유틸리티 함수 등에서 직접 호출
trackEvent('payment_complete', {
  board_id: 'board-123',
  plan_type: 'standard',
  amount: 29000
});
```

### 5.3 Sentry 에러 수동 캡처

```tsx
import { captureException, captureMessage } from '../../lib/sentry';

try {
  // 위험한 작업
} catch (error) {
  captureException(error, { context: 'payment_processing' });
}

// 메시지만 전송
captureMessage('User reached rate limit', 'warning');
```

---

## 6. 대시보드 확인

### Firebase Analytics
- [Firebase Console](https://console.firebase.google.com/) > Analytics
- 실시간 이벤트, 사용자 행동, 전환 퍼널 확인

### Sentry
- [Sentry Dashboard](https://sentry.io/) > Issues
- 에러 발생 빈도, 스택 트레이스, 영향받는 사용자 수 확인

---

## 7. 비용

| 서비스 | 무료 범위 | 예상 비용 |
|--------|----------|----------|
| Firebase Analytics | 무제한 | $0 |
| Firebase Performance | 무료 | $0 |
| Sentry | 5K 이벤트/월 | 소규모: $0 |

> 초기 단계에서는 모두 무료로 사용 가능합니다.

---

## 8. 문제 해결

### Firebase Analytics가 작동하지 않음
1. 환경변수가 올바르게 설정되었는지 확인
2. 브라우저 콘솔에서 `[Firebase]` 로그 확인
3. 광고 차단기가 활성화되어 있으면 Analytics가 차단될 수 있음

### Sentry 에러가 수집되지 않음
1. `SENTRY_DSN` 환경변수 확인
2. 브라우저 콘솔에서 `[Sentry]` 로그 확인
3. 개발 환경에서는 `tracesSampleRate`가 1.0으로 설정되어 있어야 함

### 백엔드 Sentry 연동 확인
```bash
# 로컬에서 테스트
curl http://localhost:8080/actuator/health
# 의도적 에러 발생 시 Sentry 대시보드에서 확인
```
