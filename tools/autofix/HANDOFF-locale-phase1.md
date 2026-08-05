# 인계 — 로컬라이즈 1단계를 러너 맥에 올리기

**대상 맥:** `cookappsui-Macmini` · **작성:** 2026-08-05 · **관련 커밋:** `8170e29b`

이 문서는 러너 맥에서 세션을 새로 여는 사람(또는 에이전트)을 위한 것이다. 배경 설명은
최소한만 두고, 순서대로 따라가면 끝나게 썼다. 배경 전체는
[`docs/autofix-localization-sheet.html`](../../docs/autofix-localization-sheet.html)에 있다.

---

## 왜 이 작업을 하는가

문구 이슈의 상당수는 코드가 아니라 **로컬라이즈 테이블의 값 자체**가 틀린 건이다. 그런데
GWBM013의 로컬라이즈 정본은 저장소가 아니라 구글 시트다:

```
구글 시트 (정본)
  → 스펙 서버 /autobattle/api/v1/spec/language
  → Assets/OriginalSpecLanguage.json      (git 커밋됨, 한글 날것)
  → LocalizationImporter (에디터 메뉴)
  → Default_{ko,en}.asset                 (git 커밋됨, \uXXXX)
```

저장소의 `.asset`을 고쳐봐야 **다음 익스포트에 덮어쓰인다.** PR은 초록불로 머지되고 며칠 뒤
조용히 되돌아간다 — 고쳤다고 믿게 만들고 실제로는 안 고친, 자동수정이 만들 수 있는 가장 나쁜
결과다. 러너는 시트에 닿을 수 없으므로 이 경로의 **산출물은 PR이 아니라 보고**여야 한다.

`8170e29b`가 러너를 그렇게 고쳤다. 값이 틀린 건에서 에이전트는 아무것도 수정하지 않고
"시트의 이 항목을 이렇게 바꿔라"는 보고만 남기고 끝낸다. **`no_change`가 실패가 아니라 정답인
경로가 생긴 것이다.**

**이번 단계의 목적은 기능 확인이 아니라 측정이다** — 에이전트가 시트의 올바른 키를 얼마나
정확히 짚는가. 그 숫자가 다음 단계(서비스 계정 + 제안 시트 자동 적재)를 할 가치가 있는지를
결정한다. 정확도가 낮으면 자동화는 잡음만 쌓는다.

---

## 0. 선행 조건 — 저장소가 푸시돼 있는가

`8170e29b`가 원격에 올라가 있어야 맥에서 pull된다. 맥에서 먼저 확인한다:

```bash
cd <BRIDGE 저장소>
git fetch origin && git log --oneline -1 origin/develop
```

`8170e29b` 또는 그것을 포함한 커밋이 보여야 한다. 안 보이면 개발 맥에서 push부터 해야 한다.

> 백엔드(트리아지 비동기화·위임 자료 첨부)는 배포가 필요하지만, **러너 스크립트는 배포와
> 무관하다** — 파일 복사만 하면 된다. 이 문서의 작업은 서버 배포를 기다리지 않아도 된다.

---

## 1. 데몬을 먼저 멈춘다

돌고 있는 작업 중간에 스크립트를 갈아끼우면 그 건이 반쯤 옛 코드로 끝난다.

```bash
launchctl unload ~/Library/LaunchAgents/com.bridge.autofix.plist
tail -20 ~/bridge-autofix/logs/runner.log      # 진행 중인 건이 없는지 확인
```

---

## 2. 스크립트 3개를 복사한다

러너는 저장소가 아니라 `~/bridge-autofix/`의 **사본**을 실행한다. pull만 하고 복사를 빼먹으면
아무것도 바뀌지 않는다 — 이 실수가 가장 흔하다.

```bash
cd <BRIDGE 저장소> && git pull
cp tools/autofix/runner/autofix-once.sh \
   tools/autofix/runner/bridge-autofix-runner.sh \
   tools/autofix/runner/verify-compile.sh \
   ~/bridge-autofix/
```

세 개 다 이번에 바뀌었다:

| 파일 | 무엇이 바뀌었나 |
|------|----------------|
| `autofix-once.sh` | 로케일 원본 안내 분리(`emit_locale_source`) + 계약 불일치 시 실패 메시지 |
| `bridge-autofix-runner.sh` | **`RUNNER_CONTRACT=3`** 을 claim에 실어 보낸다. 없으면 서버가 작업을 안 내준다 |
| `verify-compile.sh` | `AUTOFIX_WATCH_ASSETS` — 이번에 건드린 에셋의 임포트 실패를 추가로 본다 |

계약 버전은 서버(`AutofixRunnerContract.VERSION`)와 러너 둘 다 **3**이라 어긋나지 않는다.
배포된 서버가 아직 구버전이어도 `contract_version`을 무시할 뿐이라 순서를 신경 쓸 필요 없다.

---

## 3. `runner.conf`에 두 줄을 넣는다

```bash
chmod 600 ~/bridge-autofix/runner.conf     # 이미 되어 있어야 정상
```

```ini
LOCALE_SOURCE_URL=https://docs.google.com/spreadsheets/d/17Yyg7-CfFxZEBFvIrGctFnTvZFpp0DaWVAMA_xlZlpw/edit
LOCALE_SOURCE_MIRROR=Assets/OriginalSpecLanguage.json
```

같은 파일에서 함께 확인할 것:

- **`LOCALE_ASSET_PATHS`는 비어 있어야 한다.** 시트가 정본이라 `.asset` 수정은 덮어쓰인다.
  이 값이 켜져 있으면 되돌아갈 PR이 열린다. 주석 처리돼 있으면 그대로 두면 된다.
- **`MAX_MATERIAL_MB`가 `8`로 박혀 있으면 `10`으로 고친다.** 서버는 위임 첨부를 파일당 10MB까지
  받는데 러너가 8이면, 화면에서는 올라간 파일이 맥에서 조용히 버려진다. 스크립트 기본값이
  10이므로 conf에 그 줄이 아예 없으면 손댈 필요 없다.

환경 확인 두 가지:

```bash
ls -l <게임 저장소>/Assets/OriginalSpecLanguage.json   # 미러 파일이 실제로 있는가
command -v ffmpeg                                      # 없으면 위임 '영상'만 프레임 추출 불가
```

미러 파일이 없거나 경로가 틀리면 러너가 경고를 남기고 안내를 생략한다(실패하지는 않는다).
`ffmpeg`는 선택 사항이다 — 이미지 첨부는 없어도 정상 동작한다.

---

## 4. 수동으로 1건 돌린다

`NO_REPORT=1`이면 BRIDGE에 회신하지 않으므로 큐 상태를 건드리지 않는다.
**문구·오탈자 유형 이슈**를 고른다(트리아지 화면의 "유형: 문구·오탈자" 필터).

```bash
cd ~/bridge-autofix
NO_REPORT=1 ./autofix-once.sh ~/bridge-autofix/runner.conf <<'EOF'
{"job_id":"","job_key":"QASA-116","job_kind":"JIRA",
 "title":"[전투] 스테미너 부족 안내 메시지 내 용어 혼용 표기",
 "instruction":"이슈 본문과 기대 문구를 여기에 그대로 넣는다",
 "repo_full_name":"cookapps-devops/GWBM013-auto-battle-project",
 "base_ref":"develop","branch":"autofix/QASA-116-manual","timeout_minutes":60}
EOF
```

### 확인할 4가지

1. **러너 로그에 두 줄이 뜬다**
   ```
   로케일 원본 외부 — https://docs.google.com/spreadsheets/d/17Yyg7.../edit
   로케일 원본 사본 — Assets/OriginalSpecLanguage.json
   ```
   두 번째 줄 대신 `경고: LOCALE_SOURCE_MIRROR 경로에 파일이 없습니다`가 뜨면 3번의 경로를 고친다.

2. **에이전트가 아무 파일도 고치지 않고 끝난다** → `변경 없음 — 에이전트가 고칠 수 없다고
   판단했다`, `RESULT=no_change`. 이 경로에서는 그게 **정답**이다. 코드가 수정됐다면 오히려
   문제다(문구를 하드코딩했거나 다른 키로 돌려 증상만 가린 것) — 그 diff를 확인하고 보고할 것.

3. **에이전트 로그 끝에 보고 블록이 형식대로 나온다**
   ```
   [로컬라이즈 원본 수정 필요]
   - 항목: MSG_NOT_ENOUGH_AP (#id 4)
   - 언어: kr
   - 현재: 행동력이 부족합니다.
   - 변경: 스테미너가 부족합니다.
   - 근거: QASA-116 본문 — 상점 표기가 '스테미너'로 확정됨
   ```

4. **거기 적힌 `#id`·`key`가 시트의 실제 항목과 맞는가** ← 이번 검증의 본론.
   시트에서 그 키를 찾아 현재 값이 보고의 "현재"와 일치하는지 대조한다.
   `#id`는 대역이 정해져 있다(시스템 1~9999 / 전투 11001~12000 / 콘텐츠 25001~40000 등)
   — 대역이 기능과 안 맞으면 잘못 짚은 것이다.

### 확인 후

```bash
git -C <게임 저장소> status        # 작업 트리가 깨끗해야 다음 실행이 막히지 않는다
launchctl load ~/Library/LaunchAgents/com.bridge.autofix.plist
tail -f ~/bridge-autofix/logs/runner.log
```

---

## 5. 측정 — 이 단계의 실제 산출물

문구 이슈 **5~10건**을 돌려 키 지목 정확도를 센다. 큐에 담아 데몬으로 돌려도 되고, 위 수동
경로를 반복해도 된다. 데몬으로 돌리면 보고가 도크의 **에이전트 로그**(그 외 → 해당 이슈)에
그대로 뜬다.

건마다 기록할 것:

| 이슈키 | 보고한 key / #id | 시트 실제 항목 | 일치 | 비고 |
|--------|------------------|----------------|------|------|
| QASA-116 | | | | |

- **일치** — 보고의 키가 시트의 그 항목이고, "현재" 값도 맞다
- **불일치** — 키를 잘못 짚었다. 무엇으로 찾았는지가 로그에 남아 있으니 함께 기록
- **키 못 찾음** — 에이전트가 정직하게 못 찾았다고 보고한 것. 불일치와 **구분해서** 센다.
  지어내지 않은 것은 실패가 아니다

정확도가 납득할 수준이면 2단계(서비스 계정 1개 + 제안 전용 시트 1개 + 자동 적재)로 넘어간다.
낮으면 프롬프트의 키 탐색 절차부터 손봐야 하고, 자동 적재는 하면 안 된다.

---

## 알려진 위험

- **에디터 자동 재직렬화** — 러너가 도는 중 Unity 에디터가 브랜치 전환 직후 `.asset`을
  재직렬화하는 것이 관측됐다. `revert_editor_churn`이 걷어내지만 재발하면 에디터의
  Auto Refresh를 끈다.
- **러너가 도는 동안 그 프로젝트를 사람이 만지면 안 된다** — 브랜치가 바뀌고, 끝나면
  `git clean -fd`로 untracked 파일이 지워진다.
- **컴파일 게이트는 문구의 옳고 그름을 전혀 보지 못한다.** 이 경로에는 애초에 코드 수정이
  없으므로 게이트가 할 일도 없다. 보고의 옳고 그름을 판정하는 것은 사람뿐이다.

---

## 참고

- 러너 셋업 전반: [`README.md`](README.md) — 특히 §4-2(원본이 저장소 밖일 때)
- 설정 키 전체: [`runner/runner.conf.example`](runner/runner.conf.example)
- 시트까지 자동화를 넓힐 때의 준비물·가드레일·단계별 도입안:
  [`docs/autofix-localization-sheet.html`](../../docs/autofix-localization-sheet.html)
