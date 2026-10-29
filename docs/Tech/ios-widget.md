# iOS 위젯 (갈피 퀘스트 · 오늘 할 일 · 오늘의 말씀)

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
