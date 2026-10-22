import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MotionModal } from '../ui/MotionModal';
import { IconButton } from '../ui/IconButton';

/**
 * 업스케일 전후 비교 — 같은 화면 크기에 두 장을 겹쳐 놓고 세로 경계선을 끌어
 * 왼쪽은 소스, 오른쪽은 결과를 본다. 소스는 브라우저가 이중선형으로 늘려 보여주므로
 * "소스를 그대로 키웠을 때"와 "업스케일 결과"의 차이가 된다. 차이는 대부분 픽셀
 * 단위에서 드러나서 확대(2×·4×)를 두고, 확대 중에는 스크롤로 이동한다.
 */

const ZOOMS = [1, 2, 4] as const;
type Zoom = (typeof ZOOMS)[number];

interface LdCompareModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  beforeUrl: string;
  afterUrl: string;
  srcW?: number;
  srcH?: number;
  outW?: number;
  outH?: number;
}

export function LdCompareModal({
  open,
  onClose,
  name,
  beforeUrl,
  afterUrl,
  srcW,
  srcH,
  outW,
  outH,
}: LdCompareModalProps) {
  const [pos, setPos] = useState(50);
  const [zoom, setZoom] = useState<Zoom>(1);
  const [fit, setFit] = useState({ w: 0, h: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const aspect = outW && outH ? outW / outH : srcW && srcH ? srcW / srcH : 1;

  // 뷰포트 안에 통째로 들어가는 크기를 1× 로 삼는다
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!open || !vp) return;
    const measure = () => {
      const w = Math.min(vp.clientWidth, vp.clientHeight * aspect);
      setFit({ w, h: w / aspect });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [open, aspect]);

  // 확대 배율을 바꾸면 보던 가운데를 유지한다
  const prevZoom = useRef<Zoom>(1);
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!vp || prevZoom.current === zoom) return;
    const ratio = zoom / prevZoom.current;
    const cx = vp.scrollLeft + vp.clientWidth / 2;
    const cy = vp.scrollTop + vp.clientHeight / 2;
    vp.scrollLeft = cx * ratio - vp.clientWidth / 2;
    vp.scrollTop = cy * ratio - vp.clientHeight / 2;
    prevZoom.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!open) return;
    setPos(50);
    setZoom(1);
    prevZoom.current = 1;
  }, [open, afterUrl]);

  const moveTo = useCallback((clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, p)));
  }, []);

  const stageW = fit.w * zoom;
  const stageH = fit.h * zoom;

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label={`${name} 업스케일 전후 비교`}
      className="sm:max-w-6xl overflow-hidden"
    >
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <h2 className="text-sm font-bold text-foreground truncate max-w-full">{name}</h2>
        <span className="text-xs text-slate-500 tabular-nums">
          {srcW ? `${srcW}×${srcH}` : '—'} → {outW ? `${outW}×${outH}` : '—'}
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-xl bg-foreground/5 p-1">
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                zoom === z
                  ? 'bg-bridge-accent text-white'
                  : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              {z === 1 ? '맞춤' : `${z}×`}
            </button>
          ))}
        </div>
        <IconButton aria-label="닫기" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="relative">
        <div
          ref={viewportRef}
          className="h-[70dvh] overflow-auto custom-scrollbar bg-[repeating-conic-gradient(rgb(148_163_184/0.18)_0_25%,transparent_0_50%)] bg-[length:16px_16px]"
        >
          <div
            className="flex min-w-full min-h-full items-center justify-center"
            style={{ width: stageW || undefined, height: stageH || undefined }}
          >
            <div
              ref={stageRef}
              className="relative shrink-0 select-none touch-none cursor-ew-resize"
              style={{ width: stageW, height: stageH }}
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                moveTo(e.clientX);
              }}
              onPointerMove={(e) => dragging.current && moveTo(e.clientX)}
              onPointerUp={() => {
                dragging.current = false;
              }}
              onPointerCancel={() => {
                dragging.current = false;
              }}
            >
              <img
                src={beforeUrl}
                alt={`${name} 원본`}
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain"
              />
              <img
                src={afterUrl}
                alt={`${name} 업스케일 결과`}
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain"
                style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)] pointer-events-none"
                style={{ left: `${pos}%` }}
              />
              <div
                role="slider"
                tabIndex={0}
                aria-label="비교 경계"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pos)}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 10 : 2;
                  if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - step));
                  else if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + step));
                  else return;
                  e.preventDefault();
                }}
                className="absolute top-1/2 w-9 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white text-slate-700 shadow-lg flex items-center justify-center text-xs font-bold focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                style={{ left: `${pos}%` }}
              >
                ‹›
              </div>
            </div>
          </div>
        </div>
        <span className="pointer-events-none absolute left-3 top-3 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-bold">
          BEFORE
        </span>
        <span className="pointer-events-none absolute right-5 top-3 px-2 py-0.5 rounded-full bg-bridge-accent text-white text-xs font-bold">
          AFTER
        </span>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          끌거나 ←→ 로 경계 이동 · 확대 중엔 스크롤로 이동 · Esc 닫기
        </span>
      </div>
    </MotionModal>
  );
}
