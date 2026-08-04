# 자동수정 파이프라인 — 대상 맥 셋업

BRIDGE가 JIRA 이슈를 트리아지해 후보를 고르고, 유니티 환경이 갖춰진 맥 1대가 한 건씩 순차로 고쳐
PR을 올리는 파이프라인. 이 문서는 **그 맥에서 해야 할 셋업**만 다룬다.

> ⚠️ 여기 있는 워크플로와 절차는 **실제 러너에서 아직 검증되지 않았다.** 첫 실행은 반드시
> 이슈 1건을 수동 dispatch로 돌려 끝까지 확인한 뒤 자동화로 넘어갈 것.

---

## 0. 먼저 — 이 저장소에는 테스트가 없다

`GWBM013-auto-battle-project` 기준: asmdef 28개, **테스트 어셈블리 0개, `[Test]`/`[UnityTest]` 사용 파일 0개.**

트리아지 판정 기준이 "고쳐졌음을 자동 검증할 수 있는가"라서, 지금 상태에서 자동 게이트는
**컴파일 통과 하나뿐**이다. 컴파일은 문법·타입 오류만 잡고 동작은 보장하지 않는다.
즉 나오는 PR은 전부 사람 리뷰가 필수다. 이걸 전제로 기대치를 잡을 것.

BRIDGE 쪽 트리아지에서 저장소 검증 환경을 `테스트 없음`으로 설정해야 판정이 부풀지 않는다.
(보드 → JIRA 설정 → 자동수정 트리아지 → 저장소 검증 환경)

---

## 1. 환경 조사

먼저 대상 맥에서 현황부터 찍는다. 읽기만 하고 아무것도 바꾸지 않는다.

```bash
./probe-unity-host.sh /path/to/GWBM013-auto-battle-project
```

출력에서 반드시 확인할 것:

| 항목 | 왜 |
|------|-----|
| 프로젝트 Unity 버전 = 설치된 에디터 버전 | 다르면 Hub에서 해당 버전 설치 필요 |
| 디스크 여유 50GB+ | Library 재빌드가 반복된다 |
| 시스템 슬립 비활성 | 잠들면 배치가 멈춘다 |
| `gh` 인증됨 | PR 생성 경로 |
| Library 크기 | 처리량을 지배하는 값 |

마지막으로 재임포트 시간을 실측한다(콜드/웜 2회). 이 숫자로 이슈 1건당 소요와 하루 상한이 정해진다.

---

## 2. Unity Editor 상시 기동

Unity MCP는 **실행 중인 Editor**에 IPC로 붙는다. 에디터가 꺼져 있으면 진단도 컴파일 확인도 못 한다.

```bash
# 슬립 차단 (로그아웃하면 풀리므로 launchd 등록을 권장)
caffeinate -dimsu &
```

- 에디터에 모달 다이얼로그가 하나라도 뜨면 **파이프라인 전체가 멈춘다.** 첫 실행 전에
  라이선스·패키지 임포트·API 업데이터 팝업을 모두 정리해 둘 것.
- 프로젝트를 열어둔 채로는 `-batchmode`를 쓸 수 없다(프로젝트 락). 아래 4번 참고.

---

## 3. 셀프호스티드 러너 설치

대상 저장소 → Settings → Actions → Runners → New self-hosted runner (macOS).

라벨을 **정확히** 이렇게 붙인다 — 워크플로의 `runs-on`과 일치해야 한다:

```
self-hosted, macOS, unity
```

러너는 서비스로 등록해 재부팅 후에도 살아있게 한다:

```bash
cd ~/actions-runner
./svc.sh install
./svc.sh start
```

> 러너 작업 디렉터리(`~/actions-runner/_work/...`)와 **Editor로 열어둔 프로젝트 경로가 같아야 한다.**
> 다르면 에디터가 보는 파일과 러너가 고치는 파일이 달라진다. 러너를 붙이기 전에 기존 체크아웃을
> `_work` 아래로 옮기거나, 러너 워크스페이스를 기존 경로로 심볼릭 링크할 것.

---

## 4. 컴파일 검증 스크립트 (필수 · 미작성)

**여기가 이 셋업의 유일한 빈칸이다.**

에디터가 프로젝트를 잠그고 있어서 `Unity -batchmode -runTests`를 쓸 수 없다. 따라서 컴파일 확인도
실행 중인 Editor를 통해야 하는데, 그 방법은 설치한 Unity MCP 서버마다 다르다
(대개 "리컴파일 트리거 + 콘솔 에러 조회" 도구를 제공한다).

대상 저장소에 `tools/autofix/verify-compile.sh`를 만들고, 아래 계약만 지키면 된다:

- 컴파일 에러가 없으면 **exit 0**
- 하나라도 있으면 에러를 stdout에 출력하고 **exit 1**

이 스크립트가 없으면 워크플로는 PR을 만들기 전에 실패한다 — 검증 없이 PR이 나가는 것보다 낫다.

---

## 5. 워크플로 배치

`workflows/autofix.yaml`을 **대상 저장소**의 `.github/workflows/autofix.yaml`로 복사한다.

`cookapps-devops/GWBM013-auto-battle-project` 기준 브랜치 구성:

| | 값 | 이유 |
|---|---|---|
| 기본 브랜치 | `develop` | `workflow_dispatch`는 **여기 있는 파일만** 인식한다 |
| 디스패치 `ref` | `develop` | 워크플로 정의를 읽어올 브랜치 |
| `base_ref` 입력 | `develop` | 실제로 고칠 코드. 체크아웃 단계가 이 값을 쓴다 |

`main`은 `develop`보다 4천여 커밋 뒤처진 사실상 사문화 브랜치라 여기에 올리면 안 된다.
로컬 클론의 `origin/HEAD`는 클론 시점 캐시라 `main`을 가리킬 수 있으니 믿지 말 것 —
실제 값은 이렇게 확인한다:

```bash
gh api /repos/cookapps-devops/GWBM013-auto-battle-project --jq .default_branch
```

> 이 저장소의 기존 워크플로는 `.yaml` 확장자를 쓴다(`build-android-google.yaml`). 맞춰 뒀다.

필요한 저장소 시크릿:

| 시크릿 | 용도 |
|--------|------|
| `ANTHROPIC_API_KEY` | Claude Code 헤드리스 실행 |
| `BRIDGE_CALLBACK_TOKEN` | 결과 회신 인증 (콜백을 쓸 때만) |

`GITHUB_TOKEN`은 Actions가 자동 주입한다. 브랜치 push와 PR 생성은 이 토큰이 하므로
별도 PAT가 필요 없다.

---

## 6. GitHub App 권한 — 정정

이전 계획서에서 `contents:write` + `pull_requests:write` + `actions:write`가 필요하다고 했는데,
**실제로는 `Actions: Read and write` 하나면 된다.**

코드 수정·브랜치 push·PR 생성은 전부 러너 안에서 워크플로의 `GITHUB_TOKEN`이 하고, BRIDGE의 App은
`workflow_dispatch`를 부르는 일만 한다. 권한을 넓히면 **기존 설치자 전원이 재승인**해야 하므로
최소로 유지하는 편이 낫다.

---

## 7. 첫 실행 (수동)

자동화를 붙이기 전에 GitHub UI에서 직접 한 건 돌린다:

Actions → BRIDGE Autofix → Run workflow → 트리아지가 후보로 뽑은 이슈 하나를 입력.

확인할 것:

1. `Library`가 지워지지 않았는가 (체크아웃 직후 재임포트가 안 걸려야 정상)
2. 에이전트가 관련 없는 파일을 건드리지 않았는가
3. 컴파일 검증이 실제로 동작하는가 — 일부러 깨진 코드로 한 번 실패시켜 볼 것
4. 정리 단계 후 작업 트리가 깨끗한가 (다음 실행이 이걸로 막힌다)

---

## 8. 아직 검증되지 않은 것

| 항목 | 상태 |
|------|------|
| 워크플로 전체 | 실제 러너 미실행 |
| `verify-compile.sh` | 미작성 — MCP 서버 선택에 종속 |
| Unity MCP 서버 선택 | 미정 |
| 재임포트 실측치 | 미측정 (probe 5번 항목) |
| 콜백 수신 엔드포인트 | BRIDGE에 미구현 (Step 3) |
