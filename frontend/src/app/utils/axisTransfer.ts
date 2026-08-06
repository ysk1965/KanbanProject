/**
 * 확정도 축(workload · placement · backlog) 사이의 이동 계약.
 *
 * 세 존은 서로 다른 컴포넌트 트리에 있고(간트는 일정 탭에서도 쓰인다) 부모도 다르다.
 * 그래서 콜백을 관통시키는 대신 window 이벤트 한 벌을 공유한다 — 듣는 쪽이 없으면
 * 아무 일도 일어나지 않는 게 맞는 구조다(백로그가 없는 일정 탭이 그 경우다).
 *
 * 역할 분담:
 *   - 목적지(useAxisDropZone)는 "떨어졌다"만 알린다. 데이터를 고치지 않는다.
 *   - 실제 변경은 그 항목을 들고 있는 컴포넌트가 useAxisTransfer로 받아서 한다.
 *     (목록 상태·되돌리기·토스트가 전부 거기 있기 때문)
 *
 * 소스가 두 종류라는 점이 이 파일이 존재하는 이유다:
 *   - 카드(미배치·백로그)는 HTML5 DnD를 쓴다 → dataTransfer로 페이로드가 실린다.
 *   - 간트 바는 마우스 기반 커스텀 드래그다 → dataTransfer가 없어 좌표로 존을 찾는다.
 *   두 경로 모두 같은 AXIS_DROP 이벤트로 합류한다.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";

/**
 * timeblock은 확정도 축의 끝이다 — "며칠에 한다"를 넘어 "몇 시에 한다"까지 정해진 상태.
 * 다만 이 존만은 목적지가 블록을 먼저 만들고 나서 드롭을 알린다(아래 targetDate 주석 참고).
 */
export type AxisZone = "workload" | "placement" | "backlog" | "timeblock";

/** 통합 드래그 페이로드 MIME. 기존 존별 타입과 함께 실어 하위 호환을 지킨다 */
export const AXIS_DRAG_TYPE = "application/bridge-axis-item";

export interface AxisItem {
  /** 체크리스트 항목 id(workload·placement) 또는 백로그 항목 id(backlog) */
  id: string;
  /** 체크리스트 항목일 때 소속 태스크 — 되돌리기로 항목을 되살릴 때 필요하다 */
  task_id?: string | null;
  title: string;
  start_date?: string | null;
  due_date?: string | null;
  assignee_id?: string | null;
}

const DRAG_EVENT = "bridge:axis-drag";
const DROP_EVENT = "bridge:axis-drop";
const REFRESH_EVENT = "bridge:axis-refresh";

interface AxisDragDetail {
  /** null이면 드래그 종료 */
  from: AxisZone | null;
  /** 마우스 기반 소스(간트 바)가 알려 주는 현재 커서 아래 존 */
  over?: AxisZone | null;
}

export interface AxisDropDetail {
  from: AxisZone;
  to: AxisZone;
  item: AxisItem;
  /**
   * 목적지가 "며칠 칸"을 아는 경우에만 실린다 (지금은 timeblock 뿐).
   *
   * 타임블록은 시각까지 정하는 존이라 순서가 반대다 — 목적지가 블록을 먼저 만들고,
   * 성공했을 때만 이 이벤트를 쏜다. 항목의 주인(MyWorkloadWidget)은 이 날짜로
   * 시작·마감만 잡는다. 블록 생성이 실패하면 이벤트가 없으니 날짜도 안 바뀐다.
   */
  targetDate?: string;
}

interface AxisDragPayload {
  from: AxisZone;
  item: AxisItem;
}

/* ── 소스가 부르는 것들 ────────────────────────────── */

/** 드래그 시작을 알린다 — 받을 수 있는 존들이 스스로 불을 켠다 */
export function startAxisDrag(from: AxisZone) {
  window.dispatchEvent(
    new CustomEvent<AxisDragDetail>(DRAG_EVENT, { detail: { from } }),
  );
}

/** 마우스 기반 소스 전용 — 커서 아래 존이 바뀔 때마다 알린다 */
export function updateAxisDragOver(from: AxisZone, over: AxisZone | null) {
  window.dispatchEvent(
    new CustomEvent<AxisDragDetail>(DRAG_EVENT, { detail: { from, over } }),
  );
}

export function endAxisDrag() {
  window.dispatchEvent(
    new CustomEvent<AxisDragDetail>(DRAG_EVENT, { detail: { from: null } }),
  );
}

/** HTML5 드래그 소스가 dragstart에서 부른다 */
export function setAxisDragData(
  dataTransfer: DataTransfer,
  from: AxisZone,
  item: AxisItem,
) {
  dataTransfer.setData(
    AXIS_DRAG_TYPE,
    JSON.stringify({ from, item } satisfies AxisDragPayload),
  );
  dataTransfer.effectAllowed = "move";
  startAxisDrag(from);
}

/** 드래그 잔상 칩의 크기 — 간트 하루 칸(줌 32~100px) 옆에 놓고 봐도 되는 폭 */
const GHOST_WIDTH = 220;
const GHOST_HEIGHT = 34;
/** 커서를 칩 왼쪽 아래 모서리에 둔다 — 칩이 커서 위로 떠서 밑의 날짜 칸이 열린다 */
const GHOST_CURSOR_X = 12;

/**
 * dragstart의 드래그 잔상을 직접 만들어 넘긴다.
 *
 * 지정하지 않으면 브라우저가 드래그를 시작한 엘리먼트를 그대로 비트맵으로 뜬다.
 * 배치 레일의 행은 카드 가로폭을 전부 쓰는 한 줄이라(창이 넓으면 1500px가 넘는다)
 * 정작 놓아야 할 하루 칸(32~100px)과 그 위의 드롭 하이라이트를 통째로 덮어 버린다.
 * 그래서 "무엇을 들고 있는지"만 남긴 칩을 따로 그려 넘긴다.
 *
 * 색·글꼴은 프로젝트 클래스에 맡긴다 — CSS 변수 기반이라 라이트 모드가 저절로 따라온다.
 * (클래스명이 문자열 리터럴로 남아 있어야 Tailwind 스캐너에 잡힌다)
 *
 * 주의: 잔상은 이 시점에 뜬 정적 비트맵이라 드래그 도중에는 바뀌지 않는다.
 * "지금 며칠에 놓이는가" 같은 실시간 정보는 드롭 대상 쪽이 보여줘야 한다.
 */
export function setAxisDragGhost(
  dataTransfer: DataTransfer,
  source: HTMLElement,
  { title, accentHex }: { title: string; accentHex?: string | null },
) {
  const doc = source.ownerDocument;
  const ghost = doc.createElement("div");

  ghost.className =
    "flex items-center gap-2 px-3 py-2 rounded-xl " +
    "bg-bridge-obsidian border border-foreground/10 shadow-2xl " +
    "text-xs font-bold text-foreground";
  // 화면 밖이라도 실제로 그려져 있어야 한다 — display:none이면 스냅샷이 안 떠진다
  ghost.style.cssText =
    `position:fixed;top:-1000px;left:-1000px;pointer-events:none;` +
    `width:${GHOST_WIDTH}px;height:${GHOST_HEIGHT}px;box-sizing:border-box;`;

  if (accentHex) {
    const dot = doc.createElement("span");
    dot.style.cssText =
      `flex:none;width:6px;height:6px;border-radius:2px;` +
      `background:${accentHex};`;
    ghost.appendChild(dot);
  }

  const label = doc.createElement("span");
  label.textContent = title;
  label.style.cssText =
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  ghost.appendChild(label);

  doc.body.appendChild(ghost);
  // 이미지 밖 좌표는 브라우저가 가장자리로 잘라내므로 경계 안에서 잡는다
  dataTransfer.setDragImage(ghost, GHOST_CURSOR_X, GHOST_HEIGHT);
  // 스냅샷은 setDragImage 안에서 동기적으로 떠지므로 다음 프레임엔 지워도 된다.
  // (드래그가 취소돼도 dragend를 기다리지 않으니 노드가 남지 않는다)
  requestAnimationFrame(() => ghost.remove());
}

/** 이동이 끝나 다른 존이 목록을 다시 읽어야 할 때 */
export function requestAxisRefresh() {
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
}

/**
 * 좌표 아래의 존을 찾는다 — 마우스 기반 드래그(간트 바)가 쓴다.
 * 존 루트에 data-axis-zone 이 붙어 있어야 한다(useAxisDropZone이 붙여 준다).
 */
export function findAxisZoneAt(x: number, y: number): AxisZone | null {
  const el = document.elementFromPoint(x, y);
  const zoneEl = el?.closest("[data-axis-zone]") as HTMLElement | null;
  const zone = zoneEl?.getAttribute("data-axis-zone");
  if (
    zone === "workload" ||
    zone === "placement" ||
    zone === "backlog" ||
    zone === "timeblock"
  ) {
    return zone;
  }
  return null;
}

/* ── 드래그를 못 쓰는 환경의 대체 경로 ─────────────── */

const TIMEBLOCK_REQUEST_EVENT = "bridge:timeblock-request";

/**
 * "이 항목을 지금부터 타임블록에 넣어 달라" — 터치·키보드용.
 *
 * 드롭과 달리 좌표가 없으므로 시각은 받는 쪽(타임블록)이 정한다.
 * 블록을 만든 뒤 dispatchAxisDrop을 쏘는 뒷부분은 드롭과 완전히 같은 코드를 탄다.
 */
export function requestTimeblockPlacement(item: AxisItem) {
  window.dispatchEvent(
    new CustomEvent<AxisItem>(TIMEBLOCK_REQUEST_EVENT, { detail: item }),
  );
}

/** 타임블록이 구독한다 — 듣는 쪽이 없으면(일정 탭 밖) 아무 일도 일어나지 않는다 */
export function useTimeblockRequest(handler: (item: AxisItem) => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<AxisItem>).detail;
      if (detail?.id) ref.current(detail);
    };
    window.addEventListener(TIMEBLOCK_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(TIMEBLOCK_REQUEST_EVENT, onRequest);
  }, []);
}

/** 마우스 기반 소스가 드롭을 확정할 때 (HTML5 드롭은 useAxisDropZone이 대신 쏜다) */
export function dispatchAxisDrop(detail: AxisDropDetail) {
  window.dispatchEvent(new CustomEvent<AxisDropDetail>(DROP_EVENT, { detail }));
}

/* ── 목적지 / 소유자가 쓰는 훅들 ───────────────────── */

/**
 * 존을 드롭 대상으로 만든다.
 *
 * @returns active — 지금 이 존이 받을 수 있는 드래그가 진행 중인가 (불을 켤 신호)
 * @returns over   — 커서가 이 존 위에 있는가 (강조)
 * @returns zoneProps — 존 루트 엘리먼트에 그대로 펼친다
 */
export function useAxisDropZone(options: {
  zone: AxisZone;
  /** 이 존이 받아 주는 출발지들 */
  accepts: AxisZone[];
  disabled?: boolean;
}) {
  const { zone, accepts, disabled = false } = options;

  const [dragFrom, setDragFrom] = useState<AxisZone | null>(null);
  const [pointerOver, setPointerOver] = useState(false);
  const [htmlOver, setHtmlOver] = useState(false);
  // dragleave는 자식으로 들어갈 때도 뜬다 — 진입 횟수를 세서 실제 이탈만 잡는다
  const enterCount = useRef(0);

  // accepts 배열은 인라인으로 넘어오므로 매 렌더 참조가 바뀐다.
  // 이벤트 핸들러가 매번 재등록되지 않도록 ref로 우회한다.
  const acceptsRef = useRef(accepts);
  acceptsRef.current = accepts;

  useEffect(() => {
    const onDrag = (e: Event) => {
      const detail = (e as CustomEvent<AxisDragDetail>).detail;
      setDragFrom(detail.from);
      if (!detail.from) {
        setPointerOver(false);
        setHtmlOver(false);
        enterCount.current = 0;
        return;
      }
      // over 키가 없는 이벤트(=HTML5 소스의 시작 알림)는 pointerOver를 건드리지 않는다
      if ("over" in detail) setPointerOver(detail.over === zone);
    };
    window.addEventListener(DRAG_EVENT, onDrag);
    return () => window.removeEventListener(DRAG_EVENT, onDrag);
  }, [zone]);

  const active =
    !disabled &&
    dragFrom !== null &&
    dragFrom !== zone &&
    accepts.includes(dragFrom);

  // 핸들러가 매번 새로 만들어지지 않도록 ref로 읽는다.
  // 자기 존에서 나온 카드는 받지 않는다 — 받아 주는 척하면 안 된다.
  const activeRef = useRef(active);
  activeRef.current = active;

  const onDragOver = useCallback((e: DragEvent) => {
    if (!activeRef.current) return;
    if (!e.dataTransfer.types.includes(AXIS_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDragEnter = useCallback((e: DragEvent) => {
    if (!activeRef.current) return;
    if (!e.dataTransfer.types.includes(AXIS_DRAG_TYPE)) return;
    enterCount.current += 1;
    setHtmlOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    enterCount.current = Math.max(0, enterCount.current - 1);
    if (enterCount.current === 0) setHtmlOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      enterCount.current = 0;
      setHtmlOver(false);
      if (disabled) return;
      const raw = e.dataTransfer.getData(AXIS_DRAG_TYPE);
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const payload = JSON.parse(raw) as AxisDragPayload;
        if (!payload?.item?.id) return;
        if (payload.from === zone) return;
        if (!acceptsRef.current.includes(payload.from)) return;
        dispatchAxisDrop({ from: payload.from, to: zone, item: payload.item });
      } catch {
        // 우리 페이로드가 아니면 무시한다
      } finally {
        endAxisDrag();
      }
    },
    [disabled, zone],
  );

  return {
    active,
    over: active && (pointerOver || htmlOver),
    zoneProps: {
      "data-axis-zone": zone,
      onDragOver,
      onDragEnter,
      onDragLeave,
      onDrop,
    } as const,
  };
}

/**
 * 축 이동을 실제로 수행할 컴포넌트가 구독한다.
 * 여러 컴포넌트가 동시에 들으므로 핸들러 안에서 from/to로 자기 몫만 걸러야 한다.
 */
export function useAxisTransfer(handler: (detail: AxisDropDetail) => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onDrop = (e: Event) => {
      const detail = (e as CustomEvent<AxisDropDetail>).detail;
      if (detail?.from && detail?.to) ref.current(detail);
    };
    window.addEventListener(DROP_EVENT, onDrop);
    return () => window.removeEventListener(DROP_EVENT, onDrop);
  }, []);
}

/** 다른 존의 이동으로 내 목록이 낡았을 때 다시 읽는다 */
export function useAxisRefresh(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const onRefresh = () => ref.current();
    window.addEventListener(REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh);
  }, []);
}
