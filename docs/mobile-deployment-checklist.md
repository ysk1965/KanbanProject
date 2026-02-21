# BRIDGE 모바일 앱 배포 체크리스트

> Capacitor 설정, 푸시 알림, CI/CD 파이프라인은 구현 완료.
> 아래는 Apple/Google 계정 승인 후 진행할 남은 작업 목록입니다.

---

## 1. Apple Developer 계정 승인 후

### 1-1. App Store Connect 설정
- [ ] App Store Connect에서 앱 등록 (`com.bridgespots.app`)
- [ ] 앱 이름: `BRIDGE SPOTS`
- [ ] 카테고리: `Productivity` / `Business`
- [ ] 기본 언어: 한국어 (+ 영어)

### 1-2. 인증서 & 프로비저닝
- [ ] Fastlane Match용 private 인증서 저장소 생성 (예: `github.com/YOUR_ORG/certificates`)
- [ ] `fastlane match appstore` 실행하여 인증서 + 프로비저닝 프로파일 생성
- [ ] Push Notification capability 활성화 (Apple Developer Portal → Identifiers → `com.bridgespots.app`)
- [ ] Associated Domains capability 활성화 (딥링크용)

### 1-3. App Store Connect API 키 발급
- [ ] App Store Connect → Users and Access → Keys → **Generate API Key**
- [ ] Key ID, Issuer ID, .p8 파일 다운로드
- [ ] .p8 파일 내용을 Base64 인코딩: `base64 -i AuthKey_XXXXXX.p8`

### 1-4. GitHub Secrets 등록
```
MATCH_PASSWORD         = (직접 설정할 암호)
MATCH_GIT_AUTH         = (인증서 repo 접근용 GitHub PAT, base64 인코딩)
ASC_KEY_ID             = (App Store Connect API Key ID)
ASC_ISSUER_ID          = (App Store Connect Issuer ID)
ASC_API_KEY            = (.p8 파일 내용, base64 인코딩)
```

### 1-5. 앱 아이콘 & 스플래시 스크린
- [ ] `BridgeSpotsIcon.png`에서 iOS 앱 아이콘 세트 생성 (1024x1024 필수)
  - 도구: https://www.appicon.co/ 또는 Xcode Asset Catalog
  - 경로: `frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- [ ] 스플래시 스크린 이미지 교체
  - 배경색은 이미 `#0A0E17`로 설정됨
  - 로고 이미지: `frontend/ios/App/App/Assets.xcassets/Splash.imageset/`

### 1-6. Universal Links 설정
- [ ] `frontend/public/.well-known/apple-app-site-association`에서 `TEAM_ID`를 실제 값으로 교체
- [ ] S3 배포 시 해당 파일이 `Content-Type: application/json`으로 서빙되는지 확인
- [ ] CloudFront에서 `/.well-known/*` 경로가 차단되지 않는지 확인

### 1-7. 앱 심사 준비물
- [ ] 앱 스크린샷 (iPhone 6.7", 6.5", iPad 필요 시)
- [ ] 앱 설명 (한국어 + 영어)
- [ ] 개인정보 처리방침 URL
- [ ] 앱 심사 데모 계정 (Apple 심사팀이 로그인할 수 있는 테스트 계정)

---

## 2. Google Play Developer 계정 승인 후

### 2-1. Play Console 설정
- [ ] Google Play Console에서 앱 생성
- [ ] 패키지명: `com.bridgespots.app`
- [ ] 앱 카테고리: Productivity

### 2-2. 서명 키 생성
```bash
# Release keystore 생성
keytool -genkey -v -keystore bridge-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias bridge-key \
  -storepass YOUR_PASSWORD \
  -keypass YOUR_PASSWORD

# Base64 인코딩 (GitHub Secrets용)
base64 -i bridge-release.jks | pbcopy
```

### 2-3. Android 서명 설정
- [ ] `frontend/android/app/build.gradle`에 release signingConfig 추가:
```groovy
android {
    signingConfigs {
        release {
            storeFile file("keystore.jks")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

### 2-4. Play Console 서비스 계정
- [ ] Google Cloud Console → IAM → 서비스 계정 생성
- [ ] Play Console → Setup → API access → 서비스 계정 연결
- [ ] JSON 키 다운로드

### 2-5. Firebase 설정 (Android)
- [ ] Firebase Console → Project Settings → Android 앱 추가 (`com.bridgespots.app`)
- [ ] `google-services.json` 다운로드
- [ ] `frontend/android/app/google-services.json`에 배치

### 2-6. GitHub Secrets 등록
```
ANDROID_KEYSTORE_BASE64    = (keystore 파일 base64)
ANDROID_KEYSTORE_PASSWORD  = (keystore 비밀번호)
ANDROID_KEY_ALIAS          = bridge-key
ANDROID_KEY_PASSWORD       = (키 비밀번호)
GOOGLE_PLAY_JSON_KEY       = (서비스 계정 JSON 내용 전체)
```

### 2-7. 앱 아이콘
- [ ] `BridgeSpotsIcon.png`에서 Android 아이콘 세트 생성
  - 도구: Android Studio → Image Asset Studio
  - 경로: `frontend/android/app/src/main/res/mipmap-*/`
- [ ] Adaptive icon (foreground + background) 구성

### 2-8. App Links 설정
- [ ] `frontend/public/.well-known/assetlinks.json`에서 `YOUR_SHA256_FINGERPRINT`를 실제 값으로 교체
  ```bash
  # SHA256 fingerprint 확인
  keytool -list -v -keystore bridge-release.jks -alias bridge-key | grep SHA256
  ```

### 2-9. Play Store 심사 준비물
- [ ] 앱 스크린샷 (휴대전화, 태블릿 7" / 10")
- [ ] 그래픽 이미지 (1024x500)
- [ ] 앱 설명 (한국어 + 영어)
- [ ] 개인정보 처리방침 URL
- [ ] 데이터 안전 섹션 작성 (수집 데이터 유형 명시)

---

## 3. Firebase 푸시 알림 설정 (공통)

### 3-1. Firebase 프로젝트
- [ ] Firebase Console에서 기존 프로젝트 확인 (이미 Analytics/Performance 사용 중)
- [ ] Cloud Messaging 활성화 확인

### 3-2. iOS APNs 연동
- [ ] Apple Developer → Keys → APNs 키 생성 (.p8)
- [ ] Firebase Console → Project Settings → Cloud Messaging → iOS에 APNs 키 등록

### 3-3. 백엔드 Firebase Admin 설정
- [ ] Firebase Console → Project Settings → Service Accounts → Generate new private key
- [ ] JSON 파일을 Base64 인코딩: `base64 -i firebase-adminsdk.json | pbcopy`
- [ ] GitHub Secrets에 등록:
```
FIREBASE_CREDENTIALS_JSON = (base64 인코딩된 서비스 계정 JSON)
```
- [ ] 서버 환경변수에도 동일하게 설정 (Elastic Beanstalk 환경 변수)

---

## 4. 첫 배포 순서

### Step 1: 로컬 테스트
```bash
cd frontend

# 빌드 + 네이티브 동기화
npm run build && npx cap sync

# iOS 시뮬레이터에서 테스트
npx cap open ios
# → Xcode에서 시뮬레이터 선택 후 Run

# Android 에뮬레이터에서 테스트
npx cap open android
# → Android Studio에서 에뮬레이터 선택 후 Run
```

### Step 2: 베타 배포
```bash
# iOS → TestFlight
gh workflow run deploy-mobile.yml -f platform=ios -f track=beta

# Android → Play Store Internal
gh workflow run deploy-mobile.yml -f platform=android -f track=beta
```

### Step 3: QA 테스트
- [ ] TestFlight에서 iOS 앱 설치 및 테스트
- [ ] Play Store Internal에서 Android 앱 설치 및 테스트
- [ ] 확인 항목:
  - 로그인 (이메일 + Google OAuth)
  - 칸반 보드 조회/조작
  - 푸시 알림 수신
  - 딥링크 동작
  - 오프라인 → 온라인 전환

### Step 4: 프로덕션 출시
```bash
# 버전 번호 업데이트 후
gh workflow run deploy-mobile.yml -f platform=both -f track=production
```

---

## 5. 구현 완료된 항목 (참고)

| 항목 | 상태 | 파일 |
|------|:---:|------|
| Capacitor 코어 설정 | ✅ | `frontend/capacitor.config.ts` |
| iOS 프로젝트 | ✅ | `frontend/ios/` |
| Android 프로젝트 | ✅ | `frontend/android/` |
| 플랫폼 감지 유틸 | ✅ | `frontend/src/app/utils/platform.ts` |
| 네이티브 Google OAuth | ✅ | `frontend/src/app/utils/nativeAuth.ts` |
| 푸시 알림 (Frontend) | ✅ | `frontend/src/app/utils/pushNotifications.ts` |
| 푸시 알림 (Backend FCM) | ✅ | `PushNotificationService.java` |
| 디바이스 토큰 API | ✅ | `DeviceTokenController.java` |
| Firebase Admin 설정 | ✅ | `FirebaseConfig.java` |
| DB 마이그레이션 | ✅ | `V55__create_device_tokens_table.sql` |
| CORS 설정 | ✅ | `SecurityConfig.java` 외 2개 |
| 딥링크 핸들러 | ✅ | `frontend/src/app/utils/deepLinks.ts` |
| CI/CD 워크플로우 | ✅ | `.github/workflows/deploy-mobile.yml` |
| iOS Fastlane | ✅ | `frontend/ios/App/Fastlane/Fastfile` |
| Android Fastlane | ✅ | `frontend/android/fastlane/Fastfile` |
| Well-known 파일 | ✅ | `frontend/public/.well-known/` |
| PWA 네이티브 분기 | ✅ | `PWAUpdatePrompt.tsx` |
