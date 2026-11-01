# 홈 화면 위젯 — iOS · 안드로이드 (갈피 퀘스트 · 오늘 할 일 · 오늘의 말씀)

시안: https://claude.ai/artifact/9Fc4P2VH2CbUXuErmQubKH

## 구조

```
앱(WebView, 설교 노트 열려 있을 때)
  useWidgetSync ──buildSnapshot()──▶ BridgeWidget.setSnapshot(json) ──▶ App Group UserDefaults
                                                                           │ widget.snapshot.v1
위젯 확장(SwiftUI) ◀── SnapshotStore.load() (요약 + 대기열 덧입힘) ◀─────────┘
  체크 버튼(AppIntent) ──▶ WidgetShared.appendPending ──▶ widget.pending.v1
앱이 열리거나 돌아올 때 ◀── BridgeWidget.takePending() ── applyPending() → 노트·할 일 저장소
```

- 위젯은 서버를 부르지 않는다 (토큰이 WebView localStorage 안에 있음). 그릴 것은 앱이 모두 계산해 넘긴다.
- 오늘 할 일은 오늘~토요일 칸을 모두 넘겨 앱을 안 열어도 자정에 다음 날 칸으로 바뀐다. 한 주가 지나면 「앱을 열어 주세요」.
- 위젯 체크는 「이 상태로」(done) 를 적는다. 앱이 옮길 때 지금 상태와 같으면 건너뛴다 (두 번 받아도 한 번).
- 적용 실천은 남긴 지 12시간 전에는 위젯에서도 잠긴다 (서버 인정 규칙). 풀리는 시각에 타임라인이 다시 그린다.
- 달란트 적립(서버)은 앱이 체크를 옮겨 노트가 동기화될 때 일어난다 — 위젯에서 체크만 하고 앱을 안 열면 적립이 늦다.

## 파일

| 위치 | 내용 |
|------|------|
| `frontend/src/app/components/personal/sermon/widget/widgetSnapshot.ts` | 요약 계산 (JSON 계약의 기준) |
| `…/widget/widgetPending.ts` | 위젯 체크 → 저장소 |
| `…/widget/useWidgetSync.ts` | SermonTab 에서 쓰는 훅 (iOS 앱에서만 동작) |
| `frontend/src/app/utils/widgetBridge.ts` | 플러그인 래퍼 |
| `frontend/src/app/utils/deepLinks.ts` | `bridgespots://app/sermonnote?…` 처리, `wch=b:c` 이면 성경 읽기 자리 미리 적기 |
| `frontend/ios/App/Shared/WidgetShared.swift` | App Group 키 (앱·위젯 둘 다 컴파일) |
| `frontend/ios/App/App/BridgeWidgetPlugin.swift`, `MainViewController.swift` | 앱 안 플러그인 + 등록 (Main.storyboard 가 MainViewController 를 쓴다) |
| `frontend/ios/App/BridgeWidget/*` | 위젯 확장 (iOS 17+, `com.bridgespots.app.widget`) |

요약 필드를 바꾸면 `widgetSnapshot.ts` 와 `BridgeWidget/Snapshot.swift` 를 같이 고치고 `SNAPSHOT_VERSION` 을 올린다.

## 최소 버전

- 앱 타깃: iOS 14.0 (WidgetKit 때문에 13.0 → 14.0)
- 위젯 확장: iOS 17.0 (대화형 버튼 · AppIntent 설정 · containerBackground)

## 처음 한 번 — Apple Developer / 서명 (수동)

1. Identifiers › `com.bridgespots.app` 에 **App Groups** 켜고 `group.com.bridgespots.app` 연결
2. 새 App ID `com.bridgespots.app.widget` 만들고 같은 App Group 연결
3. 프로비저닝 다시 만들기: `cd frontend/ios/App && bundle exec fastlane match appstore` (readonly 아님 — 두 앱 ID 모두. Fastfile 은 이미 두 ID 로 바뀌어 있음)
4. 로컬 기기 실행: Xcode 에서 App · BridgeWidgetExtension 두 타깃 모두 Signing Team 지정

## 로컬 확인

```bash
cd frontend && npm run build && npx cap sync ios
cd ios/App && pod install && open App.xcworkspace   # 스킴 App 실행 → 홈 화면 길게 눌러 「갈피」 위젯 추가
# 위젯만 컴파일 확인 (Pods 불필요)
xcodebuild -project App.xcodeproj -target BridgeWidgetExtension -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

## 안드로이드 (Glance)

iOS 와 같은 요약 JSON · 같은 대기열 모양 · 같은 플러그인 이름(`BridgeWidget`)이라 웹 코드는 그대로 쓴다 (`widgetSupported()` 가 android 도 켠다).

| 위치 | 내용 |
|------|------|
| `android/app/src/main/java/com/bridgespots/app/widget/WidgetStore.kt` | SharedPreferences `bridge_widget` — 요약 · 대기열 · 말씀 위젯마다 고른 출처 |
| `…/widget/Snapshot.kt` | 요약 읽기 (org.json) · 대기열 덧입히기 · 날짜 |
| `…/widget/BridgeWidgetPlugin.kt` | 앱 안 플러그인, `MainActivity.registerPlugin` 으로 등록 |
| `…/widget/WidgetRefresh.kt` | 세 위젯 다시 그리기 + 다음 그릴 때(잠금 풀림 · 자정) 알람 (RTC, 기기를 깨우지 않음) |
| `…/widget/Actions.kt` | 체크(ActionCallback → 대기열), 앱 링크 열기 |
| `…/widget/Quest·Today·VerseWidget.kt`, `Theme.kt` | 화면 (작은 2×2 · 중간 4×2 · 큰 4×4, 말씀은 작은·중간) |
| `…/widget/VerseConfigActivity.kt` | 말씀 출처 고르기 (Android 12+ 는 놓을 땐 건너뛰고 길게 눌러 다시 설정) |
| `res/xml/widget_*.xml`, `res/drawable/w_*.xml` | 위젯 정보 · 아이콘 · 갈피 마스코트 벡터 |

- iOS 와 다른 점: 잠금 화면 위젯 없음. 리소 망점 · 기울인 도장은 Glance 가 못 그려 뺐다. 크기는 사용자가 늘이고 줄이면 가까운 칸 모양으로 바뀐다.
- Glance 는 한 Row/Column 에 자식 10개까지 — 넘으면 잘린다. 줄을 늘릴 땐 묶어서 넣는다.
- 색을 입히는 동그라미는 `<shape>` 말고 벡터로 (shape 는 tint 하면 안까지 칠해진다).
- 딥링크: 앱이 꺼져 있다 위젯으로 켜지면 안드로이드는 `appUrlOpen` 이 안 와서 `deepLinks.ts` 가 `getLaunchUrl()` 을 한 번 읽는다.
- 빌드: Kotlin 1.9.24 + Compose 컴파일러 1.5.14 + `androidx.glance:glance-appwidget:1.1.0` (AGP 8.2.1 · compileSdk 34 그대로). 따로 할 콘솔 설정 없음 (같은 패키지에 들어간다).

### 확인

```bash
cd frontend && npm run build && npx cap sync android
cd android && ./gradlew :app:assembleDebug   # JDK 17
adb install -r app/build/outputs/apk/debug/app-debug.apk   # 홈 화면 길게 눌러 위젯 → BRIDGE SPOTS
```
