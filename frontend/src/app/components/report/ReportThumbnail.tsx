import { useEffect, useRef, useState } from "react";
import { CalendarDays, FileText } from "lucide-react";

import { autoReportAPI, type AutoReport } from "../../utils/api";
import { formatDate } from "../../utils/dateUtils";
import { AutoReportView } from "../AutoReportView";

/**
 * 보고서 갤러리 카드의 썸네일. 발행된 보고서 본문(HTML)을 실제로 렌더해 축소한 진짜 미리보기다.
 *
 * 목록 API는 본문을 주지 않으므로 카드가 뷰포트에 들어올 때만 {@link autoReportAPI.getForMember}로
 * 본문을 받아온다. 24건이 한꺼번에 요청을 쏘지 않도록 모듈 단위 동시성 큐(최대 4건)와 캐시를 둔다.
 * 저장된 본문 조회라 AI를 호출하지 않아 크레딧 소모가 없다.
 */

/** 축소 전 렌더 폭 — 이 폭으로 그린 뒤 카드 폭에 맞춰 scale 한다. */
const RENDER_WIDTH = 760;
const MAX_CONCURRENT = 4;

const reportCache = new Map<string, AutoReport>();
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];

function pumpQueue() {
  while (activeFetches < MAX_CONCURRENT && fetchQueue.length > 0) {
    const job = fetchQueue.shift();
    if (job) job();
  }
}

/** 캐시 + 동시성 제한을 통과하는 본문 fetch. 상세 모달도 같은 캐시를 재사용한다. */
export function fetchReportBody(
  boardId: string,
  reportId: string,
): Promise<AutoReport> {
  const cached = reportCache.get(reportId);
  if (cached) return Promise.resolve(cached);
  return new Promise<AutoReport>((resolve, reject) => {
    fetchQueue.push(() => {
      activeFetches += 1;
      autoReportAPI
        .getForMember(boardId, reportId)
        .then((report) => {
          reportCache.set(reportId, report);
          resolve(report);
        })
        .catch(reject)
        .finally(() => {
          activeFetches -= 1;
          pumpQueue();
        });
    });
    pumpQueue();
  });
}

interface ReportThumbnailProps {
  boardId: string;
  report: AutoReport;
}

export function ReportThumbnail({ boardId, report }: ReportThumbnailProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);
  const [visible, setVisible] = useState(false);
  const [full, setFull] = useState<AutoReport | null>(
    () => reportCache.get(report.id) ?? null,
  );
  const [failed, setFailed] = useState(false);

  const isWeekly = report.report_type === "WEEKLY_INTEGRATED";

  // 카드 폭 → 축소 배율. 반응형 그리드라 폭이 변하므로 ResizeObserver로 따라간다.
  useEffect(() => {
    const el = clipRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / RENDER_WIDTH);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 뷰포트 진입 시에만 본문을 불러온다(지연 로딩).
  useEffect(() => {
    if (visible) return;
    const el = clipRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || full || failed) return;
    let alive = true;
    fetchReportBody(boardId, report.id)
      .then((r) => alive && setFull(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [visible, full, failed, boardId, report.id]);

  return (
    <div
      ref={clipRef}
      className="relative w-full h-[150px] overflow-hidden bg-bridge-surface border-b border-foreground/[0.08]"
    >
      {/* 타입 색 상단 스트립 */}
      <div
        className={`absolute inset-x-0 top-0 h-[3px] z-10 ${
          isWeekly ? "bg-bridge-secondary" : "bg-bridge-accent"
        }`}
      />

      {full ? (
        <div
          style={{
            width: RENDER_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="pointer-events-none select-none bg-bridge-dark"
          aria-hidden
        >
          <AutoReportView
            report={full}
            className="max-w-none w-full px-6 py-6 flex flex-col gap-5"
          />
        </div>
      ) : failed ? (
        <FallbackCover report={report} isWeekly={isWeekly} />
      ) : (
        <ThumbnailSkeleton />
      )}

      {/* 아래쪽 페이드 — 잘린 본문을 자연스럽게 흐린다 */}
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-bridge-surface to-transparent pointer-events-none" />

      {/* HTML 뱃지 */}
      <span className="absolute top-2 right-2 z-10 font-mono text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-md text-white bg-black/40 backdrop-blur-sm">
        HTML
      </span>
    </div>
  );
}

/** 본문 조회 실패 시 최소한의 정보를 보여주는 커버. */
function FallbackCover({
  report,
  isWeekly,
}: {
  report: AutoReport;
  isWeekly: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 h-full px-4 py-5">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {isWeekly ? "주간 보고서" : "일일 개발 보고서"}
      </span>
      <FileText className="w-6 h-6 text-slate-500" />
      <span className="mt-auto flex items-center gap-1.5 text-xs text-slate-500">
        <CalendarDays className="w-3.5 h-3.5" />
        {formatDate(report.period_start)} ~ {formatDate(report.period_end)}
      </span>
    </div>
  );
}

/** 로딩 스켈레톤 — 렌더된 페이지의 얼개를 흉내 낸다. */
function ThumbnailSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 h-full px-4 py-4 animate-pulse">
      <div className="h-2.5 w-1/2 rounded bg-foreground/10" />
      <div className="h-1.5 w-4/5 rounded bg-foreground/[0.06]" />
      <div className="h-1.5 w-3/5 rounded bg-foreground/[0.06]" />
      <div className="flex gap-2 my-1">
        <div className="flex-1 h-8 rounded-md bg-foreground/[0.05]" />
        <div className="flex-1 h-8 rounded-md bg-foreground/[0.05]" />
        <div className="flex-1 h-8 rounded-md bg-foreground/[0.05]" />
      </div>
      <div className="h-1.5 w-3/4 rounded bg-foreground/[0.06]" />
    </div>
  );
}
