---
name: save-to-bridge
description: 만든 문서·리포트·회의록·요약을 사용자의 BRIDGE 마이스페이스에 저장하고 필요하면 공유 링크를 발급한다. "브릿지에 저장", "BRIDGE에 올려줘", "리포트 만들어서 공유해줘" 같은 요청에 사용.
user-invocable: true
allowed-tools: mcp__plugin_bridge_spots__list_boards mcp__plugin_bridge_spots__save_document mcp__plugin_bridge_spots__update_document mcp__plugin_bridge_spots__get_document mcp__plugin_bridge_spots__list_documents mcp__plugin_bridge_spots__share_document
---

# BRIDGE에 저장

Claude가 만든 결과물을 사용자의 BRIDGE 마이스페이스 문서로 저장하고, 원하면 공개 공유 링크를 발급하는 워크플로우.

## 이 스킬이 아는 것과 모르는 것

- **아는 것(워크플로우)**: 무엇을 만들고, 언제 저장/공유할지.
- **모르는 것(저장 방법)**: BRIDGE에 어떻게 붙는지는 MCP 툴이 처리한다. 이 스킬은 툴을 부르기만 한다.

이 층 분리 덕분에 어떤 종류의 결과물이든(감사 리포트·스펙 문서·회의록·다이어그램 설명 등) 같은 저장 파이프라인을 재사용한다.

## 절차

1. **결과물을 만든다.** 사용자가 요청한 문서를 완성한다. 형식 지침:
   - 기본은 **HTML**로 작성한다(`<h1>`, `<p>`, `<ul>`, `<table>` 등). BRIDGE 공유 미리보기가 HTML을 렌더링한다.
   - 표·목록·제목 구조를 살려 읽기 좋게 만든다. 본문만 담고 `<html>`/`<body>` 래퍼는 넣지 않아도 된다.

2. **어디에 저장할지 정한다.**
   - 기본은 **내 마이스페이스**(개인). `board_id` 없이 저장.
   - 사용자가 "○○ 보드에 저장/올려줘"라고 하면 **보드 노트**로 저장한다. 어느 보드인지 모호하면 `list_boards`로 목록을 보여주고 고르게 한다(`can_write: false`인 VIEWER 보드는 제외).

3. **저장한다.** `save_document`를 호출한다.
   - `title`: 간결한 문서 제목(200자 이내).
   - `content`: 1에서 만든 HTML 문자열.
   - 보드 저장이면 `board_id`도 넘긴다. 백엔드가 MEMBER+ 멤버십과 보드 프리미엄을 검사하며, 권한이 없으면 403으로 거부된다 — 그 메시지를 사용자에게 그대로 전달한다.
   - 반환된 `id`(와 보드 저장이면 `board_id`)를 기억한다. 같은 문서를 이어서 고칠 때는 `update_document(id, board_id?)`를 쓴다(중복 저장 금지).

4. **공유가 필요하면** `share_document(id, board_id?)`를 호출하고, 반환된 `share_url`(예: `http://…/n/1dc2VZ4eR3`)을 사용자에게 전달한다. 이 링크는 로그인 없이 열람 가능하다. 보드 문서면 `board_id`도 함께 넘긴다.

5. **결과를 사람 말로 보고한다.** 저장 위치(마이스페이스 또는 보드명), 문서 제목, (공유했다면) 공유 링크를 알려준다. 내부 id는 사용자가 요청할 때만 노출한다.

## 판단 규칙

- "저장/올려줘"만 요청 → 저장까지. 공유 링크는 만들지 않는다.
- "공유해줘/링크 줘" 포함 → 공유까지 하고 링크를 준다.
- "○○ 보드에" 언급 → `list_boards`로 보드 id를 찾아 `board_id`로 저장. 언급 없으면 마이스페이스.
- 기존 문서 수정 요청("아까 그 리포트에 ~ 추가") → 먼저 `list_documents`(같은 스코프)로 대상 문서의 id를 찾고 `update_document`로 고친다. 새로 만들지 않는다.
- 툴이 401 → PAT 무효. BRIDGE에서 새 PAT 발급(`POST /api/v1/pat`) 후 플러그인 설정에 넣으라고 안내.
- 툴이 403 → 보드 권한 없음(비멤버/VIEWER) 또는 보드 비프리미엄. 메시지를 그대로 전달한다.

## 알아둘 점

- 기본 저장 위치는 **마이스페이스 개인 노트**. 보드 저장은 `board_id`를 넘겼을 때만.
- HTML로 저장한 문서는 공유 링크에서는 잘 보이지만, BRIDGE 앱 내 노트 에디터(BlockNote)에서는 원본 그대로 열리지 않을 수 있다. "링크로 공유해서 본다"는 용도에 맞춘다.
