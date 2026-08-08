/**
 * JIRA 표시 규약 — 원문 링크, 우선순위·이슈 타입 표식.
 *
 * 우선순위와 이슈 타입은 JIRA에서 **이름 문자열로만** 내려온다. 값 집합이 프로젝트 설정과
 * 사이트 언어에 따라 달라(Highest/가장 높음/P0/Blocker…) 서버에서 enum으로 좁힐 수 없어서,
 * 이름을 그대로 들고 와 여기서 표식으로 해석한다. 해석에 실패해도 이름은 잃지 않는다 —
 * 모르는 값은 중립 표식 + 원래 이름 툴팁으로 보여준다.
 */
import {
  BookOpen,
  Bug,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Circle,
  Equal,
  SquareCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * 이슈 원문 URL. base_url은 스킴 없이 저장된다(`normalizeHost` — 예: `team.atlassian.net`).
 * 값이 어느 형태로 오든 받도록 스킴을 벗겨 내고 다시 붙인다.
 */
export function jiraIssueUrl(
  baseUrl: string | null | undefined,
  issueKey: string | null | undefined,
): string | null {
  if (!baseUrl || !issueKey) return null;
  const host = baseUrl
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!host) return null;
  return `https://${host}/browse/${encodeURIComponent(issueKey)}`;
}

export interface JiraMark {
  icon: LucideIcon;
  color: string;
  /** 툴팁·aria에 쓰는 원래 JIRA 값. */
  label: string;
}

/** 이름 비교용 정규화 — 대소문자·공백·하이픈 차이를 지운다. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, "");
}

function matches(value: string, keywords: string[]): boolean {
  return keywords.some((k) => value.includes(k));
}

/**
 * 우선순위 표식. JIRA 자체가 화살표로 순위를 보여주므로 같은 관례를 따른다 —
 * 색만으로 구분하지 않아 색각 이상에서도 위/아래가 읽힌다.
 */
export function jiraPriorityMark(
  name: string | null | undefined,
): JiraMark | null {
  if (!name || !name.trim()) return null;
  const v = normalize(name);
  const label = name.trim();

  // 순서 주의: "가장 높음"은 "높음"을 포함하므로 최상위부터 판정한다.
  if (matches(v, ["highest", "가장높음", "최상", "blocker", "critical", "p0", "urgent"]))
    return { icon: ChevronsUp, color: "#ef4444", label };
  if (matches(v, ["lowest", "가장낮음", "최하", "trivial", "p4"]))
    return { icon: ChevronsDown, color: "#94a3b8", label };
  if (matches(v, ["high", "높음", "major", "p1"]))
    return { icon: ChevronUp, color: "#f97316", label };
  if (matches(v, ["low", "낮음", "minor", "p3"]))
    return { icon: ChevronDown, color: "#3b82f6", label };
  if (matches(v, ["medium", "normal", "보통", "중간", "p2"]))
    return { icon: Equal, color: "#ca8a04", label };

  // 모르는 우선순위 체계 — 값이 있다는 사실은 알려주고 순위 해석은 포기한다.
  return { icon: Circle, color: "#94a3b8", label };
}

/** 이슈 타입 표식. 색은 JIRA 기본 타입 색을 따라가되 양 테마에서 읽히는 톤으로 잡았다. */
export function jiraIssueTypeMark(
  name: string | null | undefined,
): JiraMark | null {
  if (!name || !name.trim()) return null;
  const v = normalize(name);
  const label = name.trim();

  if (matches(v, ["bug", "버그", "결함", "장애", "defect"]))
    return { icon: Bug, color: "#e5493a", label };
  if (matches(v, ["story", "스토리"]))
    return { icon: BookOpen, color: "#4c9f38", label };
  if (matches(v, ["epic", "에픽"]))
    return { icon: Zap, color: "#7f56d9", label };
  if (matches(v, ["task", "작업", "태스크", "subtask", "하위"]))
    return { icon: SquareCheck, color: "#2a86d1", label };

  return { icon: Circle, color: "#94a3b8", label };
}
