import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { publicMindMapAPI } from "../utils/api";
import { formatDateTime } from "../utils/dateUtils";
import type { Feature, Milestone, SharedMindMapSnapshot, Task } from "../types";
import { MindMapView, type FeatureMilestoneRef } from "../views/MindMapView";

function useSystemTheme() {
  const [isDark, setIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDark;
}

const noop = () => {};

export function SharedMindMapPage() {
  const { shareCode } = useParams<{ shareCode: string }>();
  const { t } = useTranslation();
  const isDark = useSystemTheme();
  const [snapshot, setSnapshot] = useState<SharedMindMapSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Bridge CSS 변수(bridge-dark 등)가 시스템 테마를 따르도록 html 클래스 적용
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(isDark ? "dark" : "light");
    return () => {
      root.classList.remove("light", "dark");
    };
  }, [isDark]);

  // 공개 링크 페이지는 검색엔진 인덱싱 차단
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  useEffect(() => {
    if (!shareCode) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    publicMindMapAPI
      .getSnapshot(shareCode)
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareCode]);

  // 스냅샷 → MindMapView가 기대하는 Feature/Task 타입으로 변환
  const features: Feature[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.features.map((f) => ({
      id: f.id,
      title: f.title,
      color: f.color,
      status: f.status,
      assignee: f.assignee
        ? { id: f.assignee.id, name: f.assignee.name, email: "", profile_image: null }
        : null,
      start_date: null,
      due_date: null,
      total_tasks: f.total_tasks,
      completed_tasks: f.completed_tasks,
      progress_percentage: f.progress_percentage,
      position: f.position,
      tags: [],
    }));
  }, [snapshot]);

  const tasks: Task[] = useMemo(() => {
    if (!snapshot) return [];
    const featureById = new Map(snapshot.features.map((f) => [f.id, f]));
    return snapshot.tasks.map((task) => {
      const feature = featureById.get(task.feature_id);
      return {
        id: task.id,
        feature_id: task.feature_id,
        feature_title: feature?.title ?? "",
        feature_color: feature?.color ?? "#6366F1",
        block_id: "",
        milestone_id: task.milestone_id ?? null,
        title: task.title,
        start_date: null,
        due_date: null,
        baseline_start_date: null,
        baseline_due_date: null,
        estimated_minutes: null,
        completed: task.completed,
        position: task.position,
        feature_position: task.feature_position,
        tags: [],
        assignees: task.assignees,
      };
    });
  }, [snapshot]);

  // 마일스톤 필터 패널은 milestones prop에서 옵션을 파생하므로 뷰어에도 전달
  // (idx 순서 = 스냅샷 순서 = 칩 색상 매핑 기준. 필터에 안 쓰는 필드는 기본값)
  const milestones: Milestone[] = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.milestones]
      .sort((a, b) => a.idx - b.idx)
      .map((ms) => ({
        id: ms.id,
        title: ms.title,
        start_date: "",
        end_date: "",
        feature_count: 0,
        progress_percentage: 0,
      }));
  }, [snapshot]);

  const featureMilestonesMap: Record<string, FeatureMilestoneRef[]> =
    useMemo(() => {
      if (!snapshot) return {};
      const map: Record<string, FeatureMilestoneRef[]> = {};
      snapshot.features.forEach((f) => {
        if (f.milestones.length > 0) map[f.id] = f.milestones;
      });
      return map;
    }, [snapshot]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (error || !snapshot || !shareCode) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-rose-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            {t("mindmap.shareNotAvailable", "마인드맵을 볼 수 없습니다")}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {t(
              "mindmap.shareNotAvailableDesc",
              "이 공유 링크는 만료되었거나 비활성화되었습니다.",
            )}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl text-sm font-medium hover:bg-bridge-accent/90 transition-colors"
          >
            <ArrowLeft size={14} />
            {t("notes.shareGoHome", "홈으로 이동")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bridge-dark">
      {/* 상단 바 */}
      <header className="shrink-0 border-b border-foreground/5 bg-bridge-obsidian">
        <div className="px-4 md:px-6 py-3 flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 shrink-0 text-slate-400 hover:text-foreground transition-colors"
          >
            <img src="/BridgeSpotsIcon.png" alt="BRIDGE" className="h-6 w-6" />
            <span className="text-sm font-bold text-foreground hidden sm:inline">
              BRIDGE
            </span>
          </Link>
          <span className="text-slate-600" aria-hidden="true">
            /
          </span>
          <span className="flex-1 min-w-0 truncate text-sm font-bold text-foreground">
            {snapshot.board_name}
          </span>
          <span className="hidden md:inline text-xs text-slate-500">
            {t("mindmap.shareGeneratedAt", "{{time}} 기준", {
              time: formatDateTime(snapshot.generated_at),
            })}
          </span>
          <span className="shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
            {t("mindmap.readOnly", "읽기 전용")}
          </span>
        </div>
      </header>

      {/* 마인드맵 캔버스 (읽기 전용) */}
      <div className="flex-1 min-h-0 flex">
        <MindMapView
          boardId={shareCode}
          features={features}
          tasks={tasks}
          featureMilestonesMap={featureMilestonesMap}
          milestones={milestones}
          canEdit={false}
          memberColorMap={{}}
          onFeatureClick={noop}
          onTaskClick={noop}
          loadDocument={() => Promise.resolve(snapshot.layout)}
        />
      </div>
    </div>
  );
}
