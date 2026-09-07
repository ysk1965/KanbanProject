import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, RefreshCw } from "lucide-react";

import type { StorageFileItem, StoragePreviewInfo } from "../../utils/api";

/** PENDING 폴링 간격과 포기 시점. 서버 변환 타임아웃(120s)보다 조금 길게 잡는다. */
const POLL_INTERVAL_MS = 3000;
const POLL_GIVE_UP_MS = 150_000;

interface DocumentPreviewProps {
  file: StorageFileItem;
  /** 변환 상태 조회 (storageApi.getPreview) */
  loadPreview: (file: StorageFileItem) => Promise<StoragePreviewInfo>;
  heightClass?: string;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "converting" }
  | { kind: "ready"; url: string }
  | { kind: "failed" }
  | { kind: "unavailable" }
  | { kind: "timeout" };

/**
 * docx/pptx/hwp 등 브라우저가 못 여는 문서를 서버가 PDF 로 바꿔 주면 iframe 으로 보여준다.
 * 변환 중이면 폴링하고, 실패·미지원이면 다운로드를 안내한다.
 */
export function DocumentPreview({
  file,
  loadPreview,
  heightClass = "h-[56vh]",
}: DocumentPreviewProps) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    setState({ kind: "loading" });

    const apply = (info: StoragePreviewInfo) => {
      if (cancelled) return;
      switch (info.status) {
        case "READY":
          if (info.url) {
            setState({ kind: "ready", url: info.url });
            return;
          }
          setState({ kind: "failed" });
          return;
        case "PENDING":
        case "NONE":
          if (Date.now() - startedAt > POLL_GIVE_UP_MS) {
            setState({ kind: "timeout" });
            return;
          }
          setState({ kind: "converting" });
          timerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);
          return;
        case "FAILED":
          setState({ kind: "failed" });
          return;
        default:
          setState({ kind: "unavailable" });
      }
    };

    const poll = () => {
      loadPreview(file)
        .then(apply)
        .catch((err) => {
          console.error("Failed to load document preview:", err);
          if (!cancelled) setState({ kind: "failed" });
        });
    };

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [file, loadPreview, attempt]);

  if (state.kind === "ready") {
    return (
      <iframe
        src={state.url}
        title={file.original_filename}
        className={`w-full ${heightClass}`}
      />
    );
  }

  if (state.kind === "loading" || state.kind === "converting") {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 w-full ${heightClass} text-slate-500`}
      >
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
        <span className="text-xs">
          {state.kind === "converting"
            ? "PDF로 변환하는 중입니다. 잠시만 기다려 주세요"
            : "미리보기를 불러오는 중"}
        </span>
      </div>
    );
  }

  const message =
    state.kind === "unavailable"
      ? "이 서버에서는 문서 미리보기를 지원하지 않습니다"
      : state.kind === "timeout"
        ? "변환이 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요"
        : "PDF 변환에 실패했습니다. 다운로드해서 확인해 주세요";

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
      <FileText className="w-14 h-14" />
      <span className="text-xs">{message}</span>
      {state.kind !== "unavailable" && (
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          다시 시도
        </button>
      )}
    </div>
  );
}
