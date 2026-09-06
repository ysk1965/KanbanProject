import React, { useCallback, useEffect, useRef, useState } from "react";

const MIN_ZOOM = 1;
const DEFAULT_MAX_ZOOM = 5;

interface ZoomableImageProps {
  src: string;
  alt?: string;
  /** img 요소에 적용할 클래스 (크기 제한 등) */
  className?: string;
  maxZoom?: number;
  /** 1배(줌 안 된) 상태에서 이미지를 클릭했을 때 (라이트박스 닫기 등) */
  onTap?: () => void;
}

/**
 * 휠·더블클릭·핀치 줌 + 드래그 팬을 지원하는 이미지 뷰어.
 * 라이트박스/미리보기 등 "이미지 크게 보기" 자리에 공용으로 사용한다.
 * (브라우저 페이지 줌은 fixed 레이아웃을 깨뜨리므로 뷰어 자체 줌으로 대체)
 */
export function ZoomableImage({
  src,
  alt,
  className,
  maxZoom = DEFAULT_MAX_ZOOM,
  onTap,
}: ZoomableImageProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const hasPannedRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastPinchDistRef = useRef<number | null>(null);
  const wasPinchingRef = useRef(false);
  const isZoomed = zoom > 1;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [src]);

  const clampPan = useCallback((x: number, y: number, z: number) => {
    if (z <= 1) return { x: 0, y: 0 };
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x, y };
    const maxX = (rect.width * (z - 1)) / 2;
    const maxY = (rect.height * (z - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const applyZoom = useCallback((updater: (z: number) => number) => {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, Math.min(maxZoom, updater(z)));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxZoom]);

  // 휠 줌 — React 합성 wheel 은 passive 라 preventDefault 를 위해 네이티브로 부착
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      applyZoom((z) => z + (e.deltaY > 0 ? -0.4 : 0.4));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!isZoomed) return;
    e.preventDefault();
    isPanningRef.current = true;
    hasPannedRef.current = false;
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  useEffect(() => {
    if (!isZoomed) return;
    const onMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      hasPannedRef.current = true;
      setPan(
        clampPan(
          panStartRef.current.panX + (e.clientX - panStartRef.current.x),
          panStartRef.current.panY + (e.clientY - panStartRef.current.y),
          zoom,
        ),
      );
    };
    const onUp = () => {
      isPanningRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isZoomed, zoom, clampPan]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      wasPinchingRef.current = true;
      lastPinchDistRef.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      return;
    }
    if (e.touches.length === 1 && isZoomed) {
      isPanningRef.current = true;
      hasPannedRef.current = false;
      panStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (lastPinchDistRef.current !== null) {
        const scale = dist / lastPinchDistRef.current;
        applyZoom((z) => z * scale);
      }
      lastPinchDistRef.current = dist;
      return;
    }
    if (e.touches.length === 1 && isPanningRef.current && isZoomed) {
      hasPannedRef.current = true;
      setPan(
        clampPan(
          panStartRef.current.panX +
            (e.touches[0].clientX - panStartRef.current.x),
          panStartRef.current.panY +
            (e.touches[0].clientY - panStartRef.current.y),
          zoom,
        ),
      );
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) lastPinchDistRef.current = null;
    if (wasPinchingRef.current) {
      if (e.touches.length === 0) wasPinchingRef.current = false;
      return;
    }
    isPanningRef.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasPannedRef.current) {
      hasPannedRef.current = false;
      return;
    }
    if (!isZoomed && onTap) onTap();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    applyZoom((z) => (z > 1 ? 1 : 2.5));
  };

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center overflow-hidden touch-none max-w-full max-h-full"
      style={{
        cursor: isZoomed
          ? isPanningRef.current
            ? "grabbing"
            : "grab"
          : "zoom-in",
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <img
        src={src}
        alt={alt || "image"}
        className={className}
        draggable={false}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transition: isPanningRef.current ? "none" : "transform 0.15s ease",
          willChange: "transform",
        }}
      />
      {isZoomed && (
        <span className="absolute bottom-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-full bg-black/60 text-white pointer-events-none">
          {Math.round(zoom * 100)}%
        </span>
      )}
    </div>
  );
}
