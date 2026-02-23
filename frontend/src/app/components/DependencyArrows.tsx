import { useState, useMemo } from 'react';
import { TaskDependency } from '../types';

export interface TaskPosition {
  taskId: string;
  left: number;    // px from timeline start
  width: number;   // px width of task bar
  top: number;     // px from timeline top (row position)
  height: number;  // px height of task bar (usually 24px = h-6)
}

interface DependencyArrowsProps {
  dependencies: TaskDependency[];
  taskPositions: Map<string, TaskPosition>;
  onDeleteDependency?: (dependencyId: string) => void;
  containerWidth: number;
  containerHeight: number;
  previewLine?: {
    fromTaskId: string;
    cursorX: number;
    cursorY: number;
  } | null;
}

/**
 * FS(Finish-to-Start) 화살표 경로를 계산합니다.
 * predecessor의 오른쪽 끝 → successor의 왼쪽 끝
 */
const calculateArrowPath = (
  from: TaskPosition,
  to: TaskPosition
): string => {
  // 시작점: predecessor 오른쪽 끝 중간
  const startX = from.left + from.width;
  const startY = from.top + from.height / 2;

  // 끝점: successor 왼쪽 끝 중간
  const endX = to.left;
  const endY = to.top + to.height / 2;

  // 수평 거리에 따라 곡률 조절
  const dx = endX - startX;

  if (dx > 20) {
    // 일반 케이스: predecessor가 successor 왼쪽에 있음
    const midX = startX + dx / 2;
    return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
  } else {
    // 역방향 또는 겹침: 바 사이 갭으로 우회하는 둥근 경로
    const gap = 30; // 좌우 여유
    const rightX = startX + gap;
    const leftX = endX - gap;

    const fromBottom = from.top + from.height;
    const toBottom = to.top + to.height;

    // 라우팅 Y: 두 바 사이 갭의 중앙으로 통과
    let routeY: number;
    if (endY >= startY) {
      // successor가 아래: from 바 하단과 to 바 상단 사이 갭
      if (fromBottom + 4 < to.top) {
        routeY = (fromBottom + to.top) / 2;
      } else {
        // 바가 겹침 → 둘 다 아래로 우회
        routeY = Math.max(fromBottom, toBottom) + 20;
      }
    } else {
      // successor가 위: to 바 하단과 from 바 상단 사이 갭
      if (toBottom + 4 < from.top) {
        routeY = (toBottom + from.top) / 2;
      } else {
        // 바가 겹침 → 둘 다 위로 우회
        routeY = Math.min(from.top, to.top) - 20;
      }
    }

    // 코너 반경: 사용 가능한 공간에 맞게 제한
    const r = Math.max(4, Math.min(14,
      Math.abs(routeY - startY) * 0.45,
      Math.abs(endY - routeY) * 0.45
    ));

    // 수직 방향 부호
    const dy1 = routeY > startY ? 1 : -1; // start → route
    const dy2 = endY > routeY ? 1 : -1;   // route → end

    return [
      `M ${startX} ${startY}`,
      `L ${rightX - r} ${startY}`,
      `Q ${rightX} ${startY}, ${rightX} ${startY + r * dy1}`,
      `L ${rightX} ${routeY - r * dy1}`,
      `Q ${rightX} ${routeY}, ${rightX - r} ${routeY}`,
      `L ${leftX + r} ${routeY}`,
      `Q ${leftX} ${routeY}, ${leftX} ${routeY + r * dy2}`,
      `L ${leftX} ${endY - r * dy2}`,
      `Q ${leftX} ${endY}, ${leftX + r} ${endY}`,
      `L ${endX} ${endY}`,
    ].join(' ');
  }
};

/**
 * 화살표 경로의 중간점을 계산합니다 (삭제 버튼 위치용).
 */
const calculateMidPoint = (
  from: TaskPosition,
  to: TaskPosition
): { x: number; y: number } => {
  const startX = from.left + from.width;
  const startY = from.top + from.height / 2;
  const endX = to.left;
  const endY = to.top + to.height / 2;

  const dx = endX - startX;

  if (dx > 20) {
    // 베지어 곡선 중간점 (t=0.5 근사)
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    return { x: midX, y: midY };
  } else {
    // 우회 경로의 중간점: 수평 구간 중앙
    const fromBottom = from.top + from.height;
    const toBottom = to.top + to.height;

    let routeY: number;
    if (endY >= startY) {
      if (fromBottom + 4 < to.top) {
        routeY = (fromBottom + to.top) / 2;
      } else {
        routeY = Math.max(fromBottom, toBottom) + 20;
      }
    } else {
      if (toBottom + 4 < from.top) {
        routeY = (toBottom + from.top) / 2;
      } else {
        routeY = Math.min(from.top, to.top) - 20;
      }
    }

    const midX = (startX + endX) / 2;
    return { x: midX, y: routeY };
  }
};

export function DependencyArrows({
  dependencies,
  taskPositions,
  onDeleteDependency,
  containerWidth,
  containerHeight,
  previewLine,
}: DependencyArrowsProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // 유효한 의존성만 필터링 (양쪽 태스크 위치가 모두 존재하는 것)
  const validDependencies = useMemo(() => {
    return dependencies.filter(
      (dep) => taskPositions.has(dep.predecessor_id) && taskPositions.has(dep.successor_id)
    );
  }, [dependencies, taskPositions]);

  if (validDependencies.length === 0 && !previewLine) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {/* 화살표 마커 정의 */}
      <defs>
        <marker
          id="dependency-arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon
            points="0 0, 8 3, 0 6"
            fill="rgba(99, 102, 241, 0.7)"
          />
        </marker>
        <marker
          id="dependency-arrowhead-hover"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon
            points="0 0, 8 3, 0 6"
            fill="rgba(99, 102, 241, 1.0)"
          />
        </marker>
      </defs>

      {/* 드래그 프리뷰 라인 */}
      {previewLine && taskPositions.has(previewLine.fromTaskId) && (() => {
        const from = taskPositions.get(previewLine.fromTaskId)!;
        const startX = from.left + from.width;
        const startY = from.top + from.height / 2;
        const endX = previewLine.cursorX;
        const endY = previewLine.cursorY;
        const dx = endX - startX;
        const midX = startX + dx / 2;
        const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;

        return (
          <path
            d={path}
            fill="none"
            stroke="rgba(99, 102, 241, 0.5)"
            strokeWidth={2}
            strokeDasharray="6 4"
            className="pointer-events-none"
          />
        );
      })()}

      {/* 각 의존성 화살표 */}
      {validDependencies.map((dep) => {
        const from = taskPositions.get(dep.predecessor_id)!;
        const to = taskPositions.get(dep.successor_id)!;
        const path = calculateArrowPath(from, to);
        const isHovered = hoveredId === dep.id;
        const midPoint = isHovered ? calculateMidPoint(from, to) : null;

        return (
          <g key={dep.id}>
            {/* 클릭 가능한 넓은 히트 영역 */}
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              className="pointer-events-auto cursor-pointer"
              onMouseEnter={() => setHoveredId(dep.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onDeleteDependency?.(dep.id)}
            />
            {/* 실제 보이는 화살표 */}
            <path
              d={path}
              fill="none"
              stroke={isHovered ? 'rgba(99, 102, 241, 1.0)' : 'rgba(99, 102, 241, 0.6)'}
              strokeWidth={isHovered ? 2.5 : 2}
              markerEnd={isHovered ? 'url(#dependency-arrowhead-hover)' : 'url(#dependency-arrowhead)'}
              className="pointer-events-none transition-colors"
            />
            {/* 호버 시 삭제 버튼 */}
            {isHovered && midPoint && onDeleteDependency && (
              <foreignObject
                x={midPoint.x - 10}
                y={midPoint.y - 10}
                width={20}
                height={20}
                className="pointer-events-auto"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteDependency(dep.id);
                  }}
                  onMouseEnter={() => setHoveredId(dep.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600 transition-colors"
                >
                  &#215;
                </button>
              </foreignObject>
            )}
          </g>
        );
      })}
    </svg>
  );
}
