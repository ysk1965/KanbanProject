// DEV-ONLY 임시 미리보기 진입점 — 실제 report JSON(/__realReport.json)을 받아
// AutoReportView를 그대로 렌더한다. 커밋 전 삭제(preview.html, src/preview.tsx, public/__realReport.json).
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AutoReportView } from "./app/components/AutoReportView";
import "./styles/index.css";

function Preview() {
  const [report, setReport] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/__realReport.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`__realReport.json ${r.status}`);
        return r.json();
      })
      .then(setReport)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err)
    return (
      <div style={{ padding: 24, color: "#fb7185", fontFamily: "monospace" }}>
        {err}
      </div>
    );
  if (!report)
    return (
      <div style={{ padding: 24, color: "#94a3b8", fontFamily: "monospace" }}>
        loading /__realReport.json…
      </div>
    );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bridge-dark, #191f2d)" }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <AutoReportView report={report as any} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
