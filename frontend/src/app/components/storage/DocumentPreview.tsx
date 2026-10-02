import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, RefreshCw } from "lucide-react";

import type { StorageFileItem, StoragePreviewInfo } from "../../utils/api";
import { formatBytes } from "./storageUtils";

/** PENDING 폴링 간격. 서버가 고아 PENDING 을 스스로 되돌리므로 포기 시점 없이 상태가 바뀔 때까지 폴링한다. */
const POLL_INTERVAL_MS = 3000;
/** 이보다 오래 걸리면 "예상보다 오래" 안내로 바꾼다 (서버 변환 타임아웃 300s 와 동일). */
const SLOW_THRESHOLD_SEC = 300;

interface DocumentPreviewProps {
  file: StorageFileItem;
  /** 변환 상태 조회 (storageApi.getPreview) */
  loadPreview: (file: StorageFileItem) => Promise<StoragePreviewInfo>;
  heightClass?: string;
}

type ViewState =
  | { kind: "loading" }
  | {
      kind: "converting";
      /** 서버가 알려준 경과 초. syncedAt 이후 흐른 시간을 더해 표시한다 */
      elapsedSeconds: number;
      syncedAt: number;
      queueAhead: number;
    }
  | { kind: "ready"; url: string }
  | { kind: "failed" }
  | { kind: "unavailable" }
  | { kind: "tooLarge"; limitBytes: number | null };

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}분 ${sec}초` : `${sec}초`;
}

/**
 * docx/pptx/hwp 등 브라우저가 못 여는 문서를 서버가 PDF 로 바꿔 주면 iframe 으로 보여준다.
 * 변환은 서버에서 돌고 결과는 파일 단위로 저장되므로, 이 화면은 상태만 폴링한다 —
 * 페이지를 떠나도 변환은 이어지고 다시 열면 그 시점의 경과 시간부터 보여준다.
 */
export function DocumentPreview({
  file,
  loadPreview,
  heightClass = "h-[56vh]",
}: DocumentPreviewProps) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [, setTick] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
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
          setState({
            kind: "converting",
            elapsedSeconds: info.elapsed_seconds ?? 0,
            syncedAt: Date.now(),
            queueAhead: info.queue_ahead ?? 0,
          });
          timerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);
          return;
        case "FAILED":
          setState({ kind: "failed" });
          return;
        case "TOO_LARGE":
          setState({ kind: "tooLarge", limitBytes: info.max_source_bytes ?? null });
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

  // 변환 중일 때만 1초마다 다시 그려 경과 시간이 흐르게 한다
  const converting = state.kind === "converting";
  useEffect(() => {
    if (!converting) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [converting]);

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
    const elapsed =
      state.kind === "converting"
        ? state.elapsedSeconds + (Date.now() - state.syncedAt) / 1000
        : 0;
    const queueAhead = state.kind === "converting" ? state.queueAhead : 0;
    const slow = elapsed > SLOW_THRESHOLD_SEC;

    const headline =
      state.kind !== "converting"
        ? "미리보기를 불러오는 중"
        : queueAhead > 0
          ? `앞에 ${queueAhead}개 문서가 변환을 기다리고 있습니다`
          : slow
            ? "변환이 예상보다 오래 걸리고 있습니다"
            : "PDF로 변환하는 중입니다";

    return (
      <div
        className={`flex flex-col items-center justify-center gap-3 w-full ${heightClass} text-slate-500`}
      >
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
        <span className="text-xs text-center px-4">{headline}</span>
        {state.kind === "converting" && (
          <div className="flex flex-col items-center gap-1 text-xs text-slate-600 text-center px-4">
            <span>
              {formatElapsed(elapsed)} 경과
              {!slow && " · 보통 1분 안에, 큰 파일은 몇 분 걸립니다"}
            </span>
            <span>창을 닫아도 변환은 계속되며, 끝난 뒤 다시 열면 바로 보입니다</span>
          </div>
        )}
      </div>
    );
  }

  const message =
    state.kind === "unavailable"
      ? "이 서버에서는 문서 미리보기를 지원하지 않습니다"
      : state.kind === "tooLarge"
        ? `파일이 너무 커서 미리보기를 만들 수 없습니다${
            state.limitBytes ? ` (최대 ${formatBytes(state.limitBytes)})` : ""
          }. 다운로드해서 확인해 주세요`
        : "PDF 변환에 실패했습니다. 다운로드해서 확인해 주세요";

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
      <FileText className="w-14 h-14" />
      <span className="text-xs text-center px-4">{message}</span>
      {state.kind === "failed" && (
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
