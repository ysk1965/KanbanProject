# BRIDGE 플러그인

Claude가 만든 결과물을 **BRIDGE 마이스페이스**에 저장·공유하는 Claude Code 플러그인.
MCP 서버(저장 통로) + 스킬(워크플로우)을 하나로 묶어 사내 마켓플레이스로 배포한다.

```
bridge-plugin/
├── .claude-plugin/
│   ├── plugin.json          # 매니페스트 (userConfig로 PAT 수집 + MCP 서버 등록)
│   └── marketplace.json     # 사내 마켓플레이스 (이 플러그인 1개)
├── mcp-server/              # 얇은 어댑터 (BRIDGE REST ↔ MCP 툴)
│   └── dist/bridge-mcp.mjs  # 배포용 단일 번들 (node_modules 불필요)
└── skills/
    └── save-to-bridge/      # 워크플로우: 결과물 생성 → 저장 → 공유
```

## 구성 요소

- **MCP 툴** (`spots` 서버):
  - **노트 툴(쓰기)**: `list_boards`, `save_document`, `update_document`, `get_document`, `list_documents`, `share_document` — 마이스페이스/보드/조직 노트 API와 1:1(`board_id`/`org_id`로 스코프).
  - **읽기 툴**: 개인 `get_my_today`·`get_my_board_tasks`·`get_my_calendar`, 보드 `get_board_stats`·`get_board_tasks`·`get_board_milestones`·`generate_board_report`, 조직 `list_org_boards`·`get_org_insights` — BRIDGE 데이터를 조회해 스킬이 가공.
- **스킬**:
  - `save-to-bridge`: "브릿지에 저장/공유해줘" 요청 시 결과물을 만들고 저장·공유.
  - `work-briefing`: "오늘 뭐부터 하지" — 개인 업무 브리핑(읽기 중심).
  - `save-weekly-report`: "이번 주 리포트" — 한 보드의 팀 주간 리포트를 보드 노트로 게시.
  - `save-project-report`: "프로젝트 보고서" — 조직 여러 보드 롤업을 조직 노트로 게시.

## 사전 준비 — PAT 발급

플러그인은 사용자를 대신해 BRIDGE에 붙으므로 개인 액세스 토큰이 필요하다:

```bash
ACCESS=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"..."}' \
  | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).accessToken))')

curl -s -X POST http://localhost:8080/api/v1/pat \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"name":"Claude Code","expires_in_days":365}'
# → { "token": "bsp_...", ... }   ← 이 token 을 한 번만 복사
```

## 빌드 (배포 전 1회)

```bash
cd mcp-server
npm install
npm run bundle     # → dist/bridge-mcp.mjs (커밋 대상)
```

> 번들은 모든 의존성을 인라인하므로 설치 측에 node_modules가 없어도 실행된다.
> 이 파일은 배포를 위해 git에 커밋한다(그 외 dist 산출물은 무시).

## 설치 (사용자)

```bash
# 1) 마켓플레이스 추가 (로컬 경로 · 또는 git 저장소)
/plugin marketplace add ./bridge-plugin

# 2) 플러그인 설치
/plugin install bridge@bridge-internal
```

설치 시 **BRIDGE 개인 액세스 토큰**을 물어본다. 입력한 값은 OS 보안 저장소(macOS Keychain 등)에
안전하게 보관되며 설정 파일에 평문으로 남지 않는다. `bridge_api_url`, `bridge_frontend_url`은
기본값(로컬)을 두었고 필요 시 바꾼다.

### 특정 보드에 연결 고정 (선택)

설치 시 `bridge_default_board_id` 를 넣으면 **이 연결의 저장이 기본으로 그 보드로** 간다
(회고·문서를 항상 "우리 팀 보드"에 쌓고 싶을 때). 규칙:

- 저장 시 `board_id` 를 명시하면 그게 우선(override).
- `board_id="me"` 를 주면 기본 보드가 있어도 **마이스페이스에 강제 저장**.
- 비우면 기존대로 마이스페이스가 기본.

보드 id 는 앱 URL 또는 `list_boards` 툴로 확인한다. 저장은 여전히 **MEMBER 이상 + 보드 프리미엄**이
필요하며, 아니면 403 으로 막힌다. 연결을 여러 개 등록해 각기 다른 보드로 고정할 수도 있다.

## 사용

```
"이번 스프린트 회고를 리포트로 정리해서 브릿지에 저장하고 공유 링크 줘"
```

→ 스킬이 리포트를 만들고 → `save_document`로 저장 → `share_document`로 `…/n/{code}` 링크 발급.

## 확장 (로드맵 4단계)

MCP 툴을 하나씩 더하면(예: `add_comment`, `tag_document`, `search_documents`) 스킬 변경 없이
기능이 늘어난다. 검색은 BRIDGE 백엔드에 검색 API가 생기면 `search_documents` 툴을 추가한다.
