import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";

import { githubAPI } from "../utils/api";

/**
 * GitHub App 설치 후 돌아오는 착지 페이지.
 *
 * <p>GitHub App의 Setup URL은 <b>앱당 하나로 고정</b>이라 보드 ID를 넣을 수 없다.
 * 대신 설치 링크에 실어 보낸 {@code state}(= boardId)가 그대로 돌아오므로,
 * 여기서 받아 보드에 연결한 뒤 해당 보드로 돌려보낸다.
 */
export default function GithubSetupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const installationId = params.get("installation_id");
  const boardId = params.get("state");

  const link = useCallback(async () => {
    if (!installationId || !boardId) {
      setError(
        "설치 정보를 확인할 수 없습니다. 보드 설정의 보고서 탭에서 다시 시도해주세요.",
      );
      return;
    }
    try {
      await githubAPI.linkInstallation(boardId, installationId);
      navigate(`/boards/${boardId}?github=installed`, { replace: true });
    } catch (e) {
      setError(
        (e as { message?: string })?.message ??
          "GitHub 설치를 보드에 연결하지 못했습니다.",
      );
    }
  }, [installationId, boardId, navigate]);

  useEffect(() => {
    void link();
  }, [link]);

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center px-5">
      {error ? (
        <div className="max-w-md w-full bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6 flex flex-col gap-3 text-center">
          <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
          <h1 className="text-sm md:text-lg font-bold text-foreground tracking-tight">
            GitHub 연결에 실패했습니다
          </h1>
          <p className="text-xs text-slate-500">{error}</p>
          {boardId && (
            <button
              onClick={() => navigate(`/boards/${boardId}`)}
              className="mt-2 px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold text-xs hover:bg-bridge-accent/90 transition-all"
            >
              보드로 돌아가기
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          <span className="text-xs text-slate-500">
            GitHub 설치를 보드에 연결하는 중…
          </span>
        </div>
      )}
    </div>
  );
}
