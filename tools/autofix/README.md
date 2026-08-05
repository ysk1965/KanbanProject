# 자동수정 파이프라인 — 대상 맥 셋업

BRIDGE가 JIRA 이슈를 트리아지해 후보를 고르고, 유니티 환경이 갖춰진 맥 1대가 한 건씩 순차로 고쳐
PR을 올리는 파이프라인. 이 문서는 **그 맥에서 해야 할 셋업**만 다룬다.

> ⚠️ 여기 있는 러너와 절차는 **실제 맥에서 아직 검증되지 않았다.** 첫 실행은 반드시
> 이슈 1건을 수동으로(`NO_REPORT=1`) 돌려 끝까지 확인한 뒤 데몬으로 넘길 것.

---

## 0. 구조 — GitHub Actions를 쓰지 않는다

```
BRIDGE (EB)                              맥
  큐 ── claim ◀──────────── 20초마다 폴링 ── bridge-autofix-runner.sh
                                                  │
                                          autofix-once.sh
                                            ├ claude -p + Unity MCP  ← Editor 연 프로젝트(진단)
                                            ├ verify-compile.sh      ← 별도 클론 batchmode(게이트)
                                            └ gh pr create
  결과 ◀──── POST /callback ──────────────────────┘
```

맥이 **가져간다**(pull). 서버가 밀어 넣지 않는 이유:

- 맥은 사내망 뒤에 있어 인바운드가 없다. 폴링이면 아웃바운드만으로 끝난다.
- Unity Editor는 프로젝트당 1개뿐이라 언제 여유가 있는지는 맥만 안다.
- 대상 저장소에 워크플로 파일을 심을 필요가 없다 — 기본 브랜치가 무엇인지, 거기에 파일이 올라갔는지
  신경 쓸 일이 사라진다.
- BRIDGE의 GitHub App에 Actions 권한이 필요 없다. 브랜치 push와 PR 생성은 맥의 `gh`가 한다.

**필요한 비밀은 두 개뿐이다** — 맥의 `ANTHROPIC_API_KEY`와 BRIDGE 러너 토큰. 저장소 시크릿은 쓰지 않는다.

---

## 1. 먼저 — 이 저장소에는 테스트가 없다

`GWBM013-auto-battle-project` 기준: asmdef 28개, **테스트 어셈블리 0개, `[Test]`/`[UnityTest]` 사용 파일 0개.**

트리아지 판정 기준이 "고쳐졌음을 자동 검증할 수 있는가"라서, 지금 상태에서 자동 게이트는
**컴파일 통과 하나뿐**이다. 컴파일은 문법·타입 오류만 잡고 동작은 보장하지 않는다.
즉 나오는 PR은 전부 사람 리뷰가 필수다. 이걸 전제로 기대치를 잡을 것.

BRIDGE 쪽 트리아지에서 저장소 검증 환경을 `테스트 없음`으로 설정해야 판정이 부풀지 않는다.
(보드 → JIRA 설정 → 자동수정 트리아지 → 저장소 검증 환경)

---

## 2. 환경 조사

먼저 대상 맥에서 현황부터 찍는다. 읽기만 하고 아무것도 바꾸지 않는다.

```bash
./probe-unity-host.sh /path/to/GWBM013-auto-battle-project
```

출력에서 반드시 확인할 것:

| 항목 | 왜 |
|------|-----|
| 프로젝트 Unity 버전 = 설치된 에디터 버전 | 다르면 Hub에서 해당 버전 설치 필요 |
| 디스크 여유 50GB+ | Library 재빌드가 반복된다 |
| 시스템 슬립 비활성 | 잠들면 러너가 멈춘다 |
| `gh` 인증됨 | PR 생성 경로 |
| Library 크기 | 처리량을 지배하는 값 |

마지막으로 재임포트 시간을 실측한다(콜드/웜 2회). 이 숫자로 이슈 1건당 소요와 하루 상한이 정해진다.

---

## 3. Unity Editor 상시 기동

Unity MCP는 **실행 중인 Editor**에 IPC로 붙는다. 에디터가 꺼져 있으면 진단도 컴파일 확인도 못 한다.

```bash
# 슬립 차단 (로그아웃하면 풀리므로 launchd 등록을 권장)
caffeinate -dimsu &
```

MCP 서버 자체도 **터미널 창이 아니라 launchd로 띄운다.** 에디터의 MCP 창은 이 서버를
`Library/MCPForUnity/TerminalScripts/mcp-terminal.command`로 터미널에서 실행하는데, 그 창을 닫으면
서버가 죽고 `RunState`의 pidfile만 남아 **떠 있는 것처럼 보인다.** 그 상태에서 파이프라인은
멈추지 않고 조용히 진단 품질만 떨어진다(에이전트가 콘솔을 못 읽고 소스만 본다).

```bash
cp runner/com.bridge.unity-mcp.plist ~/Library/LaunchAgents/   # USERNAME·프로젝트 경로 치환
launchctl load ~/Library/LaunchAgents/com.bridge.unity-mcp.plist
launchctl list | grep bridge.unity-mcp     # 2번째 열이 0이어야 산 것이다
```

살아 있는지는 프로젝트 디렉터리에서 `claude mcp list`로 확인한다 — pidfile이 아니라 이쪽이 정본이다.
`unity: ... ✔ Connected`이어야 한다.

- 에디터 모달이 뜨면 MCP 진단이 멈춘다. 첫 실행 전에 라이선스·패키지 임포트·API 업데이터
  팝업을 모두 정리해 둘 것. 다만 **게이트는 Editor와 무관하므로**(4번) Editor가 죽어도
  파이프라인은 계속 돈다 — 진단 품질만 떨어지고, 러너가 경고를 로그에 남긴다.
- 러너는 Editor가 열어둔 **바로 그 디렉터리**에서 작업한다. 러너가 도는 동안 그 프로젝트를
  사람이 만지면 안 된다 — 브랜치가 바뀌고, 끝나면 `git clean -fd`로 untracked 파일이 지워진다.

---

## 4. 컴파일 검증 — 별도 클론 batchmode

저장소에 테스트가 0개인 동안 **컴파일 통과가 유일한 자동 게이트**다. 그래서 이 판정은 LLM도
MCP도 끼지 않는 경로여야 한다. `runner/verify-compile.sh`가 그 역할을 한다.

검증 전용 클론을 하나 더 둔다:

```bash
git clone https://github.com/cookapps-devops/GWBM013-auto-battle-project.git ~/GWBM013-verify
cd ~/GWBM013-verify && git checkout develop

# 초기 임포트를 한 번 돌려 Library를 warm하게 만든다 (여기서만 오래 걸린다)
/Applications/Unity/Hub/Editor/$(awk '/^m_EditorVersion:/ {print $2}' ProjectSettings/ProjectVersion.txt)/Unity.app/Contents/MacOS/Unity \
  -batchmode -quit -nographics -projectPath "$PWD" -logFile /tmp/verify-warmup.log
```

> 이미 임포트된 프로젝트가 있다면 `rsync -a <기존>/Library/ ~/GWBM013-verify/Library/`로
> 몇 시간을 아낄 수 있다(같은 에디터 버전이면 대개 유효하고, 안 맞아도 재임포트로 떨어질 뿐이다).

검증은 매번 이렇게 돈다: 작업 트리의 `Assets`/`Packages`/`ProjectSettings`를 이 클론으로
rsync → `Unity -batchmode -quit` → 로그에서 `error CS####`를 찾아 판정. `Library`는 건드리지
않으므로 warm 상태가 유지돼 1~3분에 끝난다.

**왜 Editor(MCP)로 검증하지 않는가:** 프로젝트가 컴파일 실패 상태면 MCP 브릿지 어셈블리가
로드되지 않아 연결이 끊긴다. 즉 실패를 잡아야 할 바로 그 순간에 검증 경로가 사라진다.
프로젝트 락은 디렉터리 단위라, 클론을 나누면 Editor를 열어둔 채로도 batchmode를 쓸 수 있다.

계약은 그대로다 — 에러 없으면 **exit 0**, 있으면 stdout에 출력하고 **exit 1**. 대상 저장소가
자체 `tools/autofix/verify-compile.sh`를 제공하면 러너가 그쪽을 우선한다.

---

## 4-1. 로케일 테이블 예외 (기본 꺼짐)

자동수정은 코드만 고치고 `.asset`은 건드리지 않는다. 그런데 문구 이슈의 상당수는 코드가 아니라
**테이블의 번역값 자체가 틀린** 건이라, 이 경로가 닫혀 있으면 자동수정이 원리적으로 닿지 못한다.
(같은 재화가 안내 문구에서는 "행동력", 상점에서는 "스테미너"로 갈리는 부류.)

`runner.conf`에 `LOCALE_ASSET_PATHS`를 넣으면 그 파일들에 한해 **이미 존재하는 항목의
`m_Localized` 값만** 고칠 수 있게 열린다. 비워 두면 기능은 꺼진 것이고 동작은 종전과 완전히 같다.

경로는 대상 저장소에서 확인해 채운다:

```bash
git ls-files '*.asset' | grep -iE 'local|locale|string.?table'
```

### 예외를 이 모양으로 좁힌 이유

안전이 아니라 **식별** 때문이다. 확장자 필터(`revert_editor_churn`)를 열면 에디터 재직렬화와
에이전트의 수정을 구분할 근거가 사라지는데, "`m_Localized` 줄만 1:1로 바뀌었다"는 diff 모양이
그 구분을 대신한다 — 에디터가 재직렬화하면 구조가 통째로 흔들려 이 검사를 절대 통과하지 못한다.

`guard_locale_changes`가 PR 직전에 강제하는 것:

| 검사 | 벗어나면 |
|------|----------|
| `m_Localized` 외의 줄이 바뀌지 않았다 (항목 추가·삭제·재정렬 차단) | 실패 |
| `+`/`-` 개수가 같다 (값 교체만) | 실패 |
| `\uXXXX` 이스케이프 자리수가 온전하다 | 실패 |
| 바뀐 값이 `LOCALE_MAX_CHANGED_VALUES`(기본 6)줄 이하다 | 실패 |
| 테이블 파일을 새로 만들거나 지우거나 옮기지 않았다 | 실패 |
| `.asset.meta`는 예외 대상이 아니다 — 바뀌었으면 에디터가 만진 것이므로 되돌린다 | 되돌림 |

조용히 되돌리지 않고 **실패로 끝내는** 것이 요점이다. 되돌리면 "변경 없음"으로 보고돼 사람이
원인을 영영 모른다.

`verify-compile.sh`도 `AUTOFIX_WATCH_ASSETS`로 이번에 건드린 파일만 임포트 실패를 추가로 본다
(YAML이 깨져도 `error CS`는 나오지 않는다). 파일 목록을 주지 않으면 이 검사는 돌지 않는다.

PR 본문에는 `\uXXXX`를 디코드한 before/after가 실린다 — 리뷰어가 읽을 수 없는 diff는 리뷰가 아니다.

```
Assets/Localization/ko.asset
- 행동력이 부족합니다.
+ 스테미너가 부족합니다.
```

---

## 4-2. 로케일 원본이 저장소 밖에 있을 때 (시트 등)

**로컬라이즈 원본이 구글 시트고 `.asset`이 익스포트 결과물이면, 4-1의 예외는 함정이다.**
`.asset` 수정은 다음 익스포트에 덮어쓰인다. PR은 초록불로 머지되고 며칠 뒤 조용히 되돌아간다 —
고쳤다고 믿게 만들고 실제로는 안 고친, 자동수정이 만들 수 있는 가장 나쁜 결과다.

러너는 시트에 닿을 수 없어 이걸 막을 방법이 없다. 대신 `LOCALE_SOURCE_URL`을 채우면 그 사실이
프롬프트에 실리고, 에이전트는 **아무것도 고치지 않고 "원본의 이 항목을 이렇게 바꿔라"는 보고만
남기고 끝내도록** 지시받는다. 그 건에서는 `no_change`가 실패가 아니라 정답이다.

```
[로컬라이즈 원본 수정 필요]
- 항목: MSG_NOT_ENOUGH_AP (#id 4)
- 언어: kr
- 현재: 행동력이 부족합니다.
- 변경: 스테미너가 부족합니다.
- 근거: QASA-116 본문 — 상점 표기가 '스테미너'로 확정됨
```

보고는 결과 회신의 `log_excerpt`에 실려 도크의 **에이전트 로그**에 그대로 뜬다. 사람은 그걸 들고
시트를 고친다. 이 경로에는 저장소 쪽 준비물이 없다 — `runner.conf` 한 줄이 전부다.

> **`LOCALE_SOURCE_URL`은 `LOCALE_ASSET_PATHS`와 독립적이다.** 예외를 켜지 않아도 실린다.
> 시트가 정본이면 `LOCALE_ASSET_PATHS`는 **켜지 않는 쪽이 낫다** — 어차피 사람이 시트를 고쳐야
> 완결되고, 그 목적은 보고만으로 달성된다. 켜는 쪽이 나은 경우는 익스포트가 수동이거나 드물어서
> `.asset` PR이 실제 빌드에 반영될 때뿐이다. (둘 다 켜면 값 수정과 보고가 함께 나가고, PR 본문에
> 머지 전 시트 확인을 요구하는 경고가 붙는다.)

### 보고의 정확도를 좌우하는 것 — `LOCALE_SOURCE_MIRROR`

이 경로의 성패는 **에이전트가 원본의 올바른 키를 짚는가** 하나로 갈린다. 그런데 로케일 `.asset`은
값이 `\uXXXX`라 증상에 나온 한글 문구로 grep하면 0건이 나온다 — 에이전트는 키와 `m_Id`를 징검다리
삼아 돌아가야 하고, 거기서 틀리면 그럴듯하지만 틀린 키가 보고에 실린다.

원본에서 내려받은 사본이 저장소에 커밋돼 있으면 그 경로를 `LOCALE_SOURCE_MIRROR`에 넣는다.
이스케이프되지 않은 파일이면 **한글 문구로 바로 grep이 되어** 역추적이 한 번에 끝난다.

```bash
# 후보 찾기 — 커밋된 익스포트 원문이 있는지
git grep -l -F '행동력이 부족합니다'      # 걸리면 그 파일이 사본이다
```

GWBM013 기준: `Assets/OriginalSpecLanguage.json` (컬럼 `#id, #분류값, #서브 분류, key, kr, en, …`).
경로에 파일이 없으면 안내를 생략하고 러너 로그에 경고를 남긴다 — 설정해 두고 파일이 옮겨진 상태가
가장 나쁘다(에이전트는 지름길을 잃은 채 돌고, 화면에는 "키를 못 찾았다"로만 남는다).

### 그다음 — 시트에 직접 쓰는 것

보고를 사람이 시트에 옮겨 적는 단계까지 자동화하려면 서비스 계정과 제안 시트가 필요하고,
원본에 직접 쓰는 것은 그보다 훨씬 뒤의 이야기다. 준비물과 가드레일은
[`docs/autofix-localization-sheet.html`](../../docs/autofix-localization-sheet.html)에 정리돼 있다.

---

## 5. 러너 설치

```bash
mkdir -p ~/bridge-autofix/logs
cp runner/bridge-autofix-runner.sh runner/autofix-once.sh runner/verify-compile.sh ~/bridge-autofix/
cp runner/runner.conf.example ~/bridge-autofix/runner.conf
chmod 600 ~/bridge-autofix/runner.conf     # 토큰이 들어간다
```

`~/bridge-autofix/runner.conf`를 채운다. `BRIDGE_TOKEN`은
**보드 → JIRA 설정 → 자동수정 → 러너 토큰 발급**에서 받는다(클립보드로 복사된다).

수동으로 한 건 돌려본 뒤(7번) launchd에 올린다:

```bash
cp runner/com.bridge.autofix.plist ~/Library/LaunchAgents/
# plist 안의 USERNAME 3곳을 실제 사용자명으로 치환
launchctl load ~/Library/LaunchAgents/com.bridge.autofix.plist
tail -f ~/bridge-autofix/logs/runner.log
```

> LaunchAgent(사용자 세션)로 올린다. Unity Editor·MCP·`gh` 인증이 모두 사용자 세션에 묶여 있어
> LaunchDaemon(root)으로는 어느 것에도 닿지 못한다. 재부팅 후에도 살리려면 자동 로그인을 켤 것.

---

## 6. 러너 ↔ BRIDGE 프로토콜

세 엔드포인트 모두 `Authorization: Bearer <BRIDGE_TOKEN>`을 쓴다. 토큰은 보드별이고,
JIRA 웹훅 토큰과 별개라 한쪽을 회전해도 다른 쪽이 죽지 않는다.

| 호출 | 시점 | 내용 |
|------|------|------|
| `POST /api/v1/jira/autofix/runner/{boardId}/claim` | 20초마다 | 다음 한 건을 가져온다 |
| `POST /api/v1/jira/autofix/runner/{boardId}/heartbeat` | 작업 중 60초마다 | 생존 신고 |
| `POST /api/v1/jira/autofix/callback/{boardId}` | 작업 종료 | 결과 회신 |

**claim은 내줄 게 없어도 200으로 `reason`을 돌려준다.** 러너 로그에 왜 조용한지가 남아야
맥 앞에 앉기 전에 원인을 안다.

claim 요청에는 러너 자가진단이 같이 실린다 — 같은 이유로, 이번엔 **화면**이 원인을 말할 수 있게:

```json
{ "runner_name": "mac-unity-01",
  "status": { "disk_free_gb": 45, "unity_running": true, "unity_version_ok": true,
              "verify_ready": true, "gh_authenticated": true, "project_dirty": false } }
```

- 확인에 실패한 항목은 `false`가 아니라 **키를 뺀다.** 모르는 것을 문제로 표시하면 화면이 거짓말을 한다.
- 서버는 아는 필드만 뽑아 다시 직렬화해 저장한다. 이 엔드포인트는 보드 토큰만으로 열려 있어서
  임의 문자열이 DB로 들어가는 통로가 되면 안 된다.
- `status`를 안 보내면 마지막으로 알던 값을 유지한다(heartbeat가 그렇다) — 구버전 러너나 진단
  실패가 "정상"으로 보이면 안 되지만, 알던 것까지 잃으면 화면이 더 말할 게 없어진다.
- `verify_ready: false`면 도크가 **후보 담기를 막는다.** 담아봐야 전부 PR 직전에 실패하는데,
  실패한 작업은 이슈당 1회 가드레일에 걸려 다시 담을 수 없어 후보를 영구히 태운다.

| reason | 뜻 |
|--------|-----|
| `CLAIMED` | 작업을 받았다. `job`에 명세가 들어 있다 |
| `EMPTY` | 큐가 비었다 |
| `IN_FLIGHT` | 서버는 이전 건이 아직 진행 중이라고 본다(회신 유실 의심) |
| `DAILY_LIMIT` | 보드 일일 상한 도달. UTC 자정 이후 재개 |
| `DISPATCH_DISABLED` | 서버에서 자동수정 실행이 꺼져 있다 (`autofix.dispatch-enabled`) |
| `NO_TARGET` | 대상 저장소가 없는 작업이라 실패 처리했다 |

claim이 내주는 작업 명세:

```json
{ "job_id": "...", "job_key": "CHK-7f0e21b9", "job_kind": "MANUAL",
  "title": "빈 이름일 때 저장 버튼 비활성화",
  "instruction": "…서버가 조립한 프롬프트 본문(맥락+대상+지시)…",
  "repo_full_name": "org/repo", "base_ref": "develop",
  "branch": "autofix/CHK-7f0e21b9-9f2e17", "timeout_minutes": 60,
  "comments": [ { "author": "…", "created_at": "…", "body": "…" } ],
  "materials": [ { "filename": "bug.png", "mime_type": "image/png",
                   "size": 184320, "url": "https://…" } ] }
```

`materials`는 파일이 아니라 **URL만** 온다 — 스크린샷 몇 장이면 명세 JSON이 수 MB가 되고, 그 JSON은
로그에도 남는다. 러너가 필요한 것만 직접 받고, 영상은 프레임을 뽑아 이미지로 바꿔 준다(ffmpeg).

출처는 둘이다. **맡길 때 화면에서 올린 파일이 먼저 오고**, 그 뒤에 태스크 댓글 첨부가 붙는다.
러너는 `MAX_IMAGES`를 넘긴 자료를 뒤에서부터 버리므로 순서가 곧 우선순위다 — 사람이 이번 위임을
위해 고른 그림이 태스크에 쌓여 온 첨부보다 언제나 지시문에 가깝다.

> 위임 첨부는 서버가 파일당 `autofix.max-delegate-material-mb`(기본 10MB)까지 받는다.
> 러너의 `MAX_MATERIAL_MB`가 그보다 작으면 화면에서는 올라간 파일이 맥에서 조용히 버려진다.
> 두 값을 함께 움직여야 한다.

**러너는 작업의 출처를 모른다.** JIRA 이슈든, 사람이 맡긴 태스크든, 체크리스트 항목이든
`instruction` 한 덩어리로 온다. 맥락(부모 태스크 설명)과 범위 제한("다른 항목은 건드리지 않는다")을
문장으로 만드는 것은 전부 서버의 일이다 — 러너에 출처별 분기가 생기면 프롬프트를 고칠 때마다
맥에 재배포해야 하고, 안전장치도 두 벌이 된다.

`job_key` 접두사가 위임 범위를 말한다: `QASA-40`(JIRA 이슈) / `TASK-…`(태스크 전체) / `CHK-…`(항목).
브랜치 이름에 job id가 섞이는 이유는 재시도다 — 실패한 작업의 지시문을 고쳐 다시 맡기는 것이
정상 흐름인데, 브랜치가 같으면 remote에 남은 이전 브랜치와 non-fast-forward로 부딪힌다.

결과 회신 페이로드:

```json
{ "job_id": "...", "job_key": "CHK-7f0e21b9",
  "result": "pr | no_change | failed",
  "pr_url": "...", "failure_reason": "...", "log_excerpt": "…에이전트 로그 꼬리" }
```

- `result=pr`인데 `pr_url`이 비면 **실패로 기록한다** — PR이 산출물이다.
- `log_excerpt`는 화면의 "에이전트 로그"에 그대로 뜬다. Actions 실행 로그 링크가 사라진 자리를
  이게 대신하므로, 실패 시 원인이 여기 담겨야 한다.
- 회신이 유실되면 서버가 90분 뒤 `TIMED_OUT`으로 회수한다. 러너 자체 상한은 60분이라
  정상 경로에서는 회수가 먼저 일어나지 않는다.

---

## 7. 첫 실행 (수동)

데몬을 올리기 전에 한 건을 손으로 돌린다. `NO_REPORT=1`이면 BRIDGE에 아무것도 회신하지 않으므로
큐 상태를 건드리지 않는다.

```bash
cd ~/bridge-autofix
NO_REPORT=1 ./autofix-once.sh ~/bridge-autofix/runner.conf <<'EOF'
{"job_id":"","job_key":"QASA-40","job_kind":"JIRA",
 "title":"프리셋 이름 변경 팝업 문자열",
 "instruction":"이슈 본문과 검증 수단을 여기에 그대로 넣는다",
 "repo_full_name":"cookapps-devops/GWBM013-auto-battle-project",
 "base_ref":"develop","branch":"autofix/QASA-40-manual","timeout_minutes":60}
EOF
```

확인할 것:

1. `Library`가 지워지지 않았는가 (브랜치 전환 직후 재임포트가 안 걸려야 정상)
2. 에이전트가 관련 없는 파일을 건드리지 않았는가
3. 컴파일 검증이 실제로 동작하는가 — 일부러 깨진 코드로 한 번 실패시켜 볼 것
4. 정리 단계 후 작업 트리가 깨끗한가 (다음 실행이 이걸로 막힌다)
5. `.github/` 가드가 도는가 — 워크플로 파일을 일부러 건드리게 시켜 PR 직전에 막히는지 확인

그다음 BRIDGE에서 `autofix.dispatch-enabled`를 켜고(`AUTOFIX_DISPATCH_ENABLED=true`)
데몬을 올린다. 도크의 셋업 체크리스트가 3줄 모두 초록이어야 큐가 흐른다.

---

## 8. 운영 중 확인

| 증상 | 볼 곳 |
|------|-------|
| 도크에 "러너 오프라인" | `launchctl list \| grep bridge.autofix`, `~/bridge-autofix/logs/runner.log` |
| 큐는 찼는데 아무것도 안 나감 | 러너 로그의 claim `reason` |
| 한 건이 30분 넘게 진행 중 | 맥의 Unity에 모달이 떴는지 확인, 안 되면 도크에서 "강제 회수" |
| 실패 이유 | 도크 → 그 외 → 해당 이슈 → 에이전트 로그 |

---

## 9. 아직 검증되지 않은 것

| 항목 | 상태 |
|------|------|
| 러너 스크립트 전체 | cookappsui-Macmini에서 launchd 가동 · claim→처리 경로 확인 (2026-08-05) |
| `verify-compile.sh` | **검증됨** — 통과 exit 0 / 일부러 깨뜨린 `CS0029` 잡고 exit 1 (2026-08-05) |
| Unity MCP 서버 | [CoplayDev/unity-mcp](https://github.com/CoplayDev/unity-mcp) 설치·launchd 상시 기동 (진단 전용, 게이트 아님) |
| 재임포트 실측치 | warm Library 복사 후 검증 1회 **약 8분** (GWBM013, M-series Mac mini) |
| 러너 도는 중 에디터의 작업 트리 개입 | **미해결 위험** — 브랜치 전환 직후 에디터가 자동 리프레시로 `.asset`을 재직렬화하는 것을 관측했다(곧 원복됐다). `git add -A`가 그걸 쓸어담으면 PR에 섞인다. 재발하면 에디터 Auto Refresh를 끄거나 커밋 대상을 코드 경로로 좁힐 것 |
