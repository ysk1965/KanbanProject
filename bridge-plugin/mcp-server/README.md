# BRIDGE MCP 서버 · `bridgespots-mcp`

Claude(및 MCP 호환 클라이언트)가 만든 결과물을 **사용자의 BRIDGE 마이스페이스/보드**에
저장·조회·공유하는 얇은 어댑터. 데이터 소유권·권한·감사는 전부 BRIDGE가 갖고,
이 서버는 사용자 개인 액세스 토큰(PAT)을 통과시키는 통로일 뿐입니다.

## 원커맨드 설치 (npx)

npm 배포 후, 값이 박힌 한 줄로 설치+연결이 끝납니다:

```bash
claude mcp add bridge --scope user \
  --env BRIDGE_PAT="bsp_..." \
  --env BRIDGE_API_URL="https://<배포된 BRIDGE 백엔드>" \
  --env BRIDGE_DEFAULT_BOARD_ID="<board-id>" \
  -- npx -y bridgespots-mcp
```

> - `BRIDGE_API_URL` — 붙을 BRIDGE 백엔드 origin. 생략 시 `http://localhost:8080`(로컬).
>   BRIDGE 웹의 "MCP 연결"이 만들어 주는 명령엔 **현재 환경 주소가 자동으로** 박혀 나옵니다.
> - `BRIDGE_DEFAULT_BOARD_ID` — 선택. 없으면 마이스페이스가 기본.
> - 번들은 의존성을 인라인해 런타임 deps 0 이라 `npx` 가 파일 하나만 받습니다.

> 층 설계: **MCP는 얇게, 스킬은 두껍게.** 이 서버는 "저장 방법"만 압니다.
> "무엇을 언제 저장할지"는 호출하는 스킬의 몫입니다.

## 노출 툴

### 노트 툴 (쓰기 — 마이스페이스/보드/조직 스코프)

| 툴 | 대응 API | 설명 |
|----|----------|------|
| `list_boards` | `GET /api/v1/boards` | 사용자가 속한 보드 목록(저장 대상 선택) |
| `save_document` | `POST .../notes` | 결과물을 새 문서로 저장 → `id` 반환. `board_id`/`org_id`로 스코프 지정 |
| `update_document` | `PUT .../notes/{id}` | 기존 문서 수정 |
| `get_document` | `GET .../notes/{id}` | 본문까지 조회 |
| `list_documents` | `GET .../notes/list` | 문서 목록(본문 제외) |
| `share_document` | `POST .../notes/{id}/share` | 공개 공유 링크 발급 |

> 스코프별 베이스: 마이스페이스 `/api/v1/me/notes` · 보드 `/api/v1/boards/{id}/notes` · 조직 `/api/v1/organizations/{orgId}/notes`. `org_id`가 `board_id`보다 우선.

### 읽기 툴 (BRIDGE 데이터 조회 → 스킬이 브리핑·리포트로 가공)

| 툴 | 대응 API | 설명 |
|----|----------|------|
| `get_my_today` | `GET /api/v1/personal/dashboard/today` | 오늘 내 태스크·일정 |
| `get_my_board_tasks` | `GET /api/v1/personal/dashboard/board-tasks` | 크로스보드 내 태스크 |
| `get_my_calendar` | `GET /api/v1/personal/calendar/unified` | 기간 통합 캘린더(미팅+일정). start/end 필수 |
| `get_board_stats` | `GET /api/v1/boards/{id}/statistics(/management)` | 보드 통계(완료·진행률, 관리 통계) |
| `get_board_tasks` | `GET /api/v1/boards/{id}/tasks` | 보드 태스크 목록(필터) |
| `get_board_milestones` | `GET /api/v1/boards/{id}/milestones` | 마일스톤 진척 |
| `generate_board_report` | `POST /api/v1/boards/{id}/reports` | 서버측 AI 리포트 생성(선택) |
| `list_org_boards` | `GET /api/v1/organizations/{orgId}/boards` | 조직(프로젝트)에 속한 보드들 |
| `get_org_insights` | `GET .../insights/summary` + `.../insights/boards` | 조직 롤업 + 보드별 집계. start/end 필수 |

> 검색(`search_documents`)은 BRIDGE 백엔드에 검색 엔드포인트가 아직 없어 미구현(로드맵 4단계).

## 사전 준비 — PAT 발급

MCP 서버는 사용자를 대신해 호출하므로 **개인 액세스 토큰(PAT)** 이 필요합니다.
BRIDGE에 정상 로그인(JWT)한 상태에서 발급합니다:

```bash
# 1) 평소처럼 로그인해 accessToken 획득
ACCESS=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .accessToken)

# 2) PAT 발급 (token 은 이 응답에서 '한 번만' 확인 가능)
curl -s -X POST http://localhost:8080/api/v1/pat \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"name":"Claude Desktop","expires_in_days":365}'
# → { "token": "bsp_...", "token_prefix": "bsp_...", ... }
```

- 원문 토큰은 저장되지 않습니다(서버는 SHA-256 해시만 보관). 발급 시 즉시 복사하세요.
- 목록 조회: `GET /api/v1/pat`, 폐기: `DELETE /api/v1/pat/{id}`.
- 폐기해도 브라우저 로그인 세션에는 영향 없습니다(리프레시 토큰과 독립).

> 이 서버는 [BRIDGE 플러그인](../README.md)의 일부다. 플러그인으로 설치하면
> 아래 수동 설정은 불필요하다. 아래는 플러그인 없이 Claude Desktop 등에 직접 붙일 때만 참고.

## 빌드 & 실행

```bash
npm install
npm run bundle     # → dist/bridge-mcp.mjs (단일 파일, 배포용)
# 또는 개발 중엔:
npm run dev
```

### 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `BRIDGE_PAT` | ✅ | — | 개인 액세스 토큰 (`bsp_...`) |
| `BRIDGE_API_URL` | | `http://localhost:8080` | BRIDGE 백엔드 주소 |
| `BRIDGE_FRONTEND_URL` | | — | 공유 링크(`/n/{code}`) 조립용 프론트엔드 URL |

## Claude Desktop 등록 예시

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bridge": {
      "command": "node",
      "args": ["/절대경로/KanbanProject/bridge-plugin/mcp-server/dist/bridge-mcp.mjs"],
      "env": {
        "BRIDGE_PAT": "bsp_...",
        "BRIDGE_API_URL": "http://localhost:8080",
        "BRIDGE_FRONTEND_URL": "http://localhost:5173"
      }
    }
  }
}
```

## 알아둘 점 (임피던스)

- **content 포맷**: BRIDGE의 DOCUMENT 노트는 첫 글자로 렌더러를 판별합니다
  (`[`=BlockNote JSON, `<`=HTML). HTML/마크다운을 그대로 저장하면 공유 미리보기는
  되지만 앱 내 BlockNote 에디터에서는 깔끔히 안 열릴 수 있습니다. "리포트는 공유 링크로
  본다"는 용도라면 문제없습니다. (에디터 완전 호환은 로드맵 4단계: HTML↔BlockNote 변환)
- **저장 스코프**: 마이스페이스 개인 노트(`/api/v1/me/notes`)에 저장됩니다 —
  보드 멤버십·프리미엄 게이트가 없어 MCP에 가장 적합합니다.
