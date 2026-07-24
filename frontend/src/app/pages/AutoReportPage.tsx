import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";

import { autoReportAPI } from "../utils/api";
import type { AutoReport } from "../utils/api";
import { AutoReportView } from "../components/AutoReportView";

export default function AutoReportPage() {
  const { shareToken, boardId, reportId } = useParams();

  const [report, setReport] = useState<AutoReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = shareToken
        ? await autoReportAPI.getByShareToken(shareToken)
        : await autoReportAPI.getForMember(boardId!, reportId!);
      setReport(data);
    } catch (e) {
      const message =
        (e as { message?: string })?.message ??
        "보고서를 불러오지 못했습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [shareToken, boardId, reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center px-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6 text-center"
        >
          <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-3" />
          <h1 className="text-sm md:text-lg font-bold text-foreground tracking-tight mb-2">
            보고서를 열 수 없습니다
          </h1>
          <p className="text-xs text-slate-500">
            {error ?? "링크가 만료되었거나 삭제된 보고서입니다."}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      <AutoReportView report={report} />
    </div>
  );
}
