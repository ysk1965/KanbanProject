---
name: save-project-report
description: 한 조직(프로젝트)에 속한 여러 보드를 통째로 집계해 경영·이해관계자용 프로젝트 주간 보고서를 작성하고, 조직 노트로 저장한 뒤 필요하면 공유 링크를 발급한다. "프로젝트 보고서 만들어줘", "이번 주 프로젝트 현황 정리해줘", "조직 전체 롤업 보고서 써서 공유해줘" 같은 요청에 사용.
user-invocable: true
allowed-tools: mcp__plugin_bridge_spots__list_org_boards mcp__plugin_bridge_spots__get_org_insights mcp__plugin_bridge_spots__get_board_stats mcp__plugin_bridge_spots__get_board_milestones mcp__plugin_bridge_spots__save_document mcp__plugin_bridge_spots__share_document
---

# 프로젝트 주간 보고서

**여러 보드/조직을 롤업**해 경영·이해관계자용 보고서로 정리하고, 조직 노트에 게시한 뒤 원하면 공유 링크를 발급하는 워크플로우. `save-weekly-report`가 보드 하나라면, 이건 **조직(프로젝트) 전체**다.

## 이 스킬이 아는 것과 모르는 것

- **아는 것(워크플로우)**: 조직 인사이트를 어떻게 롤업하고, 보드별로 어떻게 파고들어, 어떤 구조의 경영 보고서를 써서, 조직 노트로 게시할지.
- **모르는 것(데이터 접근·저장 방법)**: 읽기/저장/공유는 MCP 툴이 처리한다.

## 절차

1. **대상 조직(프로젝트)과 기간을 정한다.**
   - 기간 기본은 **이번 주(월~일)**, 날짜는 `yyyy-MM-dd`.
   - org_id가 모호하면 사용자에게 확인한다(어떤 조직/프로젝트인지).

2. **조직 롤업을 수집한다.**
   - `get_org_insights(org_id, start_date, end_date)` — 전체 롤업(summary) + 보드별 집계(boards)를 함께 반환한다. **start_date·end_date 필수.**
   - `list_org_boards(org_id)` — 롤업 대상 보드 목록.

3. **보드별로 파고든다(필요한 만큼).** 하이라이트가 필요한 보드에 대해 (병렬 호출 가능):
   - `get_board_stats(board_id, start_date, end_date)` — 보드별 진척·완료 수치.
   - `get_board_milestones(board_id)` — 보드별 마일스톤 진행.
   - 보드가 많으면 인사이트의 boards 집계로 전체를 잡고, 상위 몇 개만 깊게 본다(과도한 호출 지양).

4. **보고서를 작성한다(HTML, 경영 톤).** 다음 구조를 기본으로:
   - **전체 요약** — 프로젝트 진척%·핵심 성과·번다운 관점 2~3문장.
   - **보드별 하이라이트** — 보드마다 완료·진행·주요 이슈 한 줄씩(표 권장).
   - **마일스톤 진행** — 조직 전반의 마일스톤 상태.
   - **리스크/블로커** — 지연·정체·주의가 필요한 영역.
   - **다음 주 포커스** — 우선순위.
   - `<h2>`, `<table>`, `<ul>` 로 이해관계자가 훑기 좋게. `<html>`/`<body>` 래퍼는 불필요.

5. **조직 노트로 게시한다.** `save_document(title: "프로젝트 주간 보고서 (yyyy-MM-dd ~ yyyy-MM-dd)", content, org_id)`.
   - `org_id`를 넘기면 조직 노트로 저장된다(board_id보다 우선). 반환된 `id`·`org_id`를 기억한다.
   - 백엔드가 조직 멤버십·프리미엄을 검사한다. 403이면 그 메시지를 그대로 전달한다.

6. **공유가 필요하면** `share_document(id, org_id)`로 `share_url`을 발급해 전달한다.
   - (선택, 크로스툴) "리더 채널/이메일로 보내줘" → Slack/이메일 MCP로 링크 발송.

7. **결과를 사람 말로 보고한다.** 저장한 조직·보고서 제목·(공유했다면) 링크.

## 판단 규칙

- 스코프는 **조직 전체**. save/share에 항상 `org_id`를 넘긴다(board_id 아님).
- 보고서는 경영·이해관계자 독자를 가정한다 — 개별 태스크 나열보다 롤업·추세·리스크 중심.
- 보드가 많으면 전부 깊게 파지 말고 인사이트 집계로 전체를 잡은 뒤 상위 보드만 상세화한다.
- 툴이 403 → 조직 비멤버 또는 비프리미엄. 메시지를 그대로 전달.
- 툴이 401 → PAT 무효 안내(`POST /api/v1/pat`).

## 알아둘 점

- 한 보드만 다룬다면 이 스킬 대신 `save-weekly-report`가 맞다.
- HTML 문서는 공유 링크에서 잘 보이지만 앱 내 노트 에디터에서는 원본 그대로 열리지 않을 수 있다.
