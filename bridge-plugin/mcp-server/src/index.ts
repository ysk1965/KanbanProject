#!/usr/bin/env node
/**
 * BRIDGE MCP 서버 (MVP).
 *
 * Claude 가 만든 결과물을 사용자의 BRIDGE 마이스페이스에 저장/공유하는 얇은 어댑터.
 * 층 설계: 이 서버는 "저장 방법"만 안다. "무엇을 언제 저장할지"는 스킬(호출자)의 몫.
 *
 * 노출 툴 (BRIDGE 리소스와 1:1 대응하는 원자적 primitive):
 *   - save_document     결과물 저장
 *   - update_document   결과물 수정
 *   - get_document      조회
 *   - list_documents    목록
 *   - share_document    공개 공유 링크 발급
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

/** 툴 응답에 노출할 노트 요약(민감 필드 제외). */
function summarize(note: NoteDetail, boardId?: string) {
  return {
    id: note.id,
    // 후속 작업(update/get/share) 시 이 값을 그대로 다시 넘겨야 스코프가 유지된다.
    // null 이면 마이스페이스 문서.
    board_id: boardId ?? null,
    scope: boardId ? "board" : "myspace",
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
    "content 는 마크다운/HTML/BlockNote JSON 문자열. 저장 후 문서 id 와 board_id 를 반환하니, " +
    "이후 수정/공유는 그 id (+board_id) 로 한다. 보드 저장은 MEMBER 이상 + 보드 프리미엄이 필요하며, " +
    "권한이 없으면 403 으로 거부된다 (그럴 땐 list_boards 로 쓸 수 있는 보드를 확인).",
  {
    title: z.string().min(1).max(200).describe("문서 제목"),
    content: z.string().describe("문서 본문 (마크다운/HTML/BlockNote JSON)"),
    board_id: boardIdArg,
    parent_id: z
      .string()
      .optional()
      .describe("상위 폴더 노트 id (선택). 없으면 루트에 생성."),
  },
  async ({ title, content, board_id, parent_id }) => {
    try {
      const scope = resolveBoardId(board_id);
      const note = await client.saveDocument({ title, content, board_id: scope, parent_id });
      return ok(summarize(note, scope));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "update_document",
  "기존 BRIDGE 문서를 수정한다. save_document 가 돌려준 id 를 넘긴다. 보드 문서면 " +
    "그때 받은 board_id 도 함께 넘겨야 한다. title/content 중 바꿀 것만 넘기면 된다.",
  {
    id: z.string().describe("문서 id (save_document 반환값)"),
    board_id: boardIdArg,
    title: z.string().min(1).max(200).optional().describe("새 제목 (선택)"),
    content: z.string().optional().describe("새 본문 (선택)"),
  },
  async ({ id, board_id, title, content }) => {
    try {
      const scope = resolveBoardId(board_id);
      const note = await client.updateDocument(id, { title, content, board_id: scope });
      return ok(summarize(note, scope));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "get_document",
  "BRIDGE 문서 하나를 본문까지 조회한다. 보드 문서면 board_id 도 넘긴다.",
  { id: z.string().describe("문서 id"), board_id: boardIdArg },
  async ({ id, board_id }) => {
    try {
      const scope = resolveBoardId(board_id);
      const note = await client.getDocument(id, scope);
      return ok({ ...summarize(note, scope), content: note.content });
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "list_documents",
  "문서 목록을 반환한다(본문 제외). board_id 를 주면 그 보드의 노트 목록, 없으면 기본 보드 또는 마이스페이스.",
  { board_id: boardIdArg },
  async ({ board_id }) => {
    try {
      const items = await client.listDocuments(resolveBoardId(board_id));
      return ok(items);
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "share_document",
  "문서에 공개 공유 링크를 발급한다. 반환된 share_url 을 사람에게 전달하면 로그인 없이 열람할 수 있다. " +
    "보드 문서면 board_id 도 넘긴다.",
  { id: z.string().describe("문서 id"), board_id: boardIdArg },
  async ({ id, board_id }) => {
    try {
      const scope = resolveBoardId(board_id);
      const note = await client.shareDocument(id, scope);
      return ok({
        id: note.id,
        board_id: scope ?? null,
        title: note.title,
        share_code: note.share_code,
        share_url: client.buildShareUrl(note.share_code),
      });
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
      (defaultBoardId ? ` · 기본 저장 보드=${defaultBoardId}` : " · 기본 저장=마이스페이스"),
  );
}

main().catch((err) => {
  console.error("[bridge-mcp] 치명적 오류:", err);
  process.exit(1);
});
