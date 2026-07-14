# BRIDGE MCP 서버

Claude(및 MCP 호환 클라이언트)가 만든 결과물을 **사용자의 BRIDGE 마이스페이스**에
저장·조회·공유하는 얇은 어댑터. 데이터 소유권·권한·감사는 전부 BRIDGE가 갖고,
이 서버는 사용자 개인 액세스 토큰(PAT)을 통과시키는 통로일 뿐입니다.

> 층 설계: **MCP는 얇게, 스킬은 두껍게.** 이 서버는 "저장 방법"만 압니다.
> "무엇을 언제 저장할지"는 호출하는 스킬의 몫입니다.

## 노출 툴 (BRIDGE 리소스와 1:1 대응)

| 툴 | 대응 API | 설명 |
|----|----------|------|
| `save_document` | `POST /api/v1/me/notes` | 결과물을 새 문서로 저장 → `id` 반환 |
| `update_document` | `PUT /api/v1/me/notes/{id}` | 기존 문서 수정 |
| `get_document` | `GET /api/v1/me/notes/{id}` | 본문까지 조회 |
| `list_documents` | `GET /api/v1/me/notes/list` | 문서 목록(본문 제외) |
| `share_document` | `POST /api/v1/me/notes/{id}/share` | 공개 공유 링크 발급 |

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
