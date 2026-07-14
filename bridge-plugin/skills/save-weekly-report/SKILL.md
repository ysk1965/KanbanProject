---
name: save-weekly-report
description: 한 보드의 데이터를 읽어 팀 주간 리포트를 작성하고, 그 보드의 노트로 저장한 뒤 필요하면 공유 링크를 발급한다. "이번 주 리포트 만들어줘", "이 보드 주간 리포트 써서 올려줘", "팀 리포트 만들어서 공유 링크 줘" 같은 요청에 사용.
user-invocable: true
allowed-tools: mcp__plugin_bridge_spots__list_boards mcp__plugin_bridge_spots__get_board_stats mcp__plugin_bridge_spots__get_board_tasks mcp__plugin_bridge_spots__get_board_milestones mcp__plugin_bridge_spots__generate_board_report mcp__plugin_bridge_spots__save_document mcp__plugin_bridge_spots__share_document
---

# 팀 주간 리포트

**한 보드**의 한 주를 리포트로 정리해 그 보드 노트에 게시하고, 원하면 공유 링크까지 발급하는 워크플로우. 스코프는 **보드 하나**다(여러 보드/조직 롤업은 `save-project-report`).

## 이 스킬이 아는 것과 모르는 것

- **아는 것(워크플로우)**: 어떤 데이터를 모아, 어떤 구조의 리포트를 써서, 어디에 저장/공유할지.
- **모르는 것(데이터 접근·저장 방법)**: 읽기/저장/공유는 MCP 툴이 처리한다. 이 스킬은 툴을 엮는다.

## 절차

1. **대상 보드와 기간을 정한다.**
   - 기간 기본은 **이번 주(월~일)**. 날짜는 `yyyy-MM-dd`.
   - 보드가 모호하면 `list_boards`로 목록을 보여주고 고르게 한다. `can_write: false`(VIEWER)면 저장이 안 되므로 제외/안내.

2. **보드 데이터를 수집한다.** (병렬 호출 가능)
   - `get_board_stats(board_id, start_date, end_date)` — 완료 수·진행률 등 수치 근거. 관리 관점(정체 태스크·지연)이 필요하면 `management: true`로 한 번 더.
   - `get_board_tasks(board_id)` — 완료/진행/차단 항목을 뽑는다.
   - `get_board_milestones(board_id)` — 마일스톤 진척(있으면).
   - **대안:** 사용자가 "BRIDGE AI 리포트로 만들어줘"라고 하면 직접 쓰는 대신 `generate_board_report(board_id, report_type: "TEAM", period_start, period_end)`로 서버 리포트를 받아 다듬는다.

3. **리포트를 작성한다(HTML).** 다음 구조를 기본으로:
   - **이번 주 요약** — 한 주 핵심을 2~3문장 + 수치(완료 N/전체 M, 진행률).
   - **완료한 일** — 이번 주 완료 태스크 목록.
   - **진행 중** — 진행 중 태스크와 상태.
   - **차단/리스크** — 막힌 항목·정체 태스크·지연 마일스톤.
   - **다음 주 계획** — 다가오는 마감·마일스톤 기준 제안.
   - `<h2>`, `<ul>`, `<table>` 등으로 읽기 좋게. `<html>`/`<body>` 래퍼는 불필요.

4. **보드 노트로 게시한다.** `save_document(title: "주간 리포트 (yyyy-MM-dd ~ yyyy-MM-dd)", content, board_id)`.
   - 반환된 `id`와 `board_id`를 기억한다. 같은 리포트를 이어 고칠 땐 `update_document`(중복 저장 금지).
   - 백엔드가 MEMBER+ 멤버십과 보드 프리미엄을 검사한다. 403이면 그 메시지를 그대로 전달한다.

5. **공유가 필요하면** `share_document(id, board_id)`로 `share_url`(예: `http://…/n/…`)을 발급해 전달한다. 로그인 없이 열람 가능.
   - (선택, 크로스툴) 사용자가 "슬랙에도 올려줘"라고 하면 Slack MCP로 채널에 링크를 게시할 수 있다.

6. **결과를 사람 말로 보고한다.** 저장한 보드명·리포트 제목·(공유했다면) 링크.

## 판단 규칙

- "리포트 만들어줘"만 → 작성 + 보드 저장까지. 공유 링크는 요청 시에만.
- "공유/링크" 포함 → `share_document`까지.
- 보드 미지정 → `list_boards`로 고르게 한다. 넘겨받은 board_id는 이후 save/share에 그대로 전달해 스코프를 유지한다.
- 툴이 403 → 보드 비멤버/VIEWER 또는 비프리미엄. 메시지를 그대로 전달.
- 툴이 401 → PAT 무효 안내(`POST /api/v1/pat`).

## 알아둘 점

- 스코프는 항상 **보드 하나**. board_id를 save/share에 반드시 함께 넘긴다.
- HTML 문서는 공유 링크에서 잘 보이지만 앱 내 노트 에디터(BlockNote)에서는 원본 그대로 열리지 않을 수 있다 — "링크로 공유해 본다"에 맞춘다.
