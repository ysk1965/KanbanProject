import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Calendar, AlertCircle, Users } from 'lucide-react';
import { format, addDays, subDays, startOfDay, isToday, isBefore } from 'date-fns';
import { formatDate } from '../utils/dateUtils';
import { Button } from './ui/button';
import { DailyChecklistColumn } from './DailyChecklistColumn';
import { AddDailyChecklistModal } from './AddDailyChecklistModal';
import { dailyChecklistAPI, DailyChecklistColumnResponse } from '../utils/api';
import { BoardMember, DailyChecklistItem } from '../types';

interface DailyChecklistViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  currentUserRole?: string;
}

// Mock 데이터 생성 함수 (BE 완료 전 테스트용)
const generateMockData = (
  boardMembers: BoardMember[],
  date: Date
): DailyChecklistColumnResponse[] => {
  const dateStr = format(date, 'yyyy-MM-dd');
  return boardMembers.map((member) => ({
    user: {
      id: member.user.id,
      name: member.user.name,
      profile_image: member.user.profile_image || null,
    },
    items: [
      {
        id: `${member.user.id}-1-${dateStr}`,
        checklist_item_id: 'mock-cl-1',
        title: '로그인 기능 구현',
        assignee: {
          id: member.user.id,
          name: member.user.name,
          profile_image: member.user.profile_image || null,
        },
        assigned_date: dateStr,
        position: 0,
        completed: false,
        task: { id: 'task-1', title: '사용자 인증 시스템' },
        feature: { id: 'feature-1', title: '인증', color: '#6366f1' },
        created_at: new Date().toISOString(),
      },
      {
        id: `${member.user.id}-2-${dateStr}`,
        checklist_item_id: 'mock-cl-2',
        title: 'API 문서 작성',
        assignee: {
          id: member.user.id,
          name: member.user.name,
          profile_image: member.user.profile_image || null,
        },
        assigned_date: dateStr,
        position: 1,
        completed: true,
        task: { id: 'task-2', title: 'API 개발' },
        feature: { id: 'feature-2', title: '백엔드', color: '#22c55e' },
        created_at: new Date().toISOString(),
      },
    ],
  }));
};

export function DailyChecklistView({
  boardId,
  boardMembers,
  selectedDate,
  onDateChange,
  currentUserRole,
}: DailyChecklistViewProps) {
  const [columns, setColumns] = useState<DailyChecklistColumnResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 추가 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalAssigneeId, setAddModalAssigneeId] = useState<string>('');

  // Mock 데이터 사용 여부 (BE 완료 전 테스트용)
  const [useMockData, setUseMockData] = useState(false);

  // 과거 날짜 또는 Viewer 권한 (읽기 전용)
  const isViewer = currentUserRole === 'viewer';
  const isReadOnly = useMemo(() => {
    if (isViewer) return true;
    const today = startOfDay(new Date());
    return isBefore(selectedDate, today);
  }, [selectedDate, isViewer]);

  // 데이터 로드
  const loadData = useCallback(async () => {
    if (!boardId) return;

    setIsLoading(true);
    setError(null);

    try {
      if (useMockData) {
        // Mock 데이터 사용
        const mockColumns = generateMockData(boardMembers, selectedDate);
        setColumns(mockColumns);
      } else {
        // 실제 API 호출
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const response = await dailyChecklistAPI.getDailyChecklist(boardId, dateStr);
        setColumns(response.columns);
      }
    } catch (err) {
      console.error('Failed to load daily checklist:', err);
      setError('데이터를 불러오는데 실패했습니다.');
      // 에러 시 빈 컬럼으로 멤버 표시
      setColumns(
        boardMembers.map((member) => ({
          user: {
            id: member.user.id,
            name: member.user.name,
            profile_image: member.user.profile_image || null,
          },
          items: [],
        }))
      );
    } finally {
      setIsLoading(false);
    }
  }, [boardId, selectedDate, boardMembers, useMockData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 날짜 네비게이션
  const handlePrev = () => onDateChange(subDays(selectedDate, 1));
  const handleNext = () => onDateChange(addDays(selectedDate, 1));
  const handleToday = () => onDateChange(startOfDay(new Date()));

  const isTodaySelected = isToday(selectedDate);
  const dayOfWeek = formatDate(selectedDate, 'EEEE');

  // 추가 모달 열기
  const handleOpenAddModal = (assigneeId: string) => {
    setAddModalAssigneeId(assigneeId);
    setShowAddModal(true);
  };

  // 추가 완료 후 처리
  const handleItemAdded = () => {
    setShowAddModal(false);
    loadData();
  };

  // 컬럼 데이터를 멤버 기준으로 정렬
  const sortedColumns = useMemo(() => {
    const columnMap = new Map(columns.map((col) => [col.user.id, col]));
    return boardMembers.map((member) => {
      const column = columnMap.get(member.user.id);
      return {
        user: {
          id: member.user.id,
          name: member.user.name,
          profile_image: member.user.profile_image || null,
        },
        items: column?.items || [],
      };
    });
  }, [columns, boardMembers]);

  return (
    <div className="h-full flex flex-col bg-bridge-dark">
      {/* 상단 네비게이션 */}
      <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 bg-bridge-obsidian border-b border-white/15 gap-2">
        <div className="flex items-center gap-2 md:gap-4 flex-wrap min-w-0">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              className="text-slate-400 hover:text-white hover:bg-white/5 h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm md:text-lg font-semibold text-white min-w-0 sm:min-w-[280px] text-center whitespace-nowrap">
              {formatDate(selectedDate, 'yyyy년 M월 d일')} ({dayOfWeek})
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              className="text-slate-400 hover:text-white hover:bg-white/5 h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant={isTodaySelected ? 'default' : 'outline'}
            size="sm"
            onClick={handleToday}
            className={
              isTodaySelected
                ? 'bg-bridge-accent hover:bg-bridge-accent/90 text-white'
                : 'border-white/20 text-slate-300 hover:bg-white/5 hover:text-white'
            }
          >
            <Calendar className="h-4 w-4 mr-2" />
            오늘
          </Button>

          {isLoading && <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />}

          {isReadOnly && (
            <span className="px-3 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 rounded-full border border-amber-500/20">
              {isViewer ? 'Viewer 권한' : '읽기 전용'}
            </span>
          )}
        </div>

        {/* Mock 데이터 토글 (개발용) */}
        {process.env.NODE_ENV === 'development' && (
          <button
            onClick={() => setUseMockData(!useMockData)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              useMockData
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-white/5 text-slate-400 border border-white/20'
            }`}
          >
            {useMockData ? 'Mock ON' : 'Mock OFF'}
          </button>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="mx-3 md:mx-6 mt-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={loadData}
            className="ml-auto text-xs text-red-400 hover:text-red-300 underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 멤버가 없는 경우 */}
      {boardMembers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">멤버가 없습니다</h3>
          <p className="text-sm text-slate-400 max-w-md">
            보드에 멤버를 초대하면 데일리 체크리스트를 사용할 수 있습니다.
          </p>
        </div>
      ) : (
        /* 컬럼 그리드 */
        <div className="flex-1 overflow-x-auto p-3 md:p-6">
          <div className="flex gap-3 md:gap-4 min-w-max">
            {sortedColumns.map((column) => (
              <DailyChecklistColumn
                key={column.user.id}
                boardId={boardId}
                user={column.user}
                items={column.items as DailyChecklistItem[]}
                selectedDate={selectedDate}
                isReadOnly={isReadOnly}
                onItemAdded={loadData}
                onItemRemoved={loadData}
                onPositionChanged={loadData}
                onAddClick={() => handleOpenAddModal(column.user.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 하단 안내 */}
      <div className="px-3 md:px-6 py-2 md:py-3 bg-bridge-obsidian border-t border-white/15">
        <p className="text-sm text-slate-400">
          {isViewer
            ? 'Viewer 권한은 체크리스트를 조회만 할 수 있습니다.'
            : isReadOnly
            ? '과거 날짜의 체크리스트는 읽기 전용입니다.'
            : '드래그하여 우선순위를 변경하거나, + 버튼으로 새 항목을 추가하세요.'}
        </p>
      </div>

      {/* 추가 모달 */}
      {showAddModal && addModalAssigneeId && (
        <AddDailyChecklistModal
          boardId={boardId}
          assigneeId={addModalAssigneeId}
          assignedDate={format(selectedDate, 'yyyy-MM-dd')}
          onAdd={handleItemAdded}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
