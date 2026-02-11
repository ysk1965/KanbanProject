import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Settings, Plus, Loader2, Clock, CheckSquare, Check, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { format, addDays, subDays, startOfDay, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval } from 'date-fns';
import { formatDate } from '../utils/dateUtils';
import { BoardMember } from './ShareBoardModal';
import { ScheduleBlock } from './ScheduleBlock';
import { ScheduleDetailPanel } from './ScheduleDetailPanel';
import { ChecklistCreateModal } from './ChecklistCreateModal';
import { ScheduleSettingsModal, ScheduleDisplayMode } from './ScheduleSettingsModal';
import { WeeklySummaryModal } from './WeeklySummaryModal';
import { DailySummaryModal } from './DailySummaryModal';
import { DailyChecklistView } from './DailyChecklistView';
import { MeetingView } from './MeetingView';
import { BoardMember as BoardMemberType } from '../types';
import {
  scheduleAPI,
  dailyChecklistAPI,
  ScheduleBlockInfo,
  ScheduleColumnInfo,
  ScheduleSettingsResponse,
  DailyChecklistColumnResponse,
} from '../utils/api';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';

// 데일리 스크럼 세부 탭 타입
type ScheduleSubTab = 'timeblock' | 'checklist' | 'meeting';

interface DailyScheduleViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  memberColorMap?: Record<string, string | null>;
  onViewFeature?: (featureId: string) => void;
  onViewTask?: (taskId: string) => void;
  refreshTrigger?: number;
  currentUserRole?: string;
  initialSubTab?: ScheduleSubTab;
}

const SLOT_HEIGHT = 40; // 30분 슬롯의 높이 (px)

// 시간 슬롯 생성 (30분 단위)
const generateTimeSlots = (startHour: number, endHour: number) => {
  const slots: string[] = [];
  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
    slots.push(`${hour.toString().padStart(2, '0')}:30`);
  }
  return slots;
};

// 시간 문자열에서 시간만 추출 (예: "09:00" 또는 "09:00:00" -> 9)
const parseHour = (time: string): number => {
  return parseInt(time.split(':')[0], 10);
};

type ScheduleViewMode = 'day' | 'week';

export function DailyScheduleView({ boardId, boardMembers, memberColorMap, onViewFeature, onViewTask, refreshTrigger, currentUserRole, initialSubTab }: DailyScheduleViewProps) {
  const { t } = useTranslation();
  // observer 역할 제외한 멤버 목록
  const activeMembers = useMemo(() => boardMembers.filter((m) => m.role !== 'observer'), [boardMembers]);
  // 세부 탭 상태 (타임블록 / 체크리스트)
  const [subTab, setSubTab] = useState<ScheduleSubTab>(initialSubTab || 'timeblock');

  const [viewMode, setViewMode] = useState<ScheduleViewMode>('day');
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [columns, setColumns] = useState<ScheduleColumnInfo[]>([]);
  const [weeklyData, setWeeklyData] = useState<Map<string, ScheduleColumnInfo[]>>(new Map());
  const [settings, setSettings] = useState<ScheduleSettingsResponse | null>(null);

  // 데일리 체크리스트 데이터
  const [dailyChecklists, setDailyChecklists] = useState<DailyChecklistColumnResponse[]>([]);

  // 드래그 선택 상태
  const [dragState, setDragState] = useState<{
    userId: string;
    startSlotIndex: number;
    endSlotIndex: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 선택된 블록 (상세 패널용)
  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlockInfo | null>(null);

  // 대기 중인 블록 생성 (Action Choice 모달용)
  const [pendingBlock, setPendingBlock] = useState<{
    userId: string;
    startTime: string;
    endTime: string;
    startSlotIndex: number;
    endSlotIndex: number;
    splitBlocks?: Array<{ startTime: string; endTime: string }>;
  } | null>(null);

  // 체크리스트 모달 상태 (선택 + 생성 통합)
  const [showChecklistModal, setShowChecklistModal] = useState(false);

  // 설정 모달 상태
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // 주간 요약 모달 대상 멤버
  const [summaryMember, setSummaryMember] = useState<BoardMember | null>(null);

  // 설정에서 표시 모드 가져오기 (TIME -> time, BLOCK -> block)
  const displayMode: ScheduleDisplayMode = settings?.schedule_display_mode === 'BLOCK' ? 'block' : 'time';

  // 설정에서 시간 범위 계산
  const workStartHour = settings ? parseHour(settings.work_start_time) : 9;
  const workEndHour = settings ? workStartHour + settings.work_hours_per_day : 18;

  // 점심시간 계산
  const breakStartMinutes = settings?.break_start_time ? (() => {
    const [h, m] = settings.break_start_time.split(':').map(Number);
    return h * 60 + m;
  })() : null;
  const breakEndMinutes = settings?.break_end_time ? (() => {
    const [h, m] = settings.break_end_time.split(':').map(Number);
    return h * 60 + m;
  })() : null;
  const hasBreak = breakStartMinutes !== null && breakEndMinutes !== null;

  const isBreakSlot = useCallback((slotTime: string): boolean => {
    if (!hasBreak) return false;
    const [h, m] = slotTime.split(':').map(Number);
    const minutes = h * 60 + m;
    return minutes >= breakStartMinutes! && minutes < breakEndMinutes!;
  }, [hasBreak, breakStartMinutes, breakEndMinutes]);

  const timeSlots = useMemo(
    () => generateTimeSlots(workStartHour, workEndHour),
    [workStartHour, workEndHour]
  );

  // 주 단위 날짜 배열 계산
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // 월요일 시작
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [selectedDate]);

  // 스케줄 데이터 로드
  const loadSchedule = useCallback(async () => {
    if (!boardId) return;

    setIsLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      if (viewMode === 'day') {
        // 통합 API로 스케줄 + 데일리 체크리스트 1회 로드 (기존 2회 → 1회)
        const response = await scheduleAPI.getDailyFull(boardId, dateStr);
        setColumns(response.columns);
        setSettings(response.settings);
        setDailyChecklists(response.daily_checklists || []);
      } else {
        // 주 단위: 통합 API로 7일치 데이터 1회 로드 (기존 7회 → 1회)
        const startDateStr = format(weekDays[0], 'yyyy-MM-dd');
        const endDateStr = format(weekDays[weekDays.length - 1], 'yyyy-MM-dd');

        const response = await scheduleAPI.getWeeklySchedule(boardId, startDateStr, endDateStr);

        const newWeeklyData = new Map<string, ScheduleColumnInfo[]>();
        response.days.forEach(({ date, columns: cols }) => {
          newWeeklyData.set(date, cols);
        });
        if (response.settings) setSettings(response.settings);
        setWeeklyData(newWeeklyData);
      }
    } catch (error) {
      console.error('Failed to load schedule:', error);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, selectedDate, viewMode, weekDays]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule, refreshTrigger]);

  // 스케줄 데이터가 변경되면 선택된 블록도 업데이트
  useEffect(() => {
    if (selectedBlock && columns.length > 0) {
      // 모든 컬럼에서 선택된 블록 찾기
      for (const col of columns) {
        const updatedBlock = col.blocks.find((b) => b.id === selectedBlock.id);
        if (updatedBlock) {
          setSelectedBlock(updatedBlock);
          break;
        }
      }
    }
  }, [columns]);

  // 날짜 네비게이션
  const handlePrev = () => {
    if (viewMode === 'day') {
      setSelectedDate(subDays(selectedDate, 1));
    } else {
      setSelectedDate(subWeeks(selectedDate, 1));
    }
  };
  const handleNext = () => {
    if (viewMode === 'day') {
      setSelectedDate(addDays(selectedDate, 1));
    } else {
      setSelectedDate(addWeeks(selectedDate, 1));
    }
  };
  const handleToday = () => setSelectedDate(startOfDay(new Date()));

  const dayOfWeek = formatDate(selectedDate, 'EEEE');
  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const isTodayInWeek = weekDays.some(d => format(d, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'));

  // 멤버별 블록 매핑
  const blocksByUser = useMemo(() => {
    const map = new Map<string, ScheduleBlockInfo[]>();
    columns.forEach((col) => {
      map.set(col.user.id, col.blocks);
    });
    return map;
  }, [columns]);

  // Viewer 권한 여부
  const isViewer = currentUserRole === 'viewer';

  // 드래그 시작
  const handleMouseDown = (e: React.MouseEvent, userId: string, slotIndex: number) => {
    // Viewer는 타임블록 생성 불가
    if (isViewer) return;

    e.preventDefault(); // 텍스트 선택 방지
    setIsDragging(true);
    setDragState({
      userId,
      startSlotIndex: slotIndex,
      endSlotIndex: slotIndex,
    });
  };

  // 드래그 중
  const handleMouseEnter = (userId: string, slotIndex: number) => {
    if (!isDragging || !dragState) return;
    if (dragState.userId !== userId) return;

    setDragState({
      ...dragState,
      endSlotIndex: slotIndex,
    });
  };

  // 드래그 종료
  const handleMouseUp = () => {
    if (!isDragging || !dragState) {
      setIsDragging(false);
      setDragState(null);
      return;
    }

    const { userId, startSlotIndex, endSlotIndex } = dragState;
    const minIndex = Math.min(startSlotIndex, endSlotIndex);
    const maxIndex = Math.max(startSlotIndex, endSlotIndex);

    // 최소 1슬롯 이상 선택해야 함
    if (maxIndex - minIndex >= 0) {
      const startTime = timeSlots[minIndex];
      const endTime = timeSlots[maxIndex + 1] || `${workEndHour}:00`;

      // 점심시간 분할 로직: break 슬롯을 제외하고 연속 구간을 세그먼트로 분리
      const segments: Array<{ startTime: string; endTime: string }> = [];
      let segStart: number | null = null;
      for (let i = minIndex; i <= maxIndex; i++) {
        if (!isBreakSlot(timeSlots[i])) {
          if (segStart === null) segStart = i;
        } else {
          if (segStart !== null) {
            segments.push({
              startTime: timeSlots[segStart],
              endTime: timeSlots[i],
            });
            segStart = null;
          }
        }
      }
      if (segStart !== null) {
        segments.push({
          startTime: timeSlots[segStart],
          endTime: timeSlots[maxIndex + 1] || `${workEndHour}:00`,
        });
      }

      // 비-break 슬롯이 하나도 없으면 무시
      if (segments.length === 0) {
        setIsDragging(false);
        setDragState(null);
        return;
      }

      // 체크리스트 모달 열기
      setPendingBlock({
        userId,
        startTime: segments[0].startTime,
        endTime: segments[segments.length - 1].endTime,
        startSlotIndex: minIndex,
        endSlotIndex: maxIndex,
        splitBlocks: segments.length > 1 ? segments : undefined,
      });
      setShowChecklistModal(true);
    }

    setIsDragging(false);
    setDragState(null);
  };

  // 셀이 드래그 선택 영역에 포함되는지 확인
  const isSlotSelected = (userId: string, slotIndex: number) => {
    if (!dragState || dragState.userId !== userId) return false;
    const minIndex = Math.min(dragState.startSlotIndex, dragState.endSlotIndex);
    const maxIndex = Math.max(dragState.startSlotIndex, dragState.endSlotIndex);
    return slotIndex >= minIndex && slotIndex <= maxIndex;
  };

  // 블록 클릭 핸들러
  const handleBlockClick = (block: ScheduleBlockInfo) => {
    setSelectedBlock(block);
  };

  // 패널 닫기
  const handleClosePanel = () => {
    setSelectedBlock(null);
  };

  // 블록 삭제 후 처리
  const handleBlockDeleted = () => {
    setSelectedBlock(null);
    loadSchedule();
  };

  // 체크리스트 토글 후 처리
  const handleChecklistToggled = () => {
    loadSchedule();
  };

  // 새 체크리스트 아이템 생성 후 블록 생성
  const handleChecklistCreate = async (taskId: string, title: string) => {
    if (!pendingBlock) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const segments = pendingBlock.splitBlocks || [{ startTime: pendingBlock.startTime, endTime: pendingBlock.endTime }];

      // 첫 세그먼트: createWithChecklistItem → checklist_item.id 획득
      const result = await scheduleAPI.createWithChecklistItem(boardId, {
        assignee_id: pendingBlock.userId,
        scheduled_date: dateStr,
        start_time: segments[0].startTime,
        end_time: segments[0].endTime,
        checklist_item: {
          task_id: taskId,
          title: title,
        },
      });
      // 나머지 세그먼트: 같은 checklist_item_id로 블록 생성
      for (let i = 1; i < segments.length; i++) {
        await scheduleAPI.createBlock(boardId, {
          checklist_item_id: result.checklist_item!.id,
          assignee_id: pendingBlock.userId,
          scheduled_date: dateStr,
          start_time: segments[i].startTime,
          end_time: segments[i].endTime,
        });
      }
      await loadSchedule();
    } catch (error) {
      console.error('Failed to create block with new checklist item:', error);
    }
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 기존 체크리스트 아이템 선택 후 블록 생성
  const handleChecklistItemSelect = async (checklistItemId: string) => {
    if (!pendingBlock) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const segments = pendingBlock.splitBlocks || [{ startTime: pendingBlock.startTime, endTime: pendingBlock.endTime }];

      for (const seg of segments) {
        await scheduleAPI.createBlock(boardId, {
          checklist_item_id: checklistItemId,
          assignee_id: pendingBlock.userId,
          scheduled_date: dateStr,
          start_time: seg.startTime,
          end_time: seg.endTime,
        });
      }
      await loadSchedule();
    } catch (error) {
      console.error('Failed to create block with checklist item:', error);
    }
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 보드 체크리스트 항목 선택 → 데일리 체크리스트 추가 + 타임블록 생성
  const handleBoardChecklistItemSelect = async (checklistItemId: string) => {
    if (!pendingBlock) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const segments = pendingBlock.splitBlocks || [{ startTime: pendingBlock.startTime, endTime: pendingBlock.endTime }];

      // 1) 데일리 체크리스트에 추가 (한 번만)
      await dailyChecklistAPI.addItem(boardId, {
        checklist_item_id: checklistItemId,
        assignee_id: pendingBlock.userId,
        assigned_date: dateStr,
      });
      // 2) 타임블록 생성 (세그먼트별)
      for (const seg of segments) {
        await scheduleAPI.createBlock(boardId, {
          checklist_item_id: checklistItemId,
          assignee_id: pendingBlock.userId,
          scheduled_date: dateStr,
          start_time: seg.startTime,
          end_time: seg.endTime,
        });
      }
      await loadSchedule();
    } catch (error) {
      console.error('Failed to add board checklist item and create block:', error);
    }
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 회의 선택 후 블록 생성
  const handleMeetingSelect = async (meetingId: string) => {
    if (!pendingBlock) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const segments = pendingBlock.splitBlocks || [{ startTime: pendingBlock.startTime, endTime: pendingBlock.endTime }];

      for (const seg of segments) {
        await scheduleAPI.createBlock(boardId, {
          meeting_id: meetingId,
          assignee_id: pendingBlock.userId,
          scheduled_date: dateStr,
          start_time: seg.startTime,
          end_time: seg.endTime,
        });
      }
      await loadSchedule();
    } catch (error) {
      console.error('Failed to create block with meeting:', error);
    }
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 체크리스트 모달 닫기
  const handleCloseChecklistModal = () => {
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 현재 시간 표시선용 상태 (1분마다 갱신)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // 현재 시간의 Y 위치 계산 (px)
  const currentTimeTop = useMemo(() => {
    if (!isToday || viewMode !== 'day') return null;
    const h = now.getHours();
    const m = now.getMinutes();
    const minutesFromStart = (h - workStartHour) * 60 + m;
    const totalMinutes = (workEndHour - workStartHour) * 60;
    if (minutesFromStart < 0 || minutesFromStart > totalMinutes) return null;
    return minutesFromStart * (SLOT_HEIGHT / 30);
  }, [now, isToday, viewMode, workStartHour, workEndHour]);

  // 현재 시간 표시선이 보이도록 자동 스크롤
  const timeIndicatorRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (currentTimeTop != null && timeIndicatorRef.current && !hasScrolledRef.current) {
      timeIndicatorRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      hasScrolledRef.current = true;
    }
  }, [currentTimeTop]);
  // 날짜가 바뀌면 스크롤 플래그 리셋
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [selectedDate]);

  // selectedBlock을 ref로 추적 (handleBlockResize의 stale closure 방지)
  const selectedBlockRef = useRef(selectedBlock);
  useEffect(() => {
    selectedBlockRef.current = selectedBlock;
  }, [selectedBlock]);

  // 블록 리사이즈/이동 처리
  const handleBlockResize = useCallback(async (blockId: string, startTime: string, endTime: string) => {
    // Optimistic update: 로컬 state를 먼저 업데이트하여 깜빡임 방지
    setColumns(prev => prev.map(col => ({
      ...col,
      blocks: col.blocks.map(b =>
        b.id === blockId ? { ...b, start_time: startTime, end_time: endTime } : b
      ),
    })));

    // 선택된 블록이면 상세 패널도 즉시 업데이트
    const currentSelected = selectedBlockRef.current;
    if (currentSelected && currentSelected.id === blockId) {
      setSelectedBlock({
        ...currentSelected,
        start_time: startTime,
        end_time: endTime,
      });
    }

    try {
      await scheduleAPI.updateBlock(boardId, blockId, {
        start_time: startTime,
        end_time: endTime,
      });
    } catch (error) {
      console.error('[Schedule] Failed to update block:', error);
    } finally {
      // 성공/실패 모두 서버 데이터로 동기화 (에러 시 원래 상태 복구)
      await loadSchedule();
    }
  }, [boardId, loadSchedule]);

  return (
    <div
      className="h-full flex flex-col"
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (isDragging) {
          setIsDragging(false);
          setDragState(null);
        }
      }}
    >
      {/* 상단 날짜 네비게이션 */}
      <div className="flex items-center justify-between px-3 md:px-6 py-2 md:py-3 bg-kanban-card border-b border-kanban-border gap-2">
        <div className="flex items-center gap-2 md:gap-4 flex-wrap min-w-0">
          {/* 세부 탭: 타임블록 / 체크리스트 */}
          <div className="flex bg-kanban-bg rounded-lg p-1">
            <button
              onClick={() => {
                if (subTab !== 'timeblock') {
                  setSubTab('timeblock');
                  loadSchedule(); // 체크리스트에서 변경된 내용 반영
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${
                subTab === 'timeblock'
                  ? 'bg-bridge-accent text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('dailySchedule.timeblock')}</span>
            </button>
            <button
              onClick={() => setSubTab('checklist')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${
                subTab === 'checklist'
                  ? 'bg-bridge-accent text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('dailySchedule.checklist')}</span>
            </button>
            <button
              onClick={() => setSubTab('meeting')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all ${
                subTab === 'meeting'
                  ? 'bg-bridge-accent text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-300'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('meeting.tab')}</span>
            </button>
          </div>

          {/* 구분선 */}
          <div className="w-px h-6 bg-white/10" />

          {/* 일/주 토글 (타임블록 탭에서만 표시) */}
          {subTab === 'timeblock' && (
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
                {t('dailySchedule.day')}
              </span>
              <span
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'week'
                    ? 'bg-kanban-surface text-white'
                    : 'text-zinc-400'
                }`}
              >
                {t('dailySchedule.week')}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              className="text-zinc-400 hover:text-foreground hover:bg-white/5 h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm md:text-lg font-semibold text-foreground min-w-0 sm:min-w-[280px] text-center whitespace-nowrap">
              {viewMode === 'day'
                ? `${formatDate(selectedDate, t('dailySchedule.dateFormatDay'))} (${dayOfWeek})`
                : `${formatDate(weekDays[0], t('dailySchedule.dateFormatWeek'))} - ${formatDate(weekDays[6], t('dailySchedule.dateFormatWeek'))}`
              }
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              className="text-zinc-400 hover:text-foreground hover:bg-white/5 h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant={(viewMode === 'day' ? isToday : isTodayInWeek) ? 'default' : 'outline'}
            size="sm"
            onClick={handleToday}
            className={
              (viewMode === 'day' ? isToday : isTodayInWeek)
                ? 'bg-gradient-to-r from-[#2DD4BF] to-[#6366F1] text-white'
                : 'border-kanban-border text-zinc-300 hover:bg-white/5 hover:text-foreground'
            }
          >
            {t('dailySchedule.today')}
          </Button>
          {isLoading && <Loader2 className="h-4 w-4 text-zinc-400 animate-spin" />}
        </div>
        {(currentUserRole === 'owner' || currentUserRole === 'admin') && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettingsModal(true)}
            className="border-kanban-border text-zinc-300 hover:bg-white/5 hover:text-foreground"
          >
            <Settings className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{t('dailySchedule.settings')}</span>
          </Button>
        )}
      </div>

      {/* 세부 탭에 따른 콘텐츠 렌더링 */}
      {subTab === 'meeting' ? (
        /* 회의 탭 */
        <MeetingView
          boardId={boardId}
          selectedDate={selectedDate}
          boardMembers={activeMembers}
          onRefreshSchedule={loadSchedule}
        />
      ) : subTab === 'checklist' ? (
        /* 체크리스트 탭 */
        <DailyChecklistView
          boardId={boardId}
          boardMembers={activeMembers.map((m) => ({
            id: m.id,
            user: {
              id: m.userId,
              email: m.email,
              name: m.name,
              profile_image: m.profileImage ?? null,
            },
            role: m.role === 'owner' ? 'OWNER' : m.role === 'admin' ? 'ADMIN' : m.role === 'viewer' ? 'VIEWER' : 'MEMBER',
            joined_at: new Date().toISOString(),
            assigneeColor: m.assigneeColor ?? null,
          })) as BoardMemberType[]}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          currentUserRole={currentUserRole}
          memberColorMap={memberColorMap}
          refreshTrigger={refreshTrigger}
        />
      ) : (
      /* 타임블록 탭 - 스케줄 그리드 */
      <>
      <div className="flex-1 overflow-auto">
        {viewMode === 'day' ? (
          /* 일 단위 뷰 */
          <div className="min-w-max">
            {/* 헤더: 시간/블록 + 멤버 컬럼 */}
            <div className="flex sticky top-0 bg-kanban-card z-10 border-b border-kanban-border">
              <div className="w-14 md:w-20 flex-shrink-0 p-2 md:p-3 text-xs md:text-sm font-medium text-zinc-400 border-r border-kanban-border">
                {displayMode === 'block' ? t('dailySchedule.block') : t('dailySchedule.time')}
              </div>
              {activeMembers.map((member) => (
                <div
                  key={member.userId}
                  className="w-36 md:w-48 flex-shrink-0 p-2 md:p-3 border-r border-kanban-border"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-medium"
                      style={{ backgroundColor: getAssigneeHex(member.name, member.assigneeColor) }}
                    >
                      {getInitials(member.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate block">{member.name}</span>
                      <button
                        onClick={() => setSummaryMember(member)}
                        className="text-[10px] text-bridge-accent hover:text-bridge-accent/80 transition-colors mt-0.5"
                      >
                        {t('dailySummary.summaryButton')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {activeMembers.length === 0 && (
                <div className="flex-1 p-3 text-zinc-400 text-sm">{t('dailySchedule.noMembers')}</div>
              )}
            </div>

            {/* 데일리 체크리스트 요약 영역 */}
            {dailyChecklists.length > 0 && (
              <div className="flex border-b border-kanban-border bg-white/[0.02]">
                <div className="w-14 md:w-20 flex-shrink-0 p-2 text-xs text-zinc-400 border-r border-kanban-border flex items-center justify-center">
                  <CheckSquare className="h-3.5 w-3.5" />
                </div>
                {activeMembers.map((member) => {
                  const memberChecklist = dailyChecklists.find(
                    (c) => c.user.id === member.userId
                  );
                  const items = memberChecklist?.items || [];
                  const completedCount = items.filter((i) => i.completed).length;
                  const totalCount = items.length;

                  return (
                    <div
                      key={`checklist-${member.userId}`}
                      className="w-36 md:w-48 flex-shrink-0 p-2 border-r border-kanban-border"
                    >
                      {totalCount > 0 ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">{t('dailySchedule.todayChecklist')}</span>
                            <span className={`font-medium ${completedCount === totalCount ? 'text-green-400' : 'text-bridge-accent'}`}>
                              {completedCount}/{totalCount}
                            </span>
                          </div>
                          <div className="space-y-0.5 mt-1">
                            {items.slice(0, 4).map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-1.5"
                              >
                                <div
                                  className={`w-3 h-3 rounded flex-shrink-0 flex items-center justify-center ${
                                    item.completed
                                      ? 'bg-green-500/30 border border-green-500/50'
                                      : 'border border-white/20 bg-white/5'
                                  }`}
                                >
                                  {item.completed && (
                                    <Check className="h-2 w-2 text-green-400" />
                                  )}
                                </div>
                                <span
                                  className={`text-[10px] truncate ${
                                    item.completed
                                      ? 'text-green-400/70 line-through'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {item.title}
                                </span>
                              </div>
                            ))}
                            {items.length > 4 && (
                              <div className="text-[10px] text-slate-400 pl-4">
                                {t('dailySchedule.moreItems', { count: items.length - 4 })}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 text-center py-1">
                          {t('dailySchedule.noChecklist')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 시간 그리드 */}
            <div className="relative">
              {timeSlots.map((time, slotIndex) => {
                const isBreak = isBreakSlot(time);
                return (
                <div key={time} className={`flex border-b border-kanban-border ${isBreak ? 'bg-amber-900/5' : ''}`} style={{ height: `${SLOT_HEIGHT}px` }}>
                  {/* 시간/블록 라벨 */}
                  <div className={`w-14 md:w-20 flex-shrink-0 p-2 text-xs border-r border-kanban-border bg-kanban-bg ${isBreak ? 'text-amber-500/50' : 'text-zinc-400'}`}>
                    {displayMode === 'block'
                      ? `${slotIndex + 1}`
                      : time.endsWith(':00') ? time : ''}
                  </div>
                  {/* 멤버별 시간 셀 */}
                  {activeMembers.map((member) => {
                    const isSelected = isSlotSelected(member.userId, slotIndex);
                    return (
                      <div
                        key={`${member.userId}-${time}`}
                        className={`w-36 md:w-48 flex-shrink-0 border-r border-kanban-border transition-colors group relative h-full ${
                          isBreak ? (isDragging ? 'cursor-pointer' : 'cursor-not-allowed') : isViewer ? 'cursor-default' : 'cursor-pointer'
                        } ${
                          isBreak
                            ? (isSelected ? 'bg-[#2DD4BF]/5' : '')
                            : isSelected ? 'bg-[#2DD4BF]/20' : isViewer ? '' : 'hover:bg-white/5'
                        }`}
                        onMouseDown={isBreak ? undefined : (e) => handleMouseDown(e, member.userId, slotIndex)}
                        onMouseEnter={(isBreak && !isDragging) ? undefined : () => handleMouseEnter(member.userId, slotIndex)}
                      >
                        {/* 점심시간 빗금 오버레이 */}
                        {isBreak && (
                          <div
                            className="absolute inset-0 opacity-20 pointer-events-none"
                            style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(245,158,11,0.15) 4px, rgba(245,158,11,0.15) 8px)' }}
                          />
                        )}
                        {/* 빈 셀 호버 시 + 버튼 표시 (Viewer 제외, 점심시간 제외) */}
                        {!isBreak && !isSelected && !isViewer && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <Plus className="h-4 w-4 text-zinc-400" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {activeMembers.length === 0 && (
                    <div className="flex-1 border-r border-kanban-border h-full" />
                  )}
                </div>
                );
              })}

              {/* 현재 시간 표시선 */}
              {currentTimeTop != null && (
                <div
                  ref={timeIndicatorRef}
                  className="absolute left-0 right-0 z-[5] pointer-events-none flex items-center"
                  style={{ top: `${currentTimeTop}px` }}
                >
                  {/* 왼쪽 시간 라벨 */}
                  <div className="w-14 md:w-20 flex-shrink-0 flex justify-end pr-1">
                    <span className="text-[10px] font-bold text-red-400 bg-red-500/20 px-1 rounded">
                      {now.getHours().toString().padStart(2, '0')}:{now.getMinutes().toString().padStart(2, '0')}
                    </span>
                  </div>
                  {/* 빨간 선 */}
                  <div className="flex-1 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                    <div className="flex-1 h-[2px] bg-red-500/70" />
                  </div>
                </div>
              )}

              {/* 스케줄 블록들 (각 멤버 컬럼 위에 absolute로 배치) */}
              <div className="absolute top-0 left-14 md:left-20 right-0 pointer-events-none">
                <div className="flex">
                  {activeMembers.map((member) => {
                    const blocks = blocksByUser.get(member.userId) || [];
                    return (
                      <div
                        key={member.userId}
                        className="w-36 md:w-48 flex-shrink-0 relative"
                        style={{ height: `${timeSlots.length * SLOT_HEIGHT}px` }}
                      >
                        {blocks.map((block) => (
                          <ScheduleBlock
                            key={block.id}
                            block={block}
                            slotHeight={SLOT_HEIGHT}
                            workStartHour={workStartHour}
                            workEndHour={workEndHour}
                            otherBlocks={blocks}
                            breakStartTime={settings?.break_start_time}
                            breakEndTime={settings?.break_end_time}
                            onClick={handleBlockClick}
                            onResize={handleBlockResize}
                            onMove={handleBlockResize}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 주 단위 뷰 */
          <div className="min-w-max">
            {/* 헤더: 멤버 + 요일 */}
            <div className="flex sticky top-0 bg-kanban-card z-10 border-b border-kanban-border">
              <div className="w-24 md:w-32 flex-shrink-0 p-2 md:p-3 text-xs md:text-sm font-medium text-zinc-400 border-r border-kanban-border">
                멤버
              </div>
              {weekDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isCurrentDay = dateStr === format(new Date(), 'yyyy-MM-dd');
                return (
                  <div
                    key={dateStr}
                    className={`w-28 md:w-36 flex-shrink-0 p-2 md:p-3 border-r border-kanban-border text-center ${
                      isCurrentDay ? 'bg-[#2DD4BF]/10' : ''
                    }`}
                  >
                    <div className={`text-sm font-medium ${isCurrentDay ? 'text-[#2DD4BF]' : 'text-foreground'}`}>
                      {formatDate(day, 'E')}
                    </div>
                    <div className={`text-xs ${isCurrentDay ? 'text-[#2DD4BF]' : 'text-zinc-400'}`}>
                      {formatDate(day, 'M/d')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 멤버별 행 */}
            {activeMembers.map((member) => (
              <div key={member.userId} className="flex border-b border-kanban-border">
                {/* 멤버 정보 */}
                <div className="w-24 md:w-32 flex-shrink-0 p-2 md:p-3 border-r border-kanban-border bg-kanban-bg">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-medium"
                      style={{ backgroundColor: getAssigneeHex(member.name, member.assigneeColor) }}
                    >
                      {getInitials(member.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate block">{member.name}</span>
                      <button
                        onClick={() => setSummaryMember(member)}
                        className="text-[10px] text-bridge-accent hover:text-bridge-accent/80 transition-colors mt-0.5"
                      >
                        요약
                      </button>
                    </div>
                  </div>
                </div>
                {/* 요일별 블록들 */}
                {weekDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isCurrentDay = dateStr === format(new Date(), 'yyyy-MM-dd');
                  const dayColumns = weeklyData.get(dateStr) || [];
                  const memberColumn = dayColumns.find((col) => col.user.id === member.userId);
                  const blocks = memberColumn?.blocks || [];

                  return (
                    <div
                      key={dateStr}
                      className={`w-28 md:w-36 flex-shrink-0 p-2 border-r border-kanban-border min-h-[100px] ${
                        isCurrentDay ? 'bg-[#2DD4BF]/8' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        {blocks.map((block) => {
                          const isCompleted = block.checklist_item?.completed ?? false;
                          const dueDate = block.checklist_item?.due_date ? new Date(block.checklist_item.due_date) : null;
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const threeDaysLater = new Date(today);
                          threeDaysLater.setDate(today.getDate() + 3);

                          let blockBg = 'bg-blue-500/30 hover:bg-blue-500/50';
                          let timeColor = 'text-blue-200';
                          if (isCompleted) {
                            blockBg = 'bg-green-500/30 hover:bg-green-500/50';
                            timeColor = 'text-green-200';
                          } else if (dueDate && dueDate < today) {
                            blockBg = 'bg-red-500/30 hover:bg-red-500/50';
                            timeColor = 'text-red-200';
                          } else if (dueDate && dueDate <= threeDaysLater) {
                            blockBg = 'bg-yellow-500/30 hover:bg-yellow-500/50';
                            timeColor = 'text-yellow-200';
                          }

                          return (
                          <div
                            key={block.id}
                            onClick={() => handleBlockClick(block)}
                            className={`p-2 rounded ${blockBg} cursor-pointer transition-colors`}
                          >
                            <div className={`text-xs text-white font-medium truncate ${isCompleted ? 'line-through opacity-70' : ''}`}>
                              {block.checklist_item?.title || '(제목 없음)'}
                            </div>
                            <div className={`text-xs ${timeColor}`}>
                              {block.start_time.slice(0, 5)} - {block.end_time.slice(0, 5)}
                            </div>
                          </div>
                          );
                        })}
                        {blocks.length === 0 && (
                          <div className="text-xs text-zinc-400 text-center py-4">-</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {activeMembers.length === 0 && (
              <div className="p-6 text-zinc-400 text-center">{t('dailySchedule.noMembers')}</div>
            )}
          </div>
        )}
      </div>

      {/* 하단 안내 */}
      <div className="px-3 md:px-6 py-2 md:py-3 bg-kanban-card border-t border-kanban-border">
        <p className="text-sm text-zinc-400">
          {isViewer
            ? t('dailySchedule.viewerGuide')
            : viewMode === 'day'
            ? t('dailySchedule.dragGuide')
            : t('dailySchedule.clickGuide')
          }
        </p>
      </div>
      </>
      )}

      {/* 블록 상세 패널 (타임블록 탭에서만) */}
      {subTab === 'timeblock' && selectedBlock && (
        <ScheduleDetailPanel
          block={selectedBlock}
          boardId={boardId}
          selectedDate={selectedDate}
          displayMode={displayMode}
          workStartHour={workStartHour}
          onClose={handleClosePanel}
          onDelete={handleBlockDeleted}
          onChecklistToggle={handleChecklistToggled}
          onViewFeature={onViewFeature}
          onViewTask={onViewTask}
        />
      )}

      {/* 체크리스트 모달 (타임블록 탭에서만, 선택 + 생성 통합) */}
      {subTab === 'timeblock' && pendingBlock && showChecklistModal && (
        <ChecklistCreateModal
          boardId={boardId}
          assigneeId={pendingBlock.userId}
          startTime={pendingBlock.startTime}
          endTime={pendingBlock.endTime}
          selectedDate={format(selectedDate, 'yyyy-MM-dd')}
          displayMode={displayMode}
          startBlockIndex={pendingBlock.startSlotIndex}
          endBlockIndex={pendingBlock.endSlotIndex}
          splitBlocks={pendingBlock.splitBlocks}
          onCreate={handleChecklistCreate}
          onSelectExisting={handleChecklistItemSelect}
          onSelectBoardItem={handleBoardChecklistItemSelect}
          onSelectMeeting={handleMeetingSelect}
          onClose={handleCloseChecklistModal}
        />
      )}

      {/* 설정 모달 (타임블록 탭에서만) */}
      {subTab === 'timeblock' && showSettingsModal && settings && (
        <ScheduleSettingsModal
          currentStartTime={settings.work_start_time}
          currentWorkHours={settings.work_hours_per_day}
          currentDisplayMode={displayMode}
          currentBreakStartTime={settings.break_start_time}
          currentBreakEndTime={settings.break_end_time}
          onSave={async (startTime, workHours, newDisplayMode, breakStart, breakEnd) => {
            try {
              await scheduleAPI.updateSettings(boardId, {
                work_start_time: startTime,
                work_hours_per_day: workHours,
                schedule_display_mode: newDisplayMode === 'block' ? 'BLOCK' : 'TIME',
                break_start_time: breakStart,
                break_end_time: breakEnd,
              });
              await loadSchedule();
              setShowSettingsModal(false);
            } catch (error) {
              console.error('Failed to update settings:', error);
            }
          }}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* 주간 요약 모달 */}
      {summaryMember && viewMode === 'week' && (
        <WeeklySummaryModal
          boardId={boardId}
          member={summaryMember}
          weekDays={weekDays}
          weeklyData={weeklyData}
          onClose={() => setSummaryMember(null)}
        />
      )}

      {/* 일일 요약 모달 */}
      {summaryMember && viewMode === 'day' && (
        <DailySummaryModal
          boardId={boardId}
          member={summaryMember}
          selectedDate={selectedDate}
          blocks={blocksByUser.get(summaryMember.userId) || []}
          onClose={() => setSummaryMember(null)}
        />
      )}
    </div>
  );
}
