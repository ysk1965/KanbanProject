import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { taskService } from "../utils/services";

/**
 * 사람이 읽는 태스크 키 딥링크(/t/:taskKey)를 해석해 기존 보드 딥링크로 리다이렉트한다.
 * 해석은 인증이 필요하며(PrivateRoute 하위), 결과는 /boards/{boardId}?task={taskId} 로 replace 이동한다.
 */
export function TaskKeyRedirect() {
  const { taskKey } = useParams<{ taskKey: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const [notFound, setNotFound] = useState(false);
  // 자동 보고서의 체크리스트 딥링크(/t/{key}?checklist=)는 항목 하이라이트까지 이어져야 한다.
  const checklistItemId = searchParams.get("checklist");
  // 보드는 마지막으로 보던 탭을 복원하므로, 어떤 화면 위에 모달을 띄울지 지정한 링크는 그대로 넘긴다.
  const view = searchParams.get("view");

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      if (!taskKey) {
        navigate("/", { replace: true });
        return;
      }
      try {
        const { board_id, task_id } = await taskService.resolveKey(taskKey);
        if (cancelled) return;
        const highlight = checklistItemId
          ? `&checklist=${encodeURIComponent(checklistItemId)}`
          : "";
        const viewParam = view ? `&view=${encodeURIComponent(view)}` : "";
        navigate(`/boards/${board_id}?task=${task_id}${highlight}${viewParam}`, {
          replace: true,
        });
      } catch {
        if (!cancelled) setNotFound(true);
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [taskKey, checklistItemId, view, navigate]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-bridge-dark flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-bold text-foreground">
          {t("taskKey.notFound", "태스크를 찾을 수 없습니다")}
        </p>
        <p className="text-sm text-slate-500">
          {t(
            "taskKey.notFoundHint",
            "링크가 만료되었거나 접근 권한이 없을 수 있어요.",
          )}
        </p>
        <button
          onClick={() => navigate("/", { replace: true })}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
        >
          {t("common.goHome", "홈으로")}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
    </div>
  );
}
