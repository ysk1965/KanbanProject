import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScheduleBlockInfo } from '../utils/api';

interface ScheduleBlockProps {
  block: ScheduleBlockInfo;
  slotHeight: number;
  workStartHour: number;
  workEndHour: number;
  otherBlocks?: ScheduleBlockInfo[]; // 같은 컬럼의 다른 블록들
  breakStartTime?: string | null;
  breakEndTime?: string | null;
  minutesToPx?: (minutes: number) => number;
  pxToMinutes?: (px: number) => number;
  onClick?: (block: ScheduleBlockInfo) => void;
  onResize?: (blockId: string, startTime: string, endTime: string) => void;
  onMove?: (blockId: string, startTime: string, endTime: string) => void;
  onSplitResize?: (blockId: string, segments: Array<{ startTime: string; endTime: string }>) => void;
  isOrgOverlay?: boolean;
}

// 시간 문자열을 분 단위로 변환
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

// 분을 시간 문자열로 변환 (HH:mm:ss) - 백엔드 LocalTime 형식과 일치
const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
};

// 두 시간 범위가 겹치는지 체크 (overnight-safe: end < start → 자정 넘김)
const isOverlapping = (start1: number, end1: number, start2: number, end2: number): boolean => {
  // overnight인 경우 end를 24h+ 로 확장해서 비교
  const e1 = end1 <= start1 ? end1 + 24 * 60 : end1;
  const e2 = end2 <= start2 ? end2 + 24 * 60 : end2;
  return start1 < e2 && e1 > start2;
};

// 스냅 단위 (분) - 리사이즈/드래그 시 이 단위로 정렬
const SNAP_MINUTES = 10;

const MIN_BLOCK_VIS = 28; // 블록 최소 가시 높이 (px)

export function ScheduleBlock({ block, slotHeight, workStartHour, workEndHour, otherBlocks = [], breakStartTime, breakEndTime, minutesToPx: minutesToPxProp, pxToMinutes: pxToMinutesProp, onClick, onResize, onMove, onSplitResize, isOrgOverlay }: ScheduleBlockProps) {
  // 가변 슬롯 높이 지원: prop이 있으면 사용, 없으면 선형 매핑 fallback
  const mToPx = minutesToPxProp || ((minutes: number) => ((minutes - workStartHour * 60) / 30) * slotHeight);
  const pxToM = pxToMinutesProp || ((px: number) => workStartHour * 60 + (px / slotHeight) * 30);
  const { t } = useTranslation();
  const [isResizing, setIsResizing] = useState<'top' | 'bottom' | null>(null);
  const [resizeOffset, setResizeOffset] = useState(0);

  // Long press 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  // 겹침 타입: 'none' | 'block' (다른 블록과 겹침) | 'split' (점심시간만 겹침, 분할 가능)
  const [overlapType, setOverlapType] = useState<'none' | 'block' | 'split'>('none');
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const dragStartY = useRef<number>(0);
  const blockRef = useRef<HTMLDivElement>(null);

  // 드래그/리사이즈 후 click 이벤트 방지용 ref (React state보다 먼저 동기적으로 체크)
  const wasDraggedOrResizedRef = useRef(false);

  // Ref로 최신 offset/overlap 값 추적 (state updater 내 사이드이펙트 방지)
  const resizeOffsetRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const overlapTypeRef = useRef<'none' | 'block' | 'split'>('none');

  // 최신 콜백 참조
  const onResizeRef = useRef(onResize);
  const onMoveRef = useRef(onMove);
  const onSplitResizeRef = useRef(onSplitResize);
  useEffect(() => { onResizeRef.current = onResize; }, [onResize]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);
  useEffect(() => { onSplitResizeRef.current = onSplitResize; }, [onSplitResize]);

  const { top, height, displayInfo, startMinutes, endMinutes, workStartMinutes, workEndMinutes, isOvernight } = useMemo(() => {
    const startMinutes = timeToMinutes(block.start_time);
    let endMinutes = timeToMinutes(block.end_time);
    const workStartMinutes = workStartHour * 60;
    const workEndMinutes = workEndHour * 60;

    // Overnight: endTime < startTime → cap to work end
    const isOvernight = endMinutes < startMinutes;
    if (isOvernight) {
      endMinutes = workEndMinutes;
    }

    // 가변 슬롯 높이 반영된 위치 계산
    const top = mToPx(startMinutes);
    const height = mToPx(endMinutes) - top;

    // 블록 표시 정보
    const isCustom = block.block_type === 'CUSTOM';
    const hasMeeting = !!block.meeting;
    const title = isCustom
      ? (block.title || t('scheduleBlock.custom'))
      : hasMeeting
        ? block.meeting!.title
        : (block.checklist_item?.title || t('scheduleBlock.unlinked'));
    const taskTitle = isCustom ? null : block.task?.title;
    const featureTitle = isCustom ? null : block.feature?.title;
    const featureColor = isCustom ? (block.color || '#F59E0B') : hasMeeting ? block.meeting!.color : (block.feature?.color || '#6366f1');
    const isCompleted = isCustom ? false : (block.checklist_item?.completed || false);

    return {
      top,
      height,
      displayInfo: { title, taskTitle, featureTitle, featureColor, isCompleted, hasMeeting, isCustom },
      startMinutes,
      endMinutes,
      workStartMinutes,
      workEndMinutes,
      isOvernight,
    };
  }, [block, slotHeight, workStartHour, workEndHour, mToPx]);

  // 리사이즈 중 계산된 값
  const displayHeight = isResizing === 'top'
    ? height - resizeOffset
    : isResizing === 'bottom'
      ? height + resizeOffset
      : height;

  // 상태별 배경색 (className)
  const getBackgroundColor = () => {
    // 커스텀 블록은 inline style로 처리 (동적 색상)
    if (displayInfo.isCustom) {
      return '';
    }
    // 회의 블록은 inline style로 처리
    if (displayInfo.hasMeeting && block.meeting?.color) {
      return '';
    }
    if (displayInfo.isCompleted) {
      return 'bg-green-500/20 border-green-500';
    }
    if (block.checklist_item?.due_date) {
      const dueDate = new Date(block.checklist_item.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dueDate < today) {
        return 'bg-red-500/20 border-red-500';
      }

      const threeDaysLater = new Date(today);
      threeDaysLater.setDate(today.getDate() + 3);
      if (dueDate <= threeDaysLater) {
        return 'bg-yellow-500/20 border-yellow-500';
      }
    }
    return 'bg-blue-500/20 border-blue-500';
  };

  // 회의/커스텀 블록의 인라인 스타일
  const getInlineStyle = (): Record<string, string> => {
    if (displayInfo.hasMeeting && block.meeting?.color) {
      const color = block.meeting.color;
      return {
        backgroundColor: `${color}33`, // ~20% opacity
        borderLeftColor: color,
      };
    }
    if (displayInfo.isCustom) {
      const color = block.color || '#F59E0B';
      return {
        backgroundColor: `${color}33`,
        borderLeftColor: color,
      };
    }
    return {};
  };

  // 점심시간 분 단위 계산
  const breakStartMin = breakStartTime ? timeToMinutes(breakStartTime) : null;
  const breakEndMin = breakEndTime ? timeToMinutes(breakEndTime) : null;

  // 분할 세그먼트 계산 (점심시간을 피해 분할)
  const calculateSplitSegments = useCallback((startMin: number, endMin: number): Array<{ startTime: string; endTime: string }> => {
    if (breakStartMin === null || breakEndMin === null) return [];
    const segments: Array<{ startTime: string; endTime: string }> = [];
    if (startMin < breakStartMin) {
      segments.push({ startTime: minutesToTime(startMin), endTime: minutesToTime(Math.min(endMin, breakStartMin)) });
    }
    if (endMin > breakEndMin) {
      segments.push({ startTime: minutesToTime(Math.max(startMin, breakEndMin)), endTime: minutesToTime(endMin) });
    }
    return segments;
  }, [breakStartMin, breakEndMin]);

  // 겹침 체크 함수: 'none' | 'block' (다른 블록) | 'split' (점심만, 분할 가능)
  const checkOverlap = useCallback((newStartMinutes: number, newEndMinutes: number): 'none' | 'block' | 'split' => {
    // 다른 블록과 겹치는지 체크
    for (const other of otherBlocks) {
      if (other.id === block.id) continue;
      const otherStart = timeToMinutes(other.start_time);
      const otherEnd = timeToMinutes(other.end_time);
      if (isOverlapping(newStartMinutes, newEndMinutes, otherStart, otherEnd)) {
        return 'block';
      }
    }
    // 점심시간과 겹치는지 체크
    if (breakStartMin !== null && breakEndMin !== null) {
      if (isOverlapping(newStartMinutes, newEndMinutes, breakStartMin, breakEndMin)) {
        // 분할 후 세그먼트가 다른 블록과 겹치지 않는지 확인
        const segments = calculateSplitSegments(newStartMinutes, newEndMinutes);
        if (segments.length === 0) return 'block'; // 분할 결과 없음 (전체가 점심시간 내)
        for (const seg of segments) {
          const segStart = timeToMinutes(seg.startTime);
          const segEnd = timeToMinutes(seg.endTime);
          if (segEnd - segStart < SNAP_MINUTES) return 'block'; // 최소 SNAP_MINUTES 미만이면 불가
          for (const other of otherBlocks) {
            if (other.id === block.id) continue;
            const otherStart = timeToMinutes(other.start_time);
            const otherEnd = timeToMinutes(other.end_time);
            if (isOverlapping(segStart, segEnd, otherStart, otherEnd)) {
              return 'block';
            }
          }
        }
        return 'split';
      }
    }
    return 'none';
  }, [otherBlocks, block.id, breakStartMin, breakEndMin, calculateSplitSegments]);

  // 리사이즈 시작 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent, handle: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault();

    wasDraggedOrResizedRef.current = true;
    setIsResizing(handle);
    setResizeOffset(0);
    resizeOffsetRef.current = 0;
    document.body.style.userSelect = 'none';

    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      let snappedDelta: number;
      let newStartMin = startMinutes;
      let newEndMin = endMinutes;

      if (handle === 'top') {
        const newTopPx = top + deltaY;
        const rawMin = pxToM(newTopPx);
        let snappedMin = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
        snappedMin = Math.max(workStartMinutes, Math.min(endMinutes - SNAP_MINUTES, snappedMin));
        snappedDelta = mToPx(snappedMin) - top;
        newStartMin = snappedMin;
      } else {
        const newBottomPx = top + height + deltaY;
        const rawMin = pxToM(newBottomPx);
        let snappedMin = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
        snappedMin = Math.min(workEndMinutes, Math.max(startMinutes + SNAP_MINUTES, snappedMin));
        snappedDelta = mToPx(snappedMin) - (top + height);
        newEndMin = snappedMin;
      }

      setResizeOffset(snappedDelta);
      resizeOffsetRef.current = snappedDelta;

      const overlap = checkOverlap(newStartMin, newEndMin);
      setOverlapType(overlap);
      overlapTypeRef.current = overlap;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';

      const finalOffset = resizeOffsetRef.current;
      const finalOverlapType = overlapTypeRef.current;

      // 시각 상태 리셋
      setResizeOffset(0);
      resizeOffsetRef.current = 0;
      setIsResizing(null);
      setOverlapType('none');
      overlapTypeRef.current = 'none';

      // 다른 블록과 겹침이면 리사이즈 취소
      if (finalOverlapType === 'block') return;

      if (finalOffset !== 0) {
        let newStartMinutes = startMinutes;
        let newEndMinutes = endMinutes;

        if (handle === 'top') {
          const newTopPx = top + finalOffset;
          const rawMin = pxToM(newTopPx);
          newStartMinutes = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
          newStartMinutes = Math.max(workStartMinutes, Math.min(newEndMinutes - SNAP_MINUTES, newStartMinutes));
        } else {
          const newBottomPx = top + height + finalOffset;
          const rawMin = pxToM(newBottomPx);
          newEndMinutes = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
          newEndMinutes = Math.min(workEndMinutes, Math.max(newStartMinutes + SNAP_MINUTES, newEndMinutes));
        }

        if (finalOverlapType === 'split' && onSplitResizeRef.current) {
          const segments = calculateSplitSegments(newStartMinutes, newEndMinutes);
          if (segments.length > 0) {
            onSplitResizeRef.current(block.id, segments);
          }
        } else if (onResizeRef.current) {
          const newStartTime = minutesToTime(newStartMinutes);
          const newEndTime = minutesToTime(newEndMinutes);
          onResizeRef.current(block.id, newStartTime, newEndTime);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [block.id, slotHeight, startMinutes, endMinutes, workStartMinutes, workEndMinutes, checkOverlap, calculateSplitSegments, top, height, mToPx, pxToM]);

  // Long press 시작 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 리사이즈 핸들 영역이면 무시
    if ((e.target as HTMLElement).dataset.resizeHandle) return;

    e.preventDefault();

    dragStartY.current = e.clientY;

    // 0.15초 후 드래그 모드 활성화
    longPressTimer.current = setTimeout(() => {
      wasDraggedOrResizedRef.current = true;
      setIsDragging(true);
      setDragOffset(0);
      setOverlapType('none');
      dragOffsetRef.current = 0;
      overlapTypeRef.current = 'none';
      document.body.style.userSelect = 'none';

      // 드래그 중 마우스 이동 핸들러
      const handleDragMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - dragStartY.current;
        const newTopPx = top + deltaY;
        const rawMin = pxToM(newTopPx);
        const duration = endMinutes - startMinutes;
        let snappedStartMin = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
        let newEndMin = snappedStartMin + duration;

        if (snappedStartMin < workStartMinutes) {
          snappedStartMin = workStartMinutes;
          newEndMin = workStartMinutes + duration;
        }
        if (newEndMin > workEndMinutes) {
          newEndMin = workEndMinutes;
          snappedStartMin = workEndMinutes - duration;
        }

        const snappedTopPx = mToPx(snappedStartMin);
        setDragOffset(snappedTopPx - top);
        dragOffsetRef.current = snappedTopPx - top;

        const overlap = checkOverlap(snappedStartMin, newEndMin);
        setOverlapType(overlap);
        overlapTypeRef.current = overlap;
      };

      // 드래그 종료 핸들러
      const handleDragEnd = () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.body.style.userSelect = '';

        const finalOffset = dragOffsetRef.current;
        const finalOverlapType = overlapTypeRef.current;

        // 시각 상태 리셋
        setDragOffset(0);
        setOverlapType('none');
        setIsDragging(false);
        dragOffsetRef.current = 0;
        overlapTypeRef.current = 'none';

        // 다른 블록과 겹침이면 이동 취소
        if (finalOverlapType === 'block') return;

        if (finalOffset !== 0) {
          const newTopPx = top + finalOffset;
          const rawMin = pxToM(newTopPx);
          const duration = endMinutes - startMinutes;
          let newStartMinutes = Math.round(rawMin / SNAP_MINUTES) * SNAP_MINUTES;
          let newEndMinutes = newStartMinutes + duration;

          if (newStartMinutes < workStartMinutes) {
            newStartMinutes = workStartMinutes;
            newEndMinutes = workStartMinutes + duration;
          }
          if (newEndMinutes > workEndMinutes) {
            newEndMinutes = workEndMinutes;
            newStartMinutes = workEndMinutes - duration;
          }

          if (finalOverlapType === 'split' && onSplitResizeRef.current) {
            const segments = calculateSplitSegments(newStartMinutes, newEndMinutes);
            if (segments.length > 0) {
              onSplitResizeRef.current(block.id, segments);
            }
          } else if (onMoveRef.current) {
            const newStartTime = minutesToTime(newStartMinutes);
            const newEndTime = minutesToTime(newEndMinutes);
            onMoveRef.current(block.id, newStartTime, newEndTime);
          }
        }
      };

      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
    }, 150); // 0.15초 long press
  }, [block.id, slotHeight, startMinutes, endMinutes, workStartMinutes, workEndMinutes, checkOverlap, calculateSplitSegments, top, mToPx, pxToM]);

  // 마우스 업 시 long press 타이머 취소
  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // 마우스 나가면 타이머 취소
  const handleMouseLeave = useCallback(() => {
    if (longPressTimer.current && !isDragging) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, [isDragging]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  // 드래그 중 위치 계산
  const displayTop = isDragging
    ? top + dragOffset
    : isResizing === 'top'
      ? top + resizeOffset
      : top;

  // Org overlay: read-only, dashed border, reduced opacity, no interactions
  if (isOrgOverlay) {
    return (
      <div
        className={`absolute left-1 right-1 rounded-md border-l-4 border-dashed px-2 py-1
          overflow-hidden opacity-60 pointer-events-none cursor-default ${getBackgroundColor()}`}
        style={{ top: `${displayTop}px`, height: `${Math.max(displayHeight, MIN_BLOCK_VIS)}px`, ...getInlineStyle() }}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {block.board_name && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent truncate max-w-[80%] self-start mb-0.5">
              {t('scheduleBlock.orgScheduleLabel', { boardName: block.board_name })}
            </span>
          )}
          <span className={`text-xs font-medium truncate ${displayInfo.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {displayInfo.title}
            {isOvernight && <span className="text-bridge-accent ml-1 text-[10px]">({t('scheduleBlock.nextDay')})</span>}
          </span>
          {displayHeight > 30 && displayInfo.taskTitle && (
            <span className="text-[10px] text-muted-foreground truncate">
              {displayInfo.taskTitle}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={blockRef}
      className={`absolute left-1 right-1 rounded-md border-l-4 px-2 py-1 pointer-events-auto
        overflow-hidden ${getBackgroundColor()} ${isResizing || isDragging ? 'z-20' : ''}
        ${(isDragging || isResizing) && overlapType === 'block' ? 'cursor-not-allowed shadow-2xl ring-2 ring-red-500 bg-red-500/30' : (isDragging || isResizing) && overlapType === 'split' ? 'cursor-grab shadow-2xl ring-2 ring-amber-400 bg-amber-500/20' : isDragging ? 'cursor-grabbing shadow-2xl ring-2 ring-white/50' : isResizing ? 'cursor-ns-resize shadow-lg' : 'cursor-pointer hover:shadow-lg'}
        ${isDragging || isResizing ? '' : 'transition-shadow'}`}
      style={{ top: `${displayTop}px`, height: `${Math.max(displayHeight, MIN_BLOCK_VIS)}px`, ...getInlineStyle() }}
      onClick={() => {
        if (isResizing || isDragging || wasDraggedOrResizedRef.current) {
          wasDraggedOrResizedRef.current = false;
          return;
        }
        onClick?.(block);
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* 상단 리사이즈 핸들 */}
      <div
        data-resize-handle="true"
        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-white/20 transition-colors"
        onMouseDown={(e) => handleResizeStart(e, 'top')}
      />

      <div className="flex flex-col h-full overflow-hidden">
        <span className={`text-xs font-medium truncate ${displayInfo.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {displayInfo.title}
          {isOvernight && <span className="text-bridge-accent ml-1 text-[10px]">({t('scheduleBlock.nextDay')})</span>}
        </span>
        {displayHeight > 30 && displayInfo.taskTitle && (
          <span className="text-[10px] text-muted-foreground truncate">
            {displayInfo.taskTitle}
          </span>
        )}
        {displayHeight > 50 && displayInfo.featureTitle && (
          <div className="flex items-center gap-1 mt-auto">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: displayInfo.featureColor }}
            />
            <span className="text-[10px] text-muted-foreground truncate">
              {displayInfo.featureTitle}
            </span>
          </div>
        )}
      </div>

      {/* 겹침 시 경고 오버레이 */}
      {(isDragging || isResizing) && overlapType === 'block' && (
        <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center rounded-md">
          <span className="text-white text-xs font-bold">{isDragging ? t('scheduleBlock.cannotMove') : t('scheduleBlock.cannotChange')}</span>
        </div>
      )}
      {/* 점심시간 분할 예정 오버레이 */}
      {(isDragging || isResizing) && overlapType === 'split' && (
        <div className="absolute inset-0 bg-amber-500/40 flex items-center justify-center rounded-md">
          <span className="text-white text-xs font-bold">{t('scheduleBlock.willSplit')}</span>
        </div>
      )}

      {/* 하단 리사이즈 핸들 */}
      <div
        data-resize-handle="true"
        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-white/20 transition-colors"
        onMouseDown={(e) => handleResizeStart(e, 'bottom')}
      />
    </div>
  );
}
