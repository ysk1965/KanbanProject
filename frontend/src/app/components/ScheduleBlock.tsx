import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ScheduleBlockInfo } from '../utils/api';

interface ScheduleBlockProps {
  block: ScheduleBlockInfo;
  slotHeight: number;
  workStartHour: number;
  workEndHour: number;
  otherBlocks?: ScheduleBlockInfo[]; // 같은 컬럼의 다른 블록들
  onClick?: (block: ScheduleBlockInfo) => void;
  onResize?: (blockId: string, startTime: string, endTime: string) => void;
  onMove?: (blockId: string, startTime: string, endTime: string) => void;
}

// 시간 문자열을 분 단위로 변환
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

// 분을 시간 문자열로 변환 (HH:mm)
const minutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

// 두 시간 범위가 겹치는지 체크
const isOverlapping = (start1: number, end1: number, start2: number, end2: number): boolean => {
  return start1 < end2 && end1 > start2;
};

export function ScheduleBlock({ block, slotHeight, workStartHour, workEndHour, otherBlocks = [], onClick, onResize, onMove }: ScheduleBlockProps) {
  const [isResizing, setIsResizing] = useState<'top' | 'bottom' | null>(null);
  const [resizeOffset, setResizeOffset] = useState(0);

  // Long press 드래그 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [hasOverlap, setHasOverlap] = useState(false); // 겹침 여부
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const dragStartY = useRef<number>(0);
  const blockRef = useRef<HTMLDivElement>(null);

  const { top, height, displayInfo, startMinutes, endMinutes, workStartMinutes, workEndMinutes } = useMemo(() => {
    const startMinutes = timeToMinutes(block.start_time);
    const endMinutes = timeToMinutes(block.end_time);
    const workStartMinutes = workStartHour * 60;
    const workEndMinutes = workEndHour * 60;

    const minutesFromStart = startMinutes - workStartMinutes;
    const durationMinutes = endMinutes - startMinutes;

    // 30분 = 1슬롯 = slotHeight px
    const top = (minutesFromStart / 30) * slotHeight;
    const height = (durationMinutes / 30) * slotHeight;

    // 블록 표시 정보
    const title = block.checklist_item?.title || '(미연결)';
    const taskTitle = block.task?.title;
    const featureTitle = block.feature?.title;
    const featureColor = block.feature?.color || '#6366f1';
    const isCompleted = block.checklist_item?.completed || false;

    return {
      top,
      height,
      displayInfo: { title, taskTitle, featureTitle, featureColor, isCompleted },
      startMinutes,
      endMinutes,
      workStartMinutes,
      workEndMinutes,
    };
  }, [block, slotHeight, workStartHour, workEndHour]);

  // 리사이즈 중 계산된 값
  const displayHeight = isResizing === 'top'
    ? height - resizeOffset
    : isResizing === 'bottom'
      ? height + resizeOffset
      : height;

  // 상태별 배경색
  const getBackgroundColor = () => {
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

  // 리사이즈 시작 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent, handle: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault();

    setIsResizing(handle);
    setResizeOffset(0);

    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // 30분 단위로 스냅 (slotHeight px = 30분)
      const snappedDelta = Math.round(deltaY / slotHeight) * slotHeight;
      setResizeOffset(snappedDelta);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // 최종 시간 계산
      setResizeOffset((currentOffset) => {
        if (currentOffset !== 0 && onResize) {
          const deltaMinutes = Math.round(currentOffset / slotHeight) * 30;

          let newStartMinutes = startMinutes;
          let newEndMinutes = endMinutes;

          if (handle === 'top') {
            newStartMinutes = startMinutes + deltaMinutes;
            // 최소 30분 유지, 근무 시작 시간 이후
            newStartMinutes = Math.max(workStartMinutes, newStartMinutes);
            newStartMinutes = Math.min(newEndMinutes - 30, newStartMinutes);
          } else {
            newEndMinutes = endMinutes + deltaMinutes;
            // 최소 30분 유지, 근무 종료 시간 이전
            newEndMinutes = Math.min(workEndMinutes, newEndMinutes);
            newEndMinutes = Math.max(newStartMinutes + 30, newEndMinutes);
          }

          const newStartTime = minutesToTime(newStartMinutes);
          const newEndTime = minutesToTime(newEndMinutes);

          onResize(block.id, newStartTime, newEndTime);
        }
        return 0;
      });
      setIsResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [block.id, slotHeight, startMinutes, endMinutes, workStartMinutes, workEndMinutes, onResize]);

  // 겹침 체크 함수
  const checkOverlap = useCallback((newStartMinutes: number, newEndMinutes: number): boolean => {
    for (const other of otherBlocks) {
      if (other.id === block.id) continue;
      const otherStart = timeToMinutes(other.start_time);
      const otherEnd = timeToMinutes(other.end_time);
      if (isOverlapping(newStartMinutes, newEndMinutes, otherStart, otherEnd)) {
        return true;
      }
    }
    return false;
  }, [otherBlocks, block.id]);

  // Long press 시작 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 리사이즈 핸들 영역이면 무시
    if ((e.target as HTMLElement).dataset.resizeHandle) return;

    dragStartY.current = e.clientY;

    // 0.2초 후 드래그 모드 활성화
    longPressTimer.current = setTimeout(() => {
      setIsDragging(true);
      setDragOffset(0);
      setHasOverlap(false);

      // 드래그 중 마우스 이동 핸들러
      const handleDragMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - dragStartY.current;
        // 30분 단위로 스냅
        const snappedDelta = Math.round(deltaY / slotHeight) * slotHeight;
        setDragOffset(snappedDelta);

        // 겹침 체크
        const deltaMinutes = Math.round(snappedDelta / slotHeight) * 30;
        const duration = endMinutes - startMinutes;
        let newStartMinutes = startMinutes + deltaMinutes;
        let newEndMinutes = endMinutes + deltaMinutes;

        // 근무 시간 범위 내로 제한
        if (newStartMinutes < workStartMinutes) {
          newStartMinutes = workStartMinutes;
          newEndMinutes = workStartMinutes + duration;
        }
        if (newEndMinutes > workEndMinutes) {
          newEndMinutes = workEndMinutes;
          newStartMinutes = workEndMinutes - duration;
        }

        const overlap = checkOverlap(newStartMinutes, newEndMinutes);
        setHasOverlap(overlap);
      };

      // 드래그 종료 핸들러
      const handleDragEnd = () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);

        setDragOffset((currentOffset) => {
          setHasOverlap((currentHasOverlap) => {
            // 겹침이 있으면 이동 취소
            if (currentHasOverlap) {
              setIsDragging(false);
              return false;
            }

            if (currentOffset !== 0 && onMove) {
              const deltaMinutes = Math.round(currentOffset / slotHeight) * 30;
              const duration = endMinutes - startMinutes;

              let newStartMinutes = startMinutes + deltaMinutes;
              let newEndMinutes = endMinutes + deltaMinutes;

              // 근무 시간 범위 내로 제한
              if (newStartMinutes < workStartMinutes) {
                newStartMinutes = workStartMinutes;
                newEndMinutes = workStartMinutes + duration;
              }
              if (newEndMinutes > workEndMinutes) {
                newEndMinutes = workEndMinutes;
                newStartMinutes = workEndMinutes - duration;
              }

              const newStartTime = minutesToTime(newStartMinutes);
              const newEndTime = minutesToTime(newEndMinutes);

              onMove(block.id, newStartTime, newEndTime);
            }
            setIsDragging(false);
            return false;
          });
          return 0;
        });
      };

      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
    }, 150); // 0.2초 long press
  }, [block.id, slotHeight, startMinutes, endMinutes, workStartMinutes, workEndMinutes, onMove, checkOverlap]);

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

  return (
    <div
      ref={blockRef}
      className={`absolute left-1 right-1 rounded-md border-l-4 px-2 py-1 pointer-events-auto
        overflow-hidden ${getBackgroundColor()} ${isResizing || isDragging ? 'z-20' : ''}
        ${isDragging && hasOverlap ? 'cursor-not-allowed shadow-2xl ring-2 ring-red-500 bg-red-500/30' : isDragging ? 'cursor-grabbing shadow-2xl ring-2 ring-white/50' : 'cursor-pointer hover:shadow-lg'}
        ${isDragging ? '' : 'transition-shadow'}`}
      style={{ top: `${displayTop}px`, height: `${Math.max(displayHeight, slotHeight)}px` }}
      onClick={() => !isResizing && !isDragging && onClick?.(block)}
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
        <span className={`text-xs font-medium truncate ${displayInfo.isCompleted ? 'line-through text-slate-400' : 'text-white'}`}>
          {displayInfo.title}
        </span>
        {displayHeight > 30 && displayInfo.taskTitle && (
          <span className="text-[10px] text-slate-400 truncate">
            {displayInfo.taskTitle}
          </span>
        )}
        {displayHeight > 50 && displayInfo.featureTitle && (
          <div className="flex items-center gap-1 mt-auto">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: displayInfo.featureColor }}
            />
            <span className="text-[10px] text-slate-400 truncate">
              {displayInfo.featureTitle}
            </span>
          </div>
        )}
      </div>

      {/* 겹침 시 경고 오버레이 */}
      {isDragging && hasOverlap && (
        <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center rounded-md">
          <span className="text-white text-xs font-bold">이동 불가</span>
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
