import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Loader2,
  FileSpreadsheet,
  Search,
  WrapText,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  X,
} from "lucide-react";

import type { StorageFileItem } from "../../utils/api";
import { IconButton } from "../ui/IconButton";
import { fileExtension } from "./storageUtils";

/** 파싱 상한 — 이 범위를 넘는 부분은 안내 문구로 알린다. */
const MAX_ROWS = 10000;
const MAX_COLS = 256;
/** 한 번에 DOM 에 올리는 행 수. 스크롤이 바닥에 가까워지면 같은 크기만큼 더 그린다. */
const ROW_CHUNK = 200;
const ROW_HEADER_WIDTH = 44;
const DEFAULT_COL_WIDTH = 96;
const MIN_COL_WIDTH = 36;
const MAX_COL_WIDTH = 800;

interface CellSpan {
  rowSpan: number;
  colSpan: number;
}

interface SheetData {
  name: string;
  /** 렌더 범위 안의 값 행렬 (빈 행 포함 — 엑셀 행 번호와 일치) */
  rows: string[][];
  rowCount: number;
  colCount: number;
  totalRows: number;
  totalCols: number;
  /** 파일에 저장된 열 너비(px). 리사이즈 초기값이자 더블클릭 복원값 */
  colWidths: number[];
  /** 파일에 저장된 행 높이(px). 없으면 undefined (브라우저 기본) */
  rowHeights: (number | undefined)[];
  /** 병합 앵커 셀 → span */
  merges: Map<string, CellSpan>;
  /** 병합에 덮여 그리지 않는 셀 */
  covered: Set<string>;
  /** 시트 범위 시작 오프셋 (행/열 번호 표시용) */
  firstRow: number;
  firstCol: number;
}

interface SpreadsheetPreviewProps {
  file: StorageFileItem;
  /** 인증 경유로 원본 바이트를 받아오는 함수 (storageApi.fetchBlob) */
  loadBlob: (file: StorageFileItem) => Promise<Blob>;
  /** 표 영역 높이 (tailwind 클래스) */
  heightClass?: string;
}

const cellKey = (r: number, c: number) => `${r}:${c}`;

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

const clampWidth = (w: number) =>
  Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(w)));

/** SheetJS 열 정보 → px. wpx 가 있으면 그대로, 없으면 문자 폭(wch) 기준으로 환산 */
function columnWidthPx(info?: { wpx?: number; wch?: number; width?: number }) {
  if (!info) return DEFAULT_COL_WIDTH;
  if (info.wpx) return clampWidth(info.wpx);
  const wch = info.wch ?? info.width;
  if (wch) return clampWidth(wch * 7 + 5);
  return DEFAULT_COL_WIDTH;
}

/** SheetJS 행 정보 → px. hpt(포인트) 는 96/72 로 환산 */
function rowHeightPx(info?: { hpx?: number; hpt?: number }) {
  if (!info) return undefined;
  if (info.hpx) return Math.round(info.hpx);
  if (info.hpt) return Math.round((info.hpt * 96) / 72);
  return undefined;
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
    : XLSX.read(buffer, { type: "array", cellStyles: true });

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const ref = sheet["!ref"];
    if (!ref) {
      return {
        name,
        rows: [],
        rowCount: 0,
        colCount: 0,
        totalRows: 0,
        totalCols: 0,
        colWidths: [],
        rowHeights: [],
        merges: new Map(),
        covered: new Set(),
        firstRow: 0,
        firstCol: 0,
      };
    }

    const range = XLSX.utils.decode_range(ref);
    const totalRows = range.e.r - range.s.r + 1;
    const totalCols = range.e.c - range.s.c + 1;
    const rowCount = Math.min(totalRows, MAX_ROWS);
    const colCount = Math.min(totalCols, MAX_COLS);
    const renderRange = {
      s: { r: range.s.r, c: range.s.c },
      e: { r: range.s.r + rowCount - 1, c: range.s.c + colCount - 1 },
    };

    // blankrows: true — 빈 행을 유지해야 뷰어 행 번호가 엑셀과 같다
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
      range: renderRange,
    });
    const rows: string[][] = [];
    for (let r = 0; r < rowCount; r++) {
      const src = matrix[r] ?? [];
      const row: string[] = new Array(colCount);
      for (let c = 0; c < colCount; c++) {
        const v = src[c];
        row[c] = v == null ? "" : String(v);
      }
      rows.push(row);
    }

    const colInfos = sheet["!cols"] ?? [];
    const colWidths = Array.from({ length: colCount }, (_, c) =>
      columnWidthPx(colInfos[range.s.c + c]),
    );
    const rowInfos = sheet["!rows"] ?? [];
    const rowHeights = Array.from({ length: rowCount }, (_, r) =>
      rowHeightPx(rowInfos[range.s.r + r]),
    );

    const merges = new Map<string, CellSpan>();
    const covered = new Set<string>();
    for (const m of sheet["!merges"] ?? []) {
      const sr = m.s.r - range.s.r;
      const sc = m.s.c - range.s.c;
      const er = Math.min(m.e.r, renderRange.e.r) - range.s.r;
      const ec = Math.min(m.e.c, renderRange.e.c) - range.s.c;
      if (sr < 0 || sc < 0 || sr >= rowCount || sc >= colCount) continue;
      if (er <= sr && ec <= sc) continue;
      merges.set(cellKey(sr, sc), {
        rowSpan: er - sr + 1,
        colSpan: ec - sc + 1,
      });
      for (let r = sr; r <= er; r++) {
        for (let c = sc; c <= ec; c++) {
          if (r !== sr || c !== sc) covered.add(cellKey(r, c));
        }
      }
    }

    return {
      name,
      rows,
      rowCount,
      colCount,
      totalRows,
      totalCols,
      colWidths,
      rowHeights,
      merges,
      covered,
      firstRow: range.s.r,
      firstCol: range.s.c,
    };
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

interface CellPos {
  r: number;
  c: number;
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

  const [colWidths, setColWidths] = useState<number[]>([]);
  const [renderedRows, setRenderedRows] = useState(ROW_CHUNK);
  const [wrap, setWrap] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [selected, setSelected] = useState<CellPos | null>(null);
  const [expanded, setExpanded] = useState<CellPos | null>(null);
  const [copied, setCopied] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<CellPos | null>(null);

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

  const sheet = sheets ? (sheets[active] ?? sheets[0]) : undefined;

  // 시트가 바뀌면 열 너비·렌더 행·선택·검색 위치를 초기화한다
  useEffect(() => {
    setColWidths(sheet ? [...sheet.colWidths] : []);
    setRenderedRows(ROW_CHUNK);
    setSelected(null);
    setExpanded(null);
    setMatchIndex(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sheet]);

  // 검색: 대소문자 무시 부분 일치
  const matches = useMemo<CellPos[]>(() => {
    const q = query.trim().toLowerCase();
    if (!sheet || !q) return [];
    const found: CellPos[] = [];
    for (let r = 0; r < sheet.rowCount; r++) {
      const row = sheet.rows[r];
      for (let c = 0; c < sheet.colCount; c++) {
        if (row[c] && row[c].toLowerCase().includes(q)) found.push({ r, c });
      }
    }
    return found;
  }, [sheet, query]);
  const matchSet = useMemo(
    () => new Set(matches.map((m) => cellKey(m.r, m.c))),
    [matches],
  );
  const currentMatch =
    matches.length > 0 ? matches[matchIndex % matches.length] : null;

  useEffect(() => {
    setMatchIndex(0);
  }, [query]);

  /** 특정 셀이 DOM 에 있도록 렌더 행 수를 늘린 뒤 스크롤한다 */
  const scrollToCell = useCallback((pos: CellPos) => {
    pendingScrollRef.current = pos;
    setRenderedRows((n) => (pos.r < n ? n : pos.r + ROW_CHUNK));
  }, []);

  useEffect(() => {
    const pos = pendingScrollRef.current;
    if (!pos || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(
      `[data-cell="${cellKey(pos.r, pos.c)}"]`,
    );
    if (el) {
      pendingScrollRef.current = null;
      el.scrollIntoView({ block: "center", inline: "center" });
    }
  });

  useEffect(() => {
    if (currentMatch) scrollToCell(currentMatch);
  }, [currentMatch, scrollToCell]);

  const stepMatch = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    setMatchIndex((i) => (i + dir + matches.length) % matches.length);
  };

  // 스크롤이 바닥 근처면 다음 청크를 그린다
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !sheet) return;
    if (renderedRows >= sheet.rowCount) return;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 800) {
      setRenderedRows((n) => Math.min(sheet.rowCount, n + ROW_CHUNK));
    }
  };

  // 열 너비 드래그
  const startResize = (c: number, e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[c] ?? DEFAULT_COL_WIDTH;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const next = clampWidth(startWidth + ev.clientX - startX);
      setColWidths((prev) => {
        const copy = [...prev];
        copy[c] = next;
        return copy;
      });
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const resetColumn = (c: number) => {
    if (!sheet) return;
    setColWidths((prev) => {
      const copy = [...prev];
      copy[c] = sheet.colWidths[c];
      return copy;
    });
  };

  // 전체화면
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void rootRef.current?.requestFullscreen?.();
    }
  };

  // 선택 셀 복사 / Esc
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error("Failed to copy cell:", err);
    }
  };
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      if (expanded) setExpanded(null);
      else setSelected(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && selected) {
      const value = sheet?.rows[selected.r]?.[selected.c];
      if (value) {
        e.preventDefault();
        void copyText(value);
      }
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
        <FileSpreadsheet className="w-14 h-14" />
        <span className="text-xs">{error}</span>
      </div>
    );
  }

  if (!sheets || !sheet) {
    return (
      <div className={`flex items-center justify-center w-full ${heightClass}`}>
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  const truncated =
    sheet.totalRows > sheet.rowCount || sheet.totalCols > sheet.colCount;
  const visibleRowCount = Math.min(renderedRows, sheet.rowCount);
  const tableWidth =
    ROW_HEADER_WIDTH + colWidths.reduce((sum, w) => sum + w, 0);
  const expandedValue = expanded
    ? (sheet.rows[expanded.r]?.[expanded.c] ?? "")
    : "";

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`relative w-full flex flex-col min-h-0 bg-bridge-obsidian outline-none focus:ring-2 focus:ring-bridge-accent/30 ${
        fullscreen ? "h-screen" : heightClass
      }`}
    >
      {/* 시트 탭 + 툴바 */}
      <div className="flex items-center gap-2 px-2 pt-1.5 border-b border-foreground/[0.08] shrink-0">
        <div
          role="tablist"
          className="flex items-center gap-1 overflow-x-auto custom-scrollbar min-w-0 flex-1"
        >
          {sheets.map((s, i) => (
            <button
              key={`${i}-${s.name}`}
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

        <div className="flex items-center gap-1 shrink-0 pb-1">
          <div className="relative flex items-center">
            <Search className="absolute left-2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  stepMatch(e.shiftKey ? -1 : 1);
                }
                e.stopPropagation();
              }}
              placeholder="시트 내 검색"
              aria-label="시트 내 검색"
              className="w-36 md:w-48 bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1.5 pl-7 pr-16 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
            {query && (
              <span className="absolute right-2 text-xs text-slate-500 tabular-nums select-none">
                {matches.length === 0
                  ? "0"
                  : `${(matchIndex % matches.length) + 1}/${matches.length}`}
              </span>
            )}
          </div>
          <IconButton
            aria-label={wrap ? "줄바꿈 끄기" : "줄바꿈 켜기"}
            aria-pressed={wrap}
            onClick={() => setWrap((v) => !v)}
            className={wrap ? "text-bridge-accent bg-bridge-accent/15" : ""}
          >
            <WrapText />
          </IconButton>
          <IconButton
            aria-label={fullscreen ? "전체화면 종료" : "전체화면"}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </IconButton>
        </div>
      </div>

      {/* 표 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-auto custom-scrollbar"
      >
        {sheet.rowCount === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <FileSpreadsheet className="w-14 h-14" />
            <span className="text-xs">빈 시트입니다</span>
          </div>
        ) : (
          <table
            className="border-collapse text-xs text-foreground table-fixed"
            style={{ width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: ROW_HEADER_WIDTH }} />
              {colWidths.map((w, c) => (
                <col key={c} style={{ width: w }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-bridge-obsidian border border-foreground/[0.08] px-2 py-1 text-slate-500 font-medium" />
                {colWidths.map((_, c) => (
                  <th
                    key={c}
                    className={`relative bg-bridge-obsidian border border-foreground/[0.08] px-2 py-1 font-medium text-center select-none overflow-hidden ${
                      selected?.c === c
                        ? "text-bridge-accent bg-bridge-accent/15"
                        : "text-slate-500"
                    }`}
                  >
                    {columnLabel(sheet.firstCol + c)}
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`${columnLabel(sheet.firstCol + c)}열 너비 조절`}
                      title="드래그로 너비 조절 · 더블클릭으로 원래 너비"
                      onPointerDown={(e) => startResize(c, e)}
                      onDoubleClick={() => resetColumn(c)}
                      className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-bridge-accent/40 active:bg-bridge-accent/60 touch-none"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.slice(0, visibleRowCount).map((row, r) => (
                <tr
                  key={r}
                  className="hover:bg-foreground/[0.03]"
                  style={{ height: sheet.rowHeights[r] }}
                >
                  <td
                    className={`sticky left-0 z-10 bg-bridge-obsidian border border-foreground/[0.08] px-2 py-1 text-right select-none ${
                      selected?.r === r
                        ? "text-bridge-accent bg-bridge-accent/15"
                        : "text-slate-500"
                    }`}
                  >
                    {sheet.firstRow + r + 1}
                  </td>
                  {row.map((value, c) => {
                    const key = cellKey(r, c);
                    if (sheet.covered.has(key)) return null;
                    const span = sheet.merges.get(key);
                    const isSelected = selected?.r === r && selected?.c === c;
                    const isCurrent =
                      currentMatch?.r === r && currentMatch?.c === c;
                    const isMatch = matchSet.has(key);
                    return (
                      <td
                        key={c}
                        data-cell={key}
                        rowSpan={span?.rowSpan}
                        colSpan={span?.colSpan}
                        title={wrap ? undefined : value || undefined}
                        onClick={() => setSelected({ r, c })}
                        onDoubleClick={() => {
                          if (value) setExpanded({ r, c });
                        }}
                        className={`border border-foreground/[0.08] px-2 py-1 align-top cursor-cell ${
                          wrap
                            ? "whitespace-pre-wrap break-words"
                            : "whitespace-nowrap overflow-hidden text-ellipsis"
                        } ${
                          isCurrent
                            ? "bg-amber-500/40 ring-2 ring-inset ring-amber-500"
                            : isMatch
                              ? "bg-amber-500/15"
                              : ""
                        } ${
                          isSelected
                            ? "ring-2 ring-inset ring-bridge-accent bg-bridge-accent/10"
                            : ""
                        }`}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {visibleRowCount < sheet.rowCount && (
          <div className="flex items-center justify-center py-3 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-bridge-accent mr-2" />
            {visibleRowCount.toLocaleString()} /{" "}
            {sheet.rowCount.toLocaleString()}행 · 스크롤하면 더 불러옵니다
          </div>
        )}
      </div>

      {/* 상태줄 */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-1.5 border-t border-foreground/[0.08] text-xs text-slate-500">
        <span className="tabular-nums">
          {sheet.totalRows.toLocaleString()}행 × {sheet.totalCols}열
          {selected && (
            <span className="ml-2 text-slate-400">
              {columnLabel(sheet.firstCol + selected.c)}
              {sheet.firstRow + selected.r + 1}
            </span>
          )}
        </span>
        <span className="truncate">
          {truncated
            ? `${sheet.rowCount.toLocaleString()}행 × ${sheet.colCount}열까지만 표시합니다. 전체는 다운로드해서 확인하세요.`
            : "더블클릭으로 셀 내용 확대 · 열 머리글 경계를 드래그해 너비 조절"}
        </span>
      </div>

      {/* 셀 내용 확대 패널 */}
      {expanded && (
        <div
          role="dialog"
          aria-label="셀 내용"
          className="absolute left-3 right-3 bottom-10 z-40 max-h-[60%] flex flex-col rounded-2xl border border-foreground/10 bg-bridge-obsidian shadow-2xl overflow-hidden"
        >
          <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
          <div className="flex items-center gap-2 px-4 py-2 border-b border-foreground/[0.08]">
            <span className="text-xs font-bold text-foreground tabular-nums">
              {columnLabel(sheet.firstCol + expanded.c)}
              {sheet.firstRow + expanded.r + 1}
            </span>
            <span className="text-xs text-slate-500">
              {expandedValue.length.toLocaleString()}자
            </span>
            <div className="flex-1" />
            <IconButton
              aria-label="셀 내용 복사"
              onClick={() => void copyText(expandedValue)}
            >
              {copied ? <Check className="text-emerald-500" /> : <Copy />}
            </IconButton>
            <IconButton aria-label="닫기" onClick={() => setExpanded(null)}>
              <X />
            </IconButton>
          </div>
          <div className="px-4 py-3 overflow-auto custom-scrollbar text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {expandedValue}
          </div>
        </div>
      )}
    </div>
  );
}
