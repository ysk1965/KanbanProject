import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight as ChevronRightIcon, FileText, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { DateRange } from 'react-day-picker';
import {
  format,
  addDays,
  subDays,
  eachDayOfInterval,
  eachWeekOfInterval,
  isToday,
  isSameDay,
  differenceInDays,
  differenceInWeeks,
  isBefore,
  isAfter,
  getDay,
  startOfWeek,
  endOfWeek,
  isWithinInterval,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { formatDate } from '../utils/dateUtils';
import { Feature, Task, Milestone } from '../types';

type ScheduleViewMode = 'day' | 'week';

interface WeeklyScheduleViewProps {
  boardId: string;
  features: Feature[];
  tasks: Task[];
  milestones?: Milestone[];
  selectedMilestoneId?: string; // 상위에서 선택된 마일스톤
  onViewFeature?: (featureId: string) => void;
  onViewTask?: (taskId: string) => void;
  onUpdateTaskDates?: (taskId: string, startDate: string, endDate: string) => void;
}

// 각 날짜 열의 픽셀 너비
const DAY_WIDTH = 60;
// 각 주 열의 픽셀 너비 (주 단위 뷰에서 사용)
const WEEK_WIDTH = 80;
// 왼쪽 Feature/Task 열 너비
const LEFT_COLUMN_WIDTH = 280;

// 날짜 문자열을 로컬 타임존 기준으로 파싱 (타임존 이슈 방지)
const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Task 상태에 따른 색상
const getTaskBarColor = (task: Task, endDate: Date | null): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (task.completed) {
    return 'bg-green-500'; // 완료
  }

  if (endDate) {
    const endDateNormalized = new Date(endDate);
    endDateNormalized.setHours(0, 0, 0, 0);

    if (isBefore(endDateNormalized, today)) {
      return 'bg-red-500'; // 마감 초과
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (isSameDay(endDateNormalized, today) || isSameDay(endDateNormalized, tomorrow)) {
      return 'bg-orange-500'; // 마감 임박
    }
  }

  // 시작일 체크
  const startDate = task.start_date ? parseLocalDate(task.start_date) : null;
  if (startDate) {
    const startDateNormalized = new Date(startDate);
    startDateNormalized.setHours(0, 0, 0, 0);

    if (isAfter(startDateNormalized, today)) {
      return 'bg-gray-400'; // 진행 전
    }
  }

  return 'bg-indigo-500'; // 진행 중
};

export function WeeklyScheduleView({
  boardId,
  features,
  tasks,
  milestones = [],
  selectedMilestoneId = 'all',
  onViewFeature,
  onViewTask,
  onUpdateTaskDates,
}: WeeklyScheduleViewProps) {
  // 일/주 보기 모드
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('day');

  // 시작/종료 날짜 (기본값: 오늘 기준 7일 전 ~ 30일 후)
  const [rangeStartDate, setRangeStartDate] = useState(() => subDays(new Date(), 7));
  const [rangeEndDate, setRangeEndDate] = useState(() => addDays(new Date(), 23));

  // 선택된 마일스톤에 따라 날짜 범위 업데이트
  useEffect(() => {
    if (selectedMilestoneId && selectedMilestoneId !== 'all' && milestones.length > 0) {
      const milestone = milestones.find((m) => m.id === selectedMilestoneId);
      if (milestone) {
        setRangeStartDate(parseLocalDate(milestone.start_date));
        setRangeEndDate(parseLocalDate(milestone.end_date));
      }
    } else if (selectedMilestoneId === 'all') {
      // "전체" 선택 시 기본 날짜 범위로
      setRangeStartDate(subDays(new Date(), 7));
      setRangeEndDate(addDays(new Date(), 23));
    }
  }, [selectedMilestoneId, milestones]);

  // Feature 접기/펼치기 상태
  const [collapsedFeatures, setCollapsedFeatures] = useState<Set<string>>(new Set());

  // 드래그 리사이즈 상태
  const [resizing, setResizing] = useState<{
    taskId: string;
    handle: 'left' | 'right';
    initialX: number;
    initialStartDate: Date | null;
    initialEndDate: Date | null;
  } | null>(null);

  // 드래그 이동 상태 (전체 바 이동)
  const [dragging, setDragging] = useState<{
    taskId: string;
    initialX: number;
    initialStartDate: Date | null;
    initialEndDate: Date | null;
  } | null>(null);

  // 롱프레스 타이머
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTaskRef = useRef<{ taskId: string; task: Task; x: number } | null>(null);

  // 드래그 완료 직후 클릭 방지 플래그
  const justFinishedDragRef = useRef(false);

  // 스크롤 컨테이너 ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // 날짜들 (rangeStartDate ~ rangeEndDate)
  const days = useMemo(() => {
    if (isBefore(rangeEndDate, rangeStartDate)) return [];
    return eachDayOfInterval({ start: rangeStartDate, end: rangeEndDate });
  }, [rangeStartDate, rangeEndDate]);

  // 주 단위 데이터 (주의 시작일 배열)
  const weeks = useMemo(() => {
    if (isBefore(rangeEndDate, rangeStartDate)) return [];
    const weekStarts = eachWeekOfInterval(
      { start: rangeStartDate, end: rangeEndDate },
      { weekStartsOn: 1 }
    );
    return weekStarts.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      return {
        start: weekStart,
        end: isAfter(weekEnd, rangeEndDate) ? rangeEndDate : weekEnd,
      };
    });
  }, [rangeStartDate, rangeEndDate]);

  // 총 일수
  const totalDays = days.length;

  // 현재 뷰에 따른 열 너비와 총 너비
  const columnWidth = viewMode === 'day' ? DAY_WIDTH : WEEK_WIDTH;
  const totalColumns = viewMode === 'day' ? totalDays : weeks.length;

  // 오늘 버튼 클릭 - 오늘이 보이도록 스크롤
  const handleGoToToday = () => {
    const today = new Date();
    // 오늘이 범위 내에 있으면 스크롤만
    if (!isBefore(today, rangeStartDate) && !isAfter(today, rangeEndDate)) {
      if (scrollContainerRef.current) {
        if (viewMode === 'day') {
          const todayOffset = differenceInDays(today, rangeStartDate) * DAY_WIDTH;
          scrollContainerRef.current.scrollLeft = todayOffset - 100;
        } else {
          // 주 단위 뷰에서는 오늘이 속한 주를 찾아서 스크롤
          const weekIndex = weeks.findIndex((week) =>
            isWithinInterval(today, { start: week.start, end: week.end })
          );
          if (weekIndex >= 0) {
            scrollContainerRef.current.scrollLeft = weekIndex * WEEK_WIDTH - 100;
          }
        }
      }
    } else {
      // 범위 밖이면 범위 재설정
      setRangeStartDate(subDays(today, 7));
      setRangeEndDate(addDays(today, 23));
    }
  };

  // 초기 로드시 오늘 위치로 스크롤
  useEffect(() => {
    if (scrollContainerRef.current) {
      const today = new Date();
      if (viewMode === 'day') {
        const todayOffset = differenceInDays(today, rangeStartDate) * DAY_WIDTH;
        scrollContainerRef.current.scrollLeft = Math.max(0, todayOffset - 100);
      } else {
        const weekIndex = weeks.findIndex((week) =>
          isWithinInterval(today, { start: week.start, end: week.end })
        );
        if (weekIndex >= 0) {
          scrollContainerRef.current.scrollLeft = Math.max(0, weekIndex * WEEK_WIDTH - 100);
        }
      }
    }
  }, [rangeStartDate, viewMode, weeks]);

  // 헤더와 본문 스크롤 동기화
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // 드래그 리사이즈 시작
  const handleResizeStart = (
    e: React.MouseEvent,
    taskId: string,
    handle: 'left' | 'right',
    task: Task
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const startDate = task.start_date ? parseLocalDate(task.start_date) : null;
    const endDate = task.due_date ? parseLocalDate(task.due_date) : null;

    setResizing({
      taskId,
      handle,
      initialX: e.clientX,
      initialStartDate: startDate,
      initialEndDate: endDate,
    });
  };

  // 드래그 중 처리
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing || !timelineRef.current) return;

      const deltaX = e.clientX - resizing.initialX;
      const daysDelta = Math.round(deltaX / DAY_WIDTH);

      if (daysDelta === 0) return;

      const task = tasks.find((t) => t.id === resizing.taskId);
      if (!task) return;

      let newStartDate = resizing.initialStartDate;
      let newEndDate = resizing.initialEndDate;

      if (resizing.handle === 'left' && newStartDate) {
        newStartDate = addDays(resizing.initialStartDate!, daysDelta);
        // 시작일이 종료일을 넘지 않도록
        if (newEndDate && isAfter(newStartDate, newEndDate)) {
          newStartDate = newEndDate;
        }
      } else if (resizing.handle === 'right' && newEndDate) {
        newEndDate = addDays(resizing.initialEndDate!, daysDelta);
        // 종료일이 시작일보다 앞서지 않도록
        if (newStartDate && isBefore(newEndDate, newStartDate)) {
          newEndDate = newStartDate;
        }
      }

      // 임시로 시각적 업데이트 (실제 데이터 업데이트는 mouseup에서)
      const taskBar = timelineRef.current.querySelector(`[data-task-id="${resizing.taskId}"]`) as HTMLElement;
      if (taskBar && newStartDate && newEndDate) {
        const startOffset = differenceInDays(newStartDate, rangeStartDate);
        const duration = differenceInDays(newEndDate, newStartDate) + 1;
        taskBar.style.left = `${startOffset * DAY_WIDTH}px`;
        taskBar.style.width = `${duration * DAY_WIDTH - 4}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!resizing) return;

      const deltaX = e.clientX - resizing.initialX;
      const daysDelta = Math.round(deltaX / DAY_WIDTH);

      if (daysDelta !== 0) {
        let newStartDate = resizing.initialStartDate;
        let newEndDate = resizing.initialEndDate;

        if (resizing.handle === 'left' && newStartDate) {
          newStartDate = addDays(resizing.initialStartDate!, daysDelta);
          if (newEndDate && isAfter(newStartDate, newEndDate)) {
            newStartDate = newEndDate;
          }
        } else if (resizing.handle === 'right' && newEndDate) {
          newEndDate = addDays(resizing.initialEndDate!, daysDelta);
          if (newStartDate && isBefore(newEndDate, newStartDate)) {
            newEndDate = newStartDate;
          }
        }

        // API 호출
        if (onUpdateTaskDates && newStartDate && newEndDate) {
          onUpdateTaskDates(
            resizing.taskId,
            format(newStartDate, 'yyyy-MM-dd'),
            format(newEndDate, 'yyyy-MM-dd')
          );
        }
      }

      setResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, tasks, rangeStartDate, onUpdateTaskDates]);

  // 롱프레스 시작 (0.3초 후 드래그 모드)
  const handleLongPressStart = (e: React.MouseEvent, taskId: string, task: Task) => {
    // 리사이즈 핸들 클릭이면 무시
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;

    longPressTaskRef.current = { taskId, task, x: e.clientX };

    longPressTimerRef.current = setTimeout(() => {
      if (longPressTaskRef.current) {
        const { taskId, task, x } = longPressTaskRef.current;
        const startDate = task.start_date ? parseLocalDate(task.start_date) : null;
        const endDate = task.due_date ? parseLocalDate(task.due_date) : null;

        if (startDate && endDate) {
          setDragging({
            taskId,
            initialX: x,
            initialStartDate: startDate,
            initialEndDate: endDate,
          });
          // 드래그 모드 진입 시 커서 변경
          document.body.style.cursor = 'grabbing';
        }
      }
    }, 300); // 0.3초
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressTaskRef.current = null;
  };

  // 드래그 이동 처리
  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging || !timelineRef.current) return;

      const deltaX = e.clientX - dragging.initialX;
      const daysDelta = Math.round(deltaX / DAY_WIDTH);

      if (daysDelta === 0) return;

      const newStartDate = addDays(dragging.initialStartDate!, daysDelta);
      const newEndDate = addDays(dragging.initialEndDate!, daysDelta);

      // 시각적 업데이트
      const taskBar = timelineRef.current.querySelector(`[data-task-id="${dragging.taskId}"]`) as HTMLElement;
      if (taskBar) {
        const startOffset = differenceInDays(newStartDate, rangeStartDate);
        const duration = differenceInDays(newEndDate, newStartDate) + 1;
        taskBar.style.left = `${startOffset * DAY_WIDTH}px`;
        taskBar.style.width = `${duration * DAY_WIDTH - 4}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragging) return;

      document.body.style.cursor = '';

      const deltaX = e.clientX - dragging.initialX;
      const daysDelta = Math.round(deltaX / DAY_WIDTH);

      if (daysDelta !== 0 && dragging.initialStartDate && dragging.initialEndDate) {
        const newStartDate = addDays(dragging.initialStartDate, daysDelta);
        const newEndDate = addDays(dragging.initialEndDate, daysDelta);

        // API 호출
        if (onUpdateTaskDates) {
          onUpdateTaskDates(
            dragging.taskId,
            format(newStartDate, 'yyyy-MM-dd'),
            format(newEndDate, 'yyyy-MM-dd')
          );
        }
      }

      // 드래그 완료 직후 클릭 방지
      justFinishedDragRef.current = true;
      setTimeout(() => {
        justFinishedDragRef.current = false;
      }, 100);

      setDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, rangeStartDate, onUpdateTaskDates]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Feature 토글
  const toggleFeature = (featureId: string) => {
    setCollapsedFeatures((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(featureId)) {
        newSet.delete(featureId);
      } else {
        newSet.add(featureId);
      }
      return newSet;
    });
  };

  // Feature별 Task 그룹화
  const featureTaskMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    features.forEach((feature) => {
      const featureTasks = tasks.filter((task) => task.feature_id === feature.id);
      map.set(feature.id, featureTasks);
    });
    return map;
  }, [features, tasks]);

  // 마일스톤 선택에 따른 Feature 필터링
  const displayedFeatures = useMemo(() => {
    if (selectedMilestoneId === 'all') {
      return features;
    }
    const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId);
    if (!selectedMilestone || !selectedMilestone.features) {
      return features;
    }
    // 마일스톤에 연결된 feature ID 목록
    const linkedFeatureIds = new Set(selectedMilestone.features.map((f) => f.id));
    return features.filter((f) => linkedFeatureIds.has(f.id));
  }, [features, selectedMilestoneId, milestones]);

  // Feature 집계 날짜 계산
  const getFeatureAggregatedDates = (featureId: string) => {
    const featureTasks = featureTaskMap.get(featureId) || [];
    let minStart: Date | null = null;
    let maxEnd: Date | null = null;

    featureTasks.forEach((task) => {
      const taskStartDate = task.start_date ? parseLocalDate(task.start_date) : null;
      const endDate = task.due_date ? parseLocalDate(task.due_date) : null;

      if (taskStartDate && (!minStart || isBefore(taskStartDate, minStart))) {
        minStart = taskStartDate;
      }
      if (endDate && (!maxEnd || isAfter(endDate, maxEnd))) {
        maxEnd = endDate;
      }
    });

    return { minStart, maxEnd };
  };

  // Task 바 위치 계산 (픽셀 기반)
  const calculateTaskBarPosition = (task: Task) => {
    const taskStartDate = task.start_date ? parseLocalDate(task.start_date) : null;
    const endDate = task.due_date ? parseLocalDate(task.due_date) : null;

    if (!taskStartDate && !endDate) return null;

    const rangeStart = rangeStartDate;
    const rangeEnd = days[days.length - 1];

    // Task가 표시 범위에 해당하는지 확인
    const effectiveStart = taskStartDate || endDate!;
    const effectiveEnd = endDate || taskStartDate!;

    // 범위와 겹치지 않으면 null
    if (isAfter(effectiveStart, rangeEnd) || isBefore(effectiveEnd, rangeStart)) {
      return null;
    }

    // 시작 위치 계산
    const displayStart = isBefore(effectiveStart, rangeStart) ? rangeStart : effectiveStart;
    const displayEnd = isAfter(effectiveEnd, rangeEnd) ? rangeEnd : effectiveEnd;

    if (viewMode === 'day') {
      const startOffset = differenceInDays(displayStart, rangeStart);
      const duration = differenceInDays(displayEnd, displayStart) + 1;
      return {
        left: startOffset * DAY_WIDTH,
        width: duration * DAY_WIDTH - 4, // 약간의 여백
      };
    } else {
      // 주 단위 뷰: 시작 주와 끝 주를 찾아서 위치 계산
      const startWeekIndex = weeks.findIndex((week) =>
        isWithinInterval(displayStart, { start: week.start, end: week.end }) ||
        isBefore(displayStart, week.start) && isAfter(displayEnd, week.start)
      );
      const endWeekIndex = weeks.findIndex((week) =>
        isWithinInterval(displayEnd, { start: week.start, end: week.end })
      );

      if (startWeekIndex === -1 && endWeekIndex === -1) return null;

      const effectiveStartWeek = startWeekIndex >= 0 ? startWeekIndex : 0;
      const effectiveEndWeek = endWeekIndex >= 0 ? endWeekIndex : weeks.length - 1;
      const weekSpan = effectiveEndWeek - effectiveStartWeek + 1;

      return {
        left: effectiveStartWeek * WEEK_WIDTH,
        width: weekSpan * WEEK_WIDTH - 4,
      };
    }
  };

  // Feature 집계 바 위치 계산
  const calculateFeatureBarPosition = (featureId: string) => {
    const { minStart, maxEnd } = getFeatureAggregatedDates(featureId);
    if (!minStart && !maxEnd) return null;

    const rangeStart = rangeStartDate;
    const rangeEnd = days[days.length - 1];

    const effectiveStart = minStart || maxEnd!;
    const effectiveEnd = maxEnd || minStart!;

    if (isAfter(effectiveStart, rangeEnd) || isBefore(effectiveEnd, rangeStart)) {
      return null;
    }

    const displayStart = isBefore(effectiveStart, rangeStart) ? rangeStart : effectiveStart;
    const displayEnd = isAfter(effectiveEnd, rangeEnd) ? rangeEnd : effectiveEnd;

    if (viewMode === 'day') {
      const startOffset = differenceInDays(displayStart, rangeStart);
      const duration = differenceInDays(displayEnd, displayStart) + 1;
      return {
        left: startOffset * DAY_WIDTH,
        width: duration * DAY_WIDTH - 4,
      };
    } else {
      // 주 단위 뷰
      const startWeekIndex = weeks.findIndex((week) =>
        isWithinInterval(displayStart, { start: week.start, end: week.end }) ||
        isBefore(displayStart, week.start) && isAfter(displayEnd, week.start)
      );
      const endWeekIndex = weeks.findIndex((week) =>
        isWithinInterval(displayEnd, { start: week.start, end: week.end })
      );

      if (startWeekIndex === -1 && endWeekIndex === -1) return null;

      const effectiveStartWeek = startWeekIndex >= 0 ? startWeekIndex : 0;
      const effectiveEndWeek = endWeekIndex >= 0 ? endWeekIndex : weeks.length - 1;
      const weekSpan = effectiveEndWeek - effectiveStartWeek + 1;

      return {
        left: effectiveStartWeek * WEEK_WIDTH,
        width: weekSpan * WEEK_WIDTH - 4,
      };
    }
  };

  // 오늘 표시선 위치 계산
  const getTodayLinePosition = () => {
    const today = new Date();
    const rangeStart = rangeStartDate;
    const rangeEnd = days[days.length - 1];

    if (isBefore(today, rangeStart) || isAfter(today, rangeEnd)) {
      return null;
    }

    if (viewMode === 'day') {
      const offset = differenceInDays(today, rangeStart);
      return offset * DAY_WIDTH + DAY_WIDTH / 2;
    } else {
      // 주 단위 뷰에서는 오늘이 속한 주의 중앙
      const weekIndex = weeks.findIndex((week) =>
        isWithinInterval(today, { start: week.start, end: week.end })
      );
      if (weekIndex >= 0) {
        return weekIndex * WEEK_WIDTH + WEEK_WIDTH / 2;
      }
      return null;
    }
  };

  const todayLinePosition = getTodayLinePosition();

  // 총 그리드 너비
  const totalGridWidth = viewMode === 'day' ? totalDays * DAY_WIDTH : weeks.length * WEEK_WIDTH;

  return (
    <div className="h-full flex flex-col bg-kanban-bg">
      {/* 상단 네비게이션 */}
      <div className="flex items-center justify-between px-3 md:px-6 py-2 md:py-3 bg-kanban-card border-b border-kanban-border gap-2">
        <div className="flex items-center gap-2 md:gap-4 flex-wrap min-w-0">
          {/* 일/주 토글 */}
          <div
            className="flex bg-kanban-bg rounded-lg p-1 cursor-pointer"
            onClick={() => setViewMode(viewMode === 'day' ? 'week' : 'day')}
          >
            <span
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'day'
                  ? 'bg-kanban-surface text-white'
                  : 'text-zinc-400'
              }`}
            >
              일
            </span>
            <span
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'week'
                  ? 'bg-kanban-surface text-white'
                  : 'text-zinc-400'
              }`}
            >
              주
            </span>
          </div>

          {/* 날짜 범위 선택 */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/5 border border-white/20 rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <CalendarIcon className="h-4 w-4 text-zinc-400" />
                <span>
                  {format(rangeStartDate, 'yyyy. MM. dd.')} ~ {format(rangeEndDate, 'yyyy. MM. dd.')}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-bridge-obsidian border-white/20" align="start">
              <Calendar
                mode="range"
                selected={{ from: rangeStartDate, to: rangeEndDate }}
                onSelect={(range: DateRange | undefined) => {
                  if (range?.from) {
                    setRangeStartDate(range.from);
                  }
                  if (range?.to) {
                    setRangeEndDate(range.to);
                  }
                }}
                numberOfMonths={2}
                locale={ko}
                className="bg-bridge-obsidian text-white"
              />
            </PopoverContent>
          </Popover>

          <span className="text-sm text-zinc-400">
            ({viewMode === 'day' ? `${totalDays}일` : `${weeks.length}주`})
          </span>

          <button
            onClick={handleGoToToday}
            className="px-3 py-1.5 text-sm bg-white/5 border border-white/20 rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            오늘
          </button>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400 shrink-0">
          <span className="inline-block w-3 h-3 bg-gray-400 rounded"></span> 진행 전
          <span className="inline-block w-3 h-3 bg-indigo-500 rounded ml-2"></span> 진행 중
          <span className="inline-block w-3 h-3 bg-orange-500 rounded ml-2"></span> 마감 임박
          <span className="inline-block w-3 h-3 bg-red-500 rounded ml-2"></span> 마감 초과
          <span className="inline-block w-3 h-3 bg-green-500 rounded ml-2"></span> 완료
        </div>
      </div>

      {/* 메인 그리드 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 왼쪽 고정 열 (Feature/Task 이름) */}
        <div className="flex-shrink-0 flex flex-col w-[200px] md:w-[280px]">
          {/* 헤더 */}
          <div className="h-14 p-3 bg-kanban-card border-b border-r border-kanban-border flex items-center">
            <span className="text-sm font-medium text-zinc-400">Feature / Task</span>
          </div>

          {/* Feature/Task 목록 */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {displayedFeatures.map((feature) => {
              const isCollapsed = collapsedFeatures.has(feature.id);
              const featureTasks = featureTaskMap.get(feature.id) || [];
              const completedTasks = featureTasks.filter((t) => t.completed).length;

              return (
                <div key={feature.id}>
                  {/* Feature 행 */}
                  <div
                    className="h-10 md:h-12 p-2 md:p-3 border-b border-r border-kanban-border flex items-center gap-2 cursor-pointer hover:bg-white/5"
                    onClick={() => toggleFeature(feature.id)}
                  >
                    {isCollapsed ? (
                      <ChevronRightIcon className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                    )}
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: feature.color }}
                    />
                    <span
                      className="text-sm font-medium text-foreground truncate flex-1 hover:text-indigo-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewFeature?.(feature.id);
                      }}
                    >
                      {feature.title}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {completedTasks}/{featureTasks.length}
                    </span>
                  </div>

                  {/* Task 행들 */}
                  {!isCollapsed &&
                    featureTasks.map((task) => (
                      <div
                        key={task.id}
                        className="h-10 p-2 md:p-3 border-b border-r border-kanban-border flex items-center gap-2 pl-7 md:pl-10 hover:bg-white/5"
                      >
                        <FileText className="h-3 w-3 text-zinc-400 flex-shrink-0" />
                        <span
                          className={`text-sm truncate flex-1 cursor-pointer hover:text-indigo-400 ${
                            task.completed ? 'text-zinc-400 line-through' : 'text-zinc-300'
                          }`}
                          onClick={() => onViewTask?.(task.id)}
                        >
                          {task.title}
                        </span>
                        {/* v7.0: Task.assignee 제거 - ChecklistItem에서 담당자 확인 */}
                      </div>
                    ))}
                </div>
              );
            })}

            {displayedFeatures.length === 0 && (
              <div className="flex items-center justify-center h-64 text-zinc-400">
                {selectedMilestoneId === 'all' ? 'Feature가 없습니다' : '연결된 Feature가 없습니다'}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 스크롤 영역 (타임라인) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 헤더: 날짜들 또는 주 */}
          <div
            ref={headerScrollRef}
            className="h-14 bg-kanban-card border-b border-kanban-border overflow-hidden"
          >
            <div className="flex" style={{ width: totalGridWidth }}>
              {viewMode === 'day' ? (
                // 일 단위 헤더
                days.map((day, index) => {
                  const dayIsToday = isToday(day);
                  const dayOfWeek = getDay(day);
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                  return (
                    <div
                      key={index}
                      className={`flex-shrink-0 p-2 text-center border-r border-kanban-border ${
                        dayIsToday ? 'bg-indigo-600/20' : isWeekend ? 'bg-zinc-800/30' : ''
                      }`}
                      style={{ width: DAY_WIDTH }}
                    >
                      <div className={`text-xs font-medium ${dayIsToday ? 'text-indigo-400' : isWeekend ? 'text-zinc-400' : 'text-zinc-400'}`}>
                        {formatDate(day, 'EEE')}
                      </div>
                      <div className={`text-xs ${dayIsToday ? 'text-indigo-300' : 'text-zinc-400'}`}>
                        {format(day, 'M/d')}
                      </div>
                    </div>
                  );
                })
              ) : (
                // 주 단위 헤더
                weeks.map((week, index) => {
                  const today = new Date();
                  const isCurrentWeek = isWithinInterval(today, { start: week.start, end: week.end });

                  return (
                    <div
                      key={index}
                      className={`flex-shrink-0 p-2 text-center border-r border-kanban-border ${
                        isCurrentWeek ? 'bg-indigo-600/20' : ''
                      }`}
                      style={{ width: WEEK_WIDTH }}
                    >
                      <div className={`text-xs font-medium ${isCurrentWeek ? 'text-indigo-400' : 'text-zinc-400'}`}>
                        {format(week.start, 'M/d')}
                      </div>
                      <div className={`text-xs ${isCurrentWeek ? 'text-indigo-300' : 'text-zinc-400'}`}>
                        ~{format(week.end, 'M/d')}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 본문: 타임라인 */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-auto"
            onScroll={handleScroll}
          >
            <div ref={timelineRef} className="relative" style={{ width: totalGridWidth }}>
              {/* 오늘 표시선 */}
              {todayLinePosition !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                  style={{ left: todayLinePosition, minHeight: '100%' }}
                />
              )}

              {/* 배경 그리드 */}
              <div className="absolute inset-0 flex pointer-events-none">
                {viewMode === 'day' ? (
                  // 일 단위 배경 (주말 표시)
                  days.map((day, index) => {
                    const dayOfWeek = getDay(day);
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    return (
                      <div
                        key={index}
                        className={`flex-shrink-0 border-r border-kanban-border ${isWeekend ? 'bg-zinc-800/20' : ''}`}
                        style={{ width: DAY_WIDTH }}
                      />
                    );
                  })
                ) : (
                  // 주 단위 배경
                  weeks.map((week, index) => {
                    const today = new Date();
                    const isCurrentWeek = isWithinInterval(today, { start: week.start, end: week.end });
                    return (
                      <div
                        key={index}
                        className={`flex-shrink-0 border-r border-kanban-border ${isCurrentWeek ? 'bg-indigo-900/10' : ''}`}
                        style={{ width: WEEK_WIDTH }}
                      />
                    );
                  })
                )}
              </div>

              {/* Feature/Task 바들 */}
              {displayedFeatures.map((feature) => {
                const isCollapsed = collapsedFeatures.has(feature.id);
                const featureTasks = featureTaskMap.get(feature.id) || [];
                const featureBarPosition = calculateFeatureBarPosition(feature.id);
                const completedTasks = featureTasks.filter((t) => t.completed).length;
                const progressPercent = featureTasks.length > 0 ? (completedTasks / featureTasks.length) * 100 : 0;

                return (
                  <div key={feature.id}>
                    {/* Feature 바 행 */}
                    <div className="h-12 relative border-b border-kanban-border">
                      {featureBarPosition && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-3 bg-gray-600/50 rounded-sm"
                          style={{
                            left: featureBarPosition.left,
                            width: featureBarPosition.width,
                          }}
                        >
                          <div
                            className="h-full bg-green-500/70 rounded-sm"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Task 바 행들 */}
                    {!isCollapsed &&
                      featureTasks.map((task) => {
                        const taskBarPosition = calculateTaskBarPosition(task);
                        const taskEndDate = task.due_date ? parseLocalDate(task.due_date) : null;
                        const barColor = getTaskBarColor(task, taskEndDate);
                        const hasStartDate = !!task.start_date;
                        const hasEndDate = !!task.due_date;
                        const isDraggingThis = dragging?.taskId === task.id;
                        const isResizingThis = resizing?.taskId === task.id;
                        // 주 단위 뷰에서는 드래그/리사이즈 비활성화
                        const canDragResize = viewMode === 'day';

                        return (
                          <div key={task.id} className="h-10 relative border-b border-kanban-border">
                            {taskBarPosition && (
                              <div
                                data-task-id={task.id}
                                className={`absolute top-1/2 -translate-y-1/2 h-6 ${barColor} rounded transition-colors group ${
                                  isDraggingThis ? 'cursor-grabbing opacity-80 shadow-lg' :
                                  isResizingThis ? 'brightness-110' :
                                  'cursor-pointer hover:brightness-110'
                                }`}
                                style={{
                                  left: taskBarPosition.left,
                                  width: taskBarPosition.width,
                                  minWidth: 20,
                                }}
                                onMouseDown={canDragResize ? (e) => handleLongPressStart(e, task.id, task) : undefined}
                                onMouseUp={canDragResize ? handleLongPressEnd : undefined}
                                onMouseLeave={canDragResize ? handleLongPressEnd : undefined}
                                onClick={() => {
                                  if (!resizing && !dragging && !justFinishedDragRef.current) {
                                    onViewTask?.(task.id);
                                  }
                                }}
                              >
                                {/* 좌측 리사이즈 핸들 - 일 단위에서만 표시 */}
                                {canDragResize && hasStartDate && (
                                  <div
                                    data-resize-handle="left"
                                    className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-l hover:bg-white/50 z-10"
                                    onMouseDown={(e) => {
                                      handleLongPressEnd();
                                      handleResizeStart(e, task.id, 'left', task);
                                    }}
                                  />
                                )}
                                {/* 우측 리사이즈 핸들 - 일 단위에서만 표시 */}
                                {canDragResize && hasEndDate && (
                                  <div
                                    data-resize-handle="right"
                                    className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/30 rounded-r hover:bg-white/50 z-10"
                                    onMouseDown={(e) => {
                                      handleLongPressEnd();
                                      handleResizeStart(e, task.id, 'right', task);
                                    }}
                                  />
                                )}
                                {/* Task 이름 + 체크리스트 원형 게이지 */}
                                <div className="px-2 h-full flex items-center gap-1.5 overflow-hidden pointer-events-none">
                                  <span className="text-xs text-white truncate">
                                    {task.title}
                                  </span>
                                  {task.checklist_total && task.checklist_total > 0 && (
                                    <div className="flex-shrink-0 relative w-4 h-4">
                                      <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
                                        {/* 배경 원 */}
                                        <circle
                                          cx="8"
                                          cy="8"
                                          r="6"
                                          fill="none"
                                          stroke="rgba(0,0,0,0.3)"
                                          strokeWidth="2"
                                        />
                                        {/* 진행률 원 */}
                                        <circle
                                          cx="8"
                                          cy="8"
                                          r="6"
                                          fill="none"
                                          stroke="rgba(255,255,255,0.9)"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeDasharray={`${((task.checklist_completed || 0) / task.checklist_total) * 37.7} 37.7`}
                                        />
                                      </svg>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
