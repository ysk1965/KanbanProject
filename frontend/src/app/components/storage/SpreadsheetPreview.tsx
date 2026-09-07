import { useEffect, useState } from "react";
import { Loader2, FileSpreadsheet } from "lucide-react";

import type { StorageFileItem } from "../../utils/api";
import { fileExtension } from "./storageUtils";

/** 렌더 상한 — 브라우저 DOM 폭주 방지. 넘치면 안내 문구로 알린다. */
const MAX_ROWS = 500;
const MAX_COLS = 60;

interface SheetData {
  name: string;
  rows: string[][];
  totalRows: number;
  totalCols: number;
}

interface SpreadsheetPreviewProps {
  file: StorageFileItem;
  /** 인증 경유로 원본 바이트를 받아오는 함수 (storageApi.fetchBlob) */
  loadBlob: (file: StorageFileItem) => Promise<Blob>;
  /** 표 영역 높이 (tailwind 클래스) */
  heightClass?: string;
}

/**
 * CSV/TSV 는 Excel 이 EUC-KR 로 저장하는 경우가 많아 UTF-8 로 먼저 시도하고
 * 실패하면 EUC-KR 로 다시 디코딩한다.
 */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("euc-kr").decode(buffer);
  }
}

async function parseWorkbook(
  file: StorageFileItem,
  blob: Blob,
): Promise<SheetData[]> {
  // SheetJS 는 무거워서 표 파일을 실제로 열 때만 청크로 받는다
  const XLSX = await import("xlsx");
  const buffer = await blob.arrayBuffer();
  const ext = fileExtension(file.original_filename);
  const isText = ext === "csv" || ext === "tsv";
  const workbook = isText
    ? XLSX.read(decodeText(buffer), {
        type: "string",
        FS: ext === "tsv" ? "\t" : undefined,
      })
    : XLSX.read(buffer, { type: "array" });

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    const totalRows = matrix.length;
    const totalCols = matrix.reduce((m, r) => Math.max(m, r.length), 0);
    const rows = matrix
      .slice(0, MAX_ROWS)
      .map((r) =>
        r.slice(0, MAX_COLS).map((c) => (c == null ? "" : String(c))),
      );
    return { name, rows, totalRows, totalCols };
  });
}

/** 열 머리글: 0 → A, 26 → AA */
function columnLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** xlsx / xls / csv / tsv / ods 를 브라우저에서 파싱해 시트 탭 + 표로 보여주는 뷰어 */
export function SpreadsheetPreview({
  file,
  loadBlob,
  heightClass = "h-[56vh]",
}: SpreadsheetPreviewProps) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setError(null);
    setActive(0);
    loadBlob(file)
      .then((blob) => parseWorkbook(file, blob))
      .then((parsed) => {
        if (!cancelled) setSheets(parsed);
      })
      .catch((err) => {
        console.error("Failed to parse spreadsheet:", err);
        if (!cancelled) setError("표 파일을 읽지 못했습니다");
      });
    return () => {
      cancelled = true;
    };
  }, [file, loadBlob]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
        <FileSpreadsheet className="w-14 h-14" />
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  if (!sheets) {
    return (
      <div className={`flex items-center justify-center w-full ${heightClass}`}>
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  const sheet = sheets[active] ?? sheets[0];
  const truncated =
    sheet && (sheet.totalRows > MAX_ROWS || sheet.totalCols > MAX_COLS);
  const colCount = sheet ? Math.min(sheet.totalCols, MAX_COLS) : 0;

  return (
    <div className={`w-full flex flex-col min-h-0 ${heightClass}`}>
      {sheets.length > 1 && (
        <div
          role="tablist"
          className="flex items-center gap-1 px-2 pt-2 overflow-x-auto custom-scrollbar border-b border-foreground/[0.08] shrink-0"
        >
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`px-3 py-1.5 rounded-t-lg text-xs font-bold whitespace-nowrap transition-colors ${
                i === active
                  ? "bg-bridge-accent/15 text-bridge-accent"
                  : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {!sheet || sheet.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <FileSpreadsheet className="w-14 h-14" />
            <span className="text-xs">빈 시트입니다</span>
          </div>
        ) : (
          <table className="border-collapse text-xs text-foreground min-w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-bridge-obsidian border border-foreground/[0.08] px-2 py-1 text-slate-500 font-medium w-10" />
                {Array.from({ length: colCount }, (_, c) => (
                  <th
                    key={c}
                    className="bg-bridge-obsidian border border-foreground/[0.08] px-2 py-1 text-slate-500 font-medium text-center min-w-[80px]"
                  >
                    {columnLabel(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r} className="hover:bg-foreground/[0.03]">
                  <td className="sticky left-0 z-10 bg-bridge-obsidian border border-foreground/[0.08] px-2 py-1 text-slate-500 text-right select-none">
                    {r + 1}
                  </td>
                  {Array.from({ length: colCount }, (_, c) => (
                    <td
                      key={c}
                      className="border border-foreground/[0.08] px-2 py-1 whitespace-nowrap max-w-[320px] overflow-hidden text-ellipsis"
                      title={row[c] || undefined}
                    >
                      {row[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {truncated && sheet && (
        <div className="shrink-0 px-3 py-1.5 border-t border-foreground/[0.08] text-xs text-slate-500">
          전체 {sheet.totalRows.toLocaleString()}행 × {sheet.totalCols}열 중
          일부만 표시합니다. 전체는 다운로드해서 확인하세요.
        </div>
      )}
    </div>
  );
}
