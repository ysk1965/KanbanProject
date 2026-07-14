/**
 * BRIDGE 백엔드 REST API 얇은 클라이언트.
 *
 * 설계 원칙: 여기에 비즈니스 로직을 넣지 않는다. BRIDGE 리소스와 거의 1:1로
 * 대응하는 원자적 호출만 노출한다. 인증은 사용자 개인 액세스 토큰(PAT).
 *
 * 노트 스코프는 세 가지:
 *   - 아무것도 없음 → 마이스페이스 개인 노트  (/api/v1/me/notes)
 *   - board_id 있음 → 해당 보드 노트          (/api/v1/boards/{boardId}/notes)
 *   - org_id 있음   → 해당 조직 노트          (/api/v1/organizations/{orgId}/notes)
 * 보드/조직 스코프는 백엔드가 멤버십·프리미엄을 강제한다(403으로 표면화).
 *
 * 읽기 메서드(get.../list...)는 BRIDGE 데이터를 조회해 응답 JSON 을 그대로 통과시킨다.
 * 가공(요약·우선순위화·리포트 작성)은 스킬(호출자)의 몫이다.
 *
 * BRIDGE 는 Jackson SNAKE_CASE 전략을 쓰므로 요청/응답 JSON 필드는 모두 snake_case.
 */

export interface BridgeConfig {
  /** 예: http://localhost:8080 */
  baseUrl: string;
  /** 개인 액세스 토큰 (bsp_...). POST /api/v1/pat 로 발급. */
  token: string;
  /** 공유 링크 조립용 프론트엔드 URL. 예: http://localhost:5173 */
  frontendUrl?: string;
}

/** BRIDGE 노트 상세 (응답, snake_case). 필요한 필드만 선언. */
export interface NoteDetail {
  id: string;
  type: string;
  title: string;
  content: string | null;
  parent_id: string | null;
  is_shared: boolean;
  share_token: string | null;
  share_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteListItem {
  id: string;
  title: string;
  parent_id: string | null;
  parent_title: string | null;
  updated_at: string;
}

/** GET /api/v1/boards 항목 (BoardResponse.Simple). 저장 대상 선택용 요약. */
export interface BoardSummary {
  id: string;
  name: string;
  role: string; // OWNER / ADMIN / MEMBER / VIEWER
  organization_id: string | null;
  organization_name: string | null;
}

export class BridgeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "BridgeApiError";
  }
}

export class BridgeClient {
  private readonly baseUrl: string;
  private readonly token: string;
  readonly frontendUrl?: string;

  constructor(config: BridgeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.token = config.token;
    this.frontendUrl = config.frontendUrl?.replace(/\/$/, "");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) {
        throw new BridgeApiError(
          "인증 실패 (401): PAT 가 유효하지 않거나 폐기/만료되었습니다.",
          401,
          text,
        );
      }
      if (res.status === 403) {
        // 보드 스코프의 두 게이트를 사람이 읽을 수 있게 안내
        const hint = text.includes("PREMIUM")
          ? "이 보드는 프리미엄이어야 노트를 저장할 수 있습니다."
          : "이 보드에 대한 권한이 없습니다(멤버가 아니거나 VIEWER).";
        throw new BridgeApiError(`거부됨 (403): ${hint}`, 403, text);
      }
      throw new BridgeApiError(
        `BRIDGE API ${method} ${path} 실패 (${res.status})`,
        res.status,
        text,
      );
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /**
   * 스코프에 맞는 노트 베이스 경로.
   *   orgId 우선 → boardId → (없으면) 마이스페이스.
   */
  private notesBase(scope?: { boardId?: string; orgId?: string }): string {
    if (scope?.orgId) return `/api/v1/organizations/${scope.orgId}/notes`;
    if (scope?.boardId) return `/api/v1/boards/${scope.boardId}/notes`;
    return `/api/v1/me/notes`;
  }

  /** undefined 값을 뺀 쿼리스트링을 조립한다. 비면 빈 문자열. */
  private qs(params: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `?${s}` : "";
  }

  // ===== 원자적 툴 =====

  /** list_boards — 사용자가 속한 보드 목록(저장 대상 선택용). */
  listBoards(): Promise<BoardSummary[]> {
    return this.request<BoardSummary[]>("GET", "/api/v1/boards");
  }

  /** save_document — 새 문서 저장. board_id/org_id 로 스코프 지정, 없으면 마이스페이스. */
  saveDocument(input: {
    title: string;
    content: string;
    type?: string;
    parent_id?: string;
    board_id?: string;
    org_id?: string;
  }): Promise<NoteDetail> {
    const base = this.notesBase({
      boardId: input.board_id,
      orgId: input.org_id,
    });
    return this.request<NoteDetail>("POST", base, {
      title: input.title,
      type: input.type ?? "DOCUMENT",
      content: input.content,
      parent_id: input.parent_id ?? null,
    });
  }

  /** update_document — 기존 문서 수정. 보드/조직 문서면 스코프도 같이 넘긴다. */
  updateDocument(
    id: string,
    input: {
      title?: string;
      content?: string;
      board_id?: string;
      org_id?: string;
    },
  ): Promise<NoteDetail> {
    const base = this.notesBase({
      boardId: input.board_id,
      orgId: input.org_id,
    });
    return this.request<NoteDetail>("PUT", `${base}/${id}`, {
      title: input.title,
      content: input.content,
    });
  }

  /** get_document — 문서 조회. */
  getDocument(
    id: string,
    scope?: { boardId?: string; orgId?: string },
  ): Promise<NoteDetail> {
    return this.request<NoteDetail>("GET", `${this.notesBase(scope)}/${id}`);
  }

  /** list_documents — 문서 목록(플랫). 스코프 없으면 마이스페이스. */
  listDocuments(scope?: {
    boardId?: string;
    orgId?: string;
  }): Promise<NoteListItem[]> {
    return this.request<NoteListItem[]>("GET", `${this.notesBase(scope)}/list`);
  }

  /** share_document — 공개 공유 활성화. share_code 반환. */
  shareDocument(
    id: string,
    scope?: { boardId?: string; orgId?: string },
  ): Promise<NoteDetail> {
    return this.request<NoteDetail>(
      "POST",
      `${this.notesBase(scope)}/${id}/share`,
    );
  }

  // ===== 읽기 툴 (BRIDGE 데이터 조회, 응답 그대로 통과) =====

  /** get_my_today — 오늘 내 태스크·일정 (개인 대시보드). PAT 소유자 스코프 자동. */
  getMyToday(date?: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/v1/personal/dashboard/today${this.qs({ date })}`,
    );
  }

  /** get_my_board_tasks — 내가 속한 보드들에 걸친 내 태스크(크로스보드). */
  getMyBoardTasks(date?: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/v1/personal/dashboard/board-tasks${this.qs({ date })}`,
    );
  }

  /** get_my_calendar — 기간 통합 캘린더(미팅+일정). start/end 필수. */
  getMyCalendar(startDate: string, endDate: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/v1/personal/calendar/unified${this.qs({ start_date: startDate, end_date: endDate })}`,
    );
  }

  /** get_board_stats — 보드 통계. management=true 면 관리용 통계(정체/지연 등). */
  getBoardStats(
    boardId: string,
    opts?: {
      management?: boolean;
      startDate?: string;
      endDate?: string;
      milestoneId?: string;
    },
  ): Promise<unknown> {
    if (opts?.management) {
      const query = this.qs({ milestone_id: opts.milestoneId });
      return this.request(
        "GET",
        `/api/v1/boards/${boardId}/statistics/management${query}`,
      );
    }
    const query = this.qs({
      start_date: opts?.startDate,
      end_date: opts?.endDate,
    });
    return this.request("GET", `/api/v1/boards/${boardId}/statistics${query}`);
  }

  /** get_board_tasks — 보드 태스크 목록(필터). 필터 파라미터는 camelCase. */
  getBoardTasks(
    boardId: string,
    filters?: { blockId?: string; featureId?: string; milestoneId?: string },
  ): Promise<unknown> {
    const query = this.qs({
      blockId: filters?.blockId,
      featureId: filters?.featureId,
      milestoneId: filters?.milestoneId,
    });
    return this.request("GET", `/api/v1/boards/${boardId}/tasks${query}`);
  }

  /** get_board_milestones — 마일스톤 목록·진척. */
  getBoardMilestones(boardId: string): Promise<unknown> {
    return this.request("GET", `/api/v1/boards/${boardId}/milestones`);
  }

  /** generate_board_report — 서버측 AI 리포트 생성(선택). */
  generateBoardReport(
    boardId: string,
    input: {
      report_type: string;
      period_start: string;
      period_end: string;
      language?: string;
      target_user_id?: string;
    },
  ): Promise<unknown> {
    return this.request("POST", `/api/v1/boards/${boardId}/reports`, input);
  }

  /** list_org_boards — 조직(프로젝트)에 속한 보드들. */
  listOrgBoards(orgId: string): Promise<unknown> {
    return this.request("GET", `/api/v1/organizations/${orgId}/boards`);
  }

  /** get_org_insights — 조직 롤업(summary) + 보드별 집계(boards). start/end 필수. */
  async getOrgInsights(
    orgId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ summary: unknown; boards: unknown }> {
    const query = this.qs({ start_date: startDate, end_date: endDate });
    const [summary, boards] = await Promise.all([
      this.request(
        "GET",
        `/api/v1/organizations/${orgId}/insights/summary${query}`,
      ),
      this.request(
        "GET",
        `/api/v1/organizations/${orgId}/insights/boards${query}`,
      ),
    ]);
    return { summary, boards };
  }

  /**
   * 공유 코드로 사람이 여는 링크를 조립한다(프론트엔드 URL 이 설정된 경우).
   * FE 라우트 `/n/:shareToken` 은 토큰과 짧은 코드를 모두 받는다.
   */
  buildShareUrl(shareCode: string | null): string | null {
    if (!shareCode || !this.frontendUrl) return null;
    return `${this.frontendUrl}/n/${shareCode}`;
  }
}
