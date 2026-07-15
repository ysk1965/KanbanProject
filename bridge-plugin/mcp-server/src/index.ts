/**
 * BRIDGE MCP 서버.
 *
 * Claude 가 BRIDGE 데이터를 읽고, 만든 결과물을 저장/공유하는 얇은 어댑터.
 * 층 설계: 이 서버는 "어떻게 읽고 저장하는지"만 안다. "무엇을 언제 하는지"는 스킬(호출자)의 몫.
 *
 * 쓰기 툴 (노트 리소스와 1:1):
 *   - save_document / update_document / get_document / list_documents / share_document
 *   - list_boards
 *
 * 읽기 툴 (BRIDGE 데이터 조회 → 스킬이 브리핑·리포트로 가공):
 *   개인: get_my_today / get_my_board_tasks / get_my_calendar / list_my_checklist_items
 *   보드: get_board_stats / get_board_tasks / get_board_milestones / generate_board_report
 *   조직: list_org_boards / get_org_insights
 *
 * 작업 쓰기 툴 (커밋 ↔ 보드 루프):
 *   toggle_checklist_item (완료/미완료 전환) / add_checklist_item (항목 추가)
 *   add_task_comment (태스크 댓글) / link_commit (커밋·PR 추적선을 댓글로 기록)
 *
 * 노트 스코프 3종: 마이스페이스(기본) · board_id · org_id.
 *
 * 인증: 환경변수 BRIDGE_PAT (사용자 개인 액세스 토큰). BRIDGE 에서
 *       POST /api/v1/pat 로 발급받아 설정한다. 데이터 소유권/권한/감사는
 *       전부 BRIDGE 가 갖는다 — 이 서버는 자격증명을 통과시킬 뿐이다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BridgeClient, BridgeApiError, NoteDetail } from "./bridgeClient.js";

const baseUrl = process.env.BRIDGE_API_URL ?? "http://localhost:8080";
const token = process.env.BRIDGE_PAT;
const frontendUrl = process.env.BRIDGE_FRONTEND_URL;
/** 이 연결에 고정된 기본 저장 보드(선택). 비면 마이스페이스가 기본. */
const defaultBoardId = process.env.BRIDGE_DEFAULT_BOARD_ID?.trim() || undefined;

if (!token) {
  console.error(
    "[bridge-mcp] 환경변수 BRIDGE_PAT 가 없습니다. BRIDGE 에서 POST /api/v1/pat 로 발급받아 설정하세요.",
  );
  process.exit(1);
}

const client = new BridgeClient({ baseUrl, token, frontendUrl });

/**
 * 호출 인자의 board_id 를 실제 저장 스코프로 해석한다.
 *   - "me"            → 마이스페이스 강제 (기본 보드가 있어도 탈출)
 *   - 값 있음          → 그 보드 (명시 override)
 *   - 없음 + 기본보드   → 기본 보드
 *   - 없음 + 기본없음   → 마이스페이스(undefined)
 */
function resolveBoardId(boardId?: string): string | undefined {
  if (boardId === "me") return undefined;
  return boardId ?? defaultBoardId;
}

/** 노트 스코프 해석: org_id 우선 → board_id(기본보드 반영) → 마이스페이스. */
function resolveScope(input: { board_id?: string; org_id?: string }): {
  boardId?: string;
  orgId?: string;
} {
  if (input.org_id) return { orgId: input.org_id };
  return { boardId: resolveBoardId(input.board_id) };
}

/** 툴 응답에 노출할 노트 요약(민감 필드 제외). */
function summarize(note: NoteDetail, scope: { boardId?: string; orgId?: string }) {
  return {
    id: note.id,
    // 후속 작업(update/get/share) 시 이 값을 그대로 다시 넘겨야 스코프가 유지된다.
    board_id: scope.boardId ?? null,
    org_id: scope.orgId ?? null,
    scope: scope.orgId ? "org" : scope.boardId ? "board" : "myspace",
    title: note.title,
    type: note.type,
    is_shared: note.is_shared,
    share_code: note.share_code,
    share_url: client.buildShareUrl(note.share_code),
    updated_at: note.updated_at,
  };
}

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** BRIDGE API 오류를 툴 오류 결과로 변환한다(모델이 읽고 대응할 수 있게). */
function fail(err: unknown) {
  const message =
    err instanceof BridgeApiError
      ? `${err.message}${err.body ? `\n${err.body}` : ""}`
      : err instanceof Error
        ? err.message
        : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

const server = new McpServer({ name: "bridge-mcp", version: "0.1.0" });

// 보드 스코프 문서의 후속 작업(update/get/share)에 필요한 공통 인자.
const boardIdArg = z
  .string()
  .optional()
  .describe(
    "저장 대상 보드 id (선택). 지정하면 그 보드의 노트로. 생략하면 이 연결의 기본 보드" +
      "(설정돼 있으면)로, 없으면 내 마이스페이스로 간다. " +
      '기본 보드가 설정돼 있어도 board_id="me" 를 주면 마이스페이스에 강제 저장한다. ' +
      "save_document 가 돌려준 board_id 를 이후 update/get/share 에 그대로 넘겨야 스코프가 유지된다.",
  );

// 조직(프로젝트) 노트 스코프. 프로젝트 보고서를 조직 노트로 저장할 때 사용.
const orgIdArg = z
  .string()
  .optional()
  .describe(
    "저장 대상 조직(프로젝트) id (선택). 지정하면 그 조직의 노트로 저장한다(프로젝트 보고서용). " +
      "org_id 를 주면 board_id 보다 우선한다. list_org_boards 로 확인한 조직 id 를 넘긴다. " +
      "save_document 가 돌려준 org_id 를 이후 update/get/share 에 그대로 넘겨야 스코프가 유지된다.",
  );

server.tool(
  "list_boards",
  "사용자가 속한 보드 목록을 반환한다. 특정 보드에 문서를 저장하기 전에, 어느 보드에 쓸지 " +
    "board id 를 고르기 위해 사용한다. role 이 VIEWER 인 보드에는 저장할 수 없다.",
  {},
  async () => {
    try {
      const boards = await client.listBoards();
      return ok(
        boards.map((b) => ({
          id: b.id,
          name: b.name,
          role: b.role,
          organization_name: b.organization_name,
          can_write: b.role !== "VIEWER",
        })),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "save_document",
  "만든 결과물(리포트·문서·회의록 등)을 사용자의 BRIDGE 에 새 문서로 저장한다. " +
    "board_id 를 주면 그 보드로, 생략하면 이 연결의 기본 보드(설정 시) 또는 마이스페이스로 저장한다. " +
    "content 는 마크다운/HTML/BlockNote JSON 문자열. 저장 후 문서 id 와 스코프(board_id/org_id)를 반환하니, " +
    "이후 수정/공유는 그 id (+스코프) 로 한다. 보드/조직 저장은 멤버십 + 프리미엄이 필요하며, " +
    "권한이 없으면 403 으로 거부된다 (그럴 땐 list_boards 로 쓸 수 있는 보드를 확인).",
  {
    title: z.string().min(1).max(200).describe("문서 제목"),
    content: z.string().describe("문서 본문 (마크다운/HTML/BlockNote JSON)"),
    board_id: boardIdArg,
    org_id: orgIdArg,
    parent_id: z
      .string()
      .optional()
      .describe("상위 폴더 노트 id (선택). 없으면 루트에 생성."),
  },
  async ({ title, content, board_id, org_id, parent_id }) => {
    try {
      const scope = resolveScope({ board_id, org_id });
      const note = await client.saveDocument({
        title,
        content,
        board_id: scope.boardId,
        org_id: scope.orgId,
        parent_id,
      });
      return ok(summarize(note, scope));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "update_document",
  "기존 BRIDGE 문서를 수정한다. save_document 가 돌려준 id 를 넘긴다. 보드/조직 문서면 " +
    "그때 받은 board_id/org_id 도 함께 넘겨야 한다. title/content 중 바꿀 것만 넘기면 된다.",
  {
    id: z.string().describe("문서 id (save_document 반환값)"),
    board_id: boardIdArg,
    org_id: orgIdArg,
    title: z.string().min(1).max(200).optional().describe("새 제목 (선택)"),
    content: z.string().optional().describe("새 본문 (선택)"),
  },
  async ({ id, board_id, org_id, title, content }) => {
    try {
      const scope = resolveScope({ board_id, org_id });
      const note = await client.updateDocument(id, {
        title,
        content,
        board_id: scope.boardId,
        org_id: scope.orgId,
      });
      return ok(summarize(note, scope));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_document",
  "BRIDGE 문서 하나를 본문까지 조회한다. 보드/조직 문서면 board_id/org_id 도 넘긴다.",
  { id: z.string().describe("문서 id"), board_id: boardIdArg, org_id: orgIdArg },
  async ({ id, board_id, org_id }) => {
    try {
      const scope = resolveScope({ board_id, org_id });
      const note = await client.getDocument(id, scope);
      return ok({ ...summarize(note, scope), content: note.content });
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "list_documents",
  "문서 목록을 반환한다(본문 제외). board_id/org_id 로 스코프를 지정, 없으면 기본 보드 또는 마이스페이스.",
  { board_id: boardIdArg, org_id: orgIdArg },
  async ({ board_id, org_id }) => {
    try {
      const items = await client.listDocuments(resolveScope({ board_id, org_id }));
      return ok(items);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "share_document",
  "문서에 공개 공유 링크를 발급한다. 반환된 share_url 을 사람에게 전달하면 로그인 없이 열람할 수 있다. " +
    "보드/조직 문서면 board_id/org_id 도 넘긴다.",
  { id: z.string().describe("문서 id"), board_id: boardIdArg, org_id: orgIdArg },
  async ({ id, board_id, org_id }) => {
    try {
      const scope = resolveScope({ board_id, org_id });
      const note = await client.shareDocument(id, scope);
      return ok({
        id: note.id,
        board_id: scope.boardId ?? null,
        org_id: scope.orgId ?? null,
        title: note.title,
        share_code: note.share_code,
        share_url: client.buildShareUrl(note.share_code),
      });
    } catch (err) {
      return fail(err);
    }
  },
);

// ===== 읽기 툴 =====
// BRIDGE 데이터를 조회해 원본 JSON 을 그대로 반환한다. 요약·우선순위화·리포트 작성은
// 스킬(work-briefing / save-weekly-report / save-project-report)의 몫.

const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "yyyy-MM-dd 형식")
  .describe("날짜 (yyyy-MM-dd)");

// --- 개인 스코프 (PAT 소유자 = 나) ---

server.tool(
  "get_my_today",
  "[읽기 전용] 오늘 내 태스크·일정을 조회한다(개인 대시보드). '오늘 뭐부터 하지', '내 업무 브리핑' " +
    "같은 요청에서 나의 하루를 파악할 때 쓴다. PAT 소유자 본인 스코프가 자동 적용된다.",
  { date: dateArg.optional().describe("조회 날짜 (선택, 기본 오늘)") },
  async ({ date }) => {
    try {
      return ok(await client.getMyToday(date));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_my_board_tasks",
  "[읽기 전용] 내가 속한 여러 보드에 걸친 나의 태스크(크로스보드)를 조회한다. 업무 브리핑에서 " +
    "'내가 맡은 일 전체'를 모을 때 쓴다.",
  { date: dateArg.optional().describe("기준 날짜 (선택, 기본 오늘)") },
  async ({ date }) => {
    try {
      return ok(await client.getMyBoardTasks(date));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_my_calendar",
  "[읽기 전용] 기간 통합 캘린더(미팅+일정)를 조회한다. start_date·end_date 는 필수. " +
    "업무 브리핑에서 오늘/이번주 일정을 파악할 때 쓴다.",
  {
    start_date: dateArg.describe("시작일 (yyyy-MM-dd)"),
    end_date: dateArg.describe("종료일 (yyyy-MM-dd)"),
  },
  async ({ start_date, end_date }) => {
    try {
      return ok(await client.getMyCalendar(start_date, end_date));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "list_my_checklist_items",
  "[읽기 전용] 내가 담당한 미완료 체크리스트를 여러 보드에 걸쳐 모아 조회한다. 각 항목은 " +
    "checklist_item_id·task_id·board_id 를 포함하므로, 커밋/작업 내용과 대조해 맞는 항목을 찾으면 " +
    "그 값들을 그대로 toggle_checklist_item 에 넘겨 완료 처리할 수 있다. PAT 소유자 본인 스코프가 자동 적용된다.",
  {},
  async () => {
    try {
      return ok(await client.getMyChecklistItems());
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "toggle_checklist_item",
  "[쓰기] 체크리스트 항목의 완료/미완료 상태를 전환한다. 커밋이 어떤 체크리스트 항목을 끝냈다고 " +
    "판단되면 이 툴로 완료 처리한다. board_id·task_id·item_id 는 list_my_checklist_items 가 " +
    "돌려준 값을 그대로 넘긴다. 실제 데이터를 바꾸므로 사용자에게 먼저 확인받고 호출하는 것을 권장한다.",
  {
    board_id: z.string().describe("보드 id (list_my_checklist_items 의 board_id)"),
    task_id: z.string().describe("태스크 id (list_my_checklist_items 의 task_id)"),
    item_id: z.string().describe("체크리스트 항목 id (list_my_checklist_items 의 checklist_item_id)"),
  },
  async ({ board_id, task_id, item_id }) => {
    try {
      return ok(await client.toggleChecklistItem(board_id, task_id, item_id));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "add_checklist_item",
  "[쓰기] 태스크에 체크리스트 항목을 새로 추가한다. 커밋 내용에 맞는 기존 항목이 없으면(=빠진 작업) " +
    "이 툴로 항목을 붙인다. board_id·task_id 는 get_board_tasks 나 list_my_checklist_items 로 확인한 값을 넘긴다. " +
    "assignee_id 를 주면 담당자를 지정, 생략하면 미배정. 실제 데이터를 바꾸므로 먼저 확인받고 호출하는 것을 권장한다.",
  {
    board_id: z.string().describe("보드 id"),
    task_id: z.string().describe("태스크 id"),
    title: z.string().min(1).max(200).describe("체크리스트 항목 제목"),
    assignee_id: z.string().optional().describe("담당자 사용자 id (선택). 생략하면 미배정."),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "yyyy-MM-dd 형식")
      .optional()
      .describe("마감일 yyyy-MM-dd (선택)"),
  },
  async ({ board_id, task_id, title, assignee_id, due_date }) => {
    try {
      return ok(
        await client.addChecklistItem(board_id, task_id, {
          title,
          assignee_id,
          due_date,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "add_task_comment",
  "[쓰기] 태스크에 댓글을 남긴다. 배포/진행 로그('v1.2.3 배포 완료'), 리뷰 메모 등을 카드에 기록할 때 쓴다. " +
    "board_id·task_id 는 get_board_tasks 나 list_my_checklist_items 로 확인한 값을 넘긴다. mentions 에 사용자 id 를 " +
    "넣으면 멘션 알림이 간다. 실제 데이터를 바꾸므로 먼저 확인받고 호출하는 것을 권장한다.",
  {
    board_id: z.string().describe("보드 id"),
    task_id: z.string().describe("태스크 id"),
    content: z.string().min(1).describe("댓글 본문 (마크다운 가능)"),
    mentions: z
      .array(z.string())
      .optional()
      .describe("멘션할 사용자 id 배열 (선택). 지정 시 해당 사용자에게 알림."),
  },
  async ({ board_id, task_id, content, mentions }) => {
    try {
      return ok(
        await client.addTaskComment(board_id, task_id, { content, mentions }),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "link_commit",
  "[쓰기] 커밋/PR 을 태스크에 추적선으로 남긴다(카드 ↔ 코드 연결). 커밋 sha·메시지를 태스크 댓글로 " +
    "마크다운 포맷해 기록한다. pr_url 을 주면 함께 첨부. 어떤 카드가 어떤 코드로 끝났는지 나중에 추적할 수 있게 한다. " +
    "board_id·task_id 는 매칭한 태스크의 값을 넘긴다.",
  {
    board_id: z.string().describe("보드 id"),
    task_id: z.string().describe("태스크 id"),
    commit_sha: z.string().min(4).describe("커밋 SHA (짧은/전체 모두 허용)"),
    message: z.string().min(1).describe("커밋 제목/메시지"),
    pr_url: z.string().optional().describe("PR/커밋 URL (선택). 있으면 링크로 첨부."),
  },
  async ({ board_id, task_id, commit_sha, message, pr_url }) => {
    try {
      const shortSha = commit_sha.slice(0, 10);
      const lines = [`🔗 커밋 \`${shortSha}\` — ${message}`];
      if (pr_url) lines.push(pr_url);
      const content = lines.join("\n");
      return ok(await client.addTaskComment(board_id, task_id, { content }));
    } catch (err) {
      return fail(err);
    }
  },
);

// --- 보드 스코프 ---

server.tool(
  "get_board_stats",
  "[읽기 전용] 한 보드의 통계를 조회한다. 완료 수·진행률 등 요약이 기본이고, management=true 면 " +
    "관리용 통계(정체 태스크·지연 마일스톤·멤버별 생산성)를 준다. 팀 주간 리포트의 수치 근거로 쓴다.",
  {
    board_id: z.string().describe("보드 id"),
    management: z
      .boolean()
      .optional()
      .describe("true 면 관리용 통계(/statistics/management), 기본 false 면 일반 통계."),
    start_date: dateArg.optional().describe("집계 시작일 (선택, 일반 통계에만 적용)"),
    end_date: dateArg.optional().describe("집계 종료일 (선택, 일반 통계에만 적용)"),
    milestone_id: z.string().optional().describe("특정 마일스톤으로 한정 (선택)"),
  },
  async ({ board_id, management, start_date, end_date, milestone_id }) => {
    try {
      return ok(
        await client.getBoardStats(board_id, {
          management,
          startDate: start_date,
          endDate: end_date,
          milestoneId: milestone_id,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_board_tasks",
  "[읽기 전용] 한 보드의 태스크 목록을 조회한다(블록/피처/마일스톤으로 필터). 리포트에서 완료/진행/차단 " +
    "항목을 뽑을 때 쓴다.",
  {
    board_id: z.string().describe("보드 id"),
    block_id: z.string().optional().describe("특정 블록(칼럼)으로 한정 (선택)"),
    feature_id: z.string().optional().describe("특정 피처로 한정 (선택)"),
    milestone_id: z.string().optional().describe("특정 마일스톤으로 한정 (선택)"),
  },
  async ({ board_id, block_id, feature_id, milestone_id }) => {
    try {
      return ok(
        await client.getBoardTasks(board_id, {
          blockId: block_id,
          featureId: feature_id,
          milestoneId: milestone_id,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_board_milestones",
  "[읽기 전용] 한 보드의 마일스톤 목록과 진척을 조회한다. 리포트/보고서의 마일스톤 진행 섹션에 쓴다.",
  { board_id: z.string().describe("보드 id") },
  async ({ board_id }) => {
    try {
      return ok(await client.getBoardMilestones(board_id));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "generate_board_report",
  "[선택] 보드의 서버측 AI 리포트를 생성한다. 스킬이 직접 리포트를 쓰는 대신 BRIDGE 의 리포트 엔진을 " +
    "쓰고 싶을 때만 사용한다. report_type 은 TEAM 또는 PERSONAL.",
  {
    board_id: z.string().describe("보드 id"),
    report_type: z.enum(["TEAM", "PERSONAL"]).describe("리포트 종류"),
    period_start: dateArg.describe("기간 시작일 (yyyy-MM-dd)"),
    period_end: dateArg.describe("기간 종료일 (yyyy-MM-dd)"),
    language: z.string().optional().describe("리포트 언어 코드 (선택, 예: ko)"),
    target_user_id: z
      .string()
      .optional()
      .describe("PERSONAL 리포트 대상 사용자 id (선택)"),
  },
  async ({ board_id, report_type, period_start, period_end, language, target_user_id }) => {
    try {
      return ok(
        await client.generateBoardReport(board_id, {
          report_type,
          period_start,
          period_end,
          language,
          target_user_id,
        }),
      );
    } catch (err) {
      return fail(err);
    }
  },
);

// --- 조직(프로젝트) 스코프 ---

server.tool(
  "list_org_boards",
  "[읽기 전용] 한 조직(프로젝트)에 속한 보드 목록을 조회한다. 프로젝트 보고서에서 롤업 대상 보드들을 " +
    "찾을 때 쓴다.",
  { org_id: z.string().describe("조직 id") },
  async ({ org_id }) => {
    try {
      return ok(await client.listOrgBoards(org_id));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_org_insights",
  "[읽기 전용] 조직 인사이트를 조회한다 — 전체 롤업(summary)과 보드별 집계(boards)를 함께 반환한다. " +
    "start_date·end_date 는 필수. 프로젝트(조직) 주간 보고서의 전체 진척·보드별 하이라이트 근거로 쓴다.",
  {
    org_id: z.string().describe("조직 id"),
    start_date: dateArg.describe("시작일 (yyyy-MM-dd)"),
    end_date: dateArg.describe("종료일 (yyyy-MM-dd)"),
  },
  async ({ org_id, start_date, end_date }) => {
    try {
      return ok(await client.getOrgInsights(org_id, start_date, end_date));
    } catch (err) {
      return fail(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[bridge-mcp] 연결됨 → ${baseUrl}` +
      (defaultBoardId
        ? ` · 기본 저장 보드=${defaultBoardId}`
        : " · 기본 저장=마이스페이스"),
  );
}

main().catch((err) => {
  console.error("[bridge-mcp] 치명적 오류:", err);
  process.exit(1);
});
