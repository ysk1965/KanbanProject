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
  "branch": "autofix/CHK-7f0e21b9-9f2e17", "timeout_minutes": 60 }
```

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
| 러너 스크립트 전체 | 실제 맥 미실행 |
| `verify-compile.sh` | 작성됨 · 실제 프로젝트에서 미검증 |
| Unity MCP 서버 | [CoplayDev/unity-mcp](https://github.com/CoplayDev/unity-mcp) 선정 (진단 전용, 게이트 아님) — 설치 전 |
| 재임포트 실측치 | 미측정 (probe 5번 항목) |
