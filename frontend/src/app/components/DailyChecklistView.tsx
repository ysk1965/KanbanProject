import { useState, useCallback, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Calendar, AlertCircle, Users } from 'lucide-react';
import { format, addDays, subDays, startOfDay, isToday, isBefore } from 'date-fns';
import { formatDate } from '../utils/dateUtils';
import { useTranslation } from 'react-i18next';
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
  memberColorMap?: Record<string, string | null>;
}

export function DailyChecklistView({
  boardId,
  boardMembers,
  selectedDate,
  onDateChange,
  currentUserRole,
  memberColorMap,
}: DailyChecklistViewProps) {
  const { t } = useTranslation();
  const [columns, setColumns] = useState<DailyChecklistColumnResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 추가 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalAssigneeId, setAddModalAssigneeId] = useState<string>('');

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
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await dailyChecklistAPI.getDailyChecklist(boardId, dateStr);
      setColumns(response.columns);
    } catch (err) {
      console.error('Failed to load daily checklist:', err);
      setError(t('dailyChecklistView.loadFailed'));
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
  }, [boardId, selectedDate, boardMembers]);

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
    <div className="h-full flex flex-col bg-kanban-bg">
      {/* 상단 네비게이션 */}
      <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 bg-kanban-card border-b border-kanban-border gap-2">
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
                ? 'bg-gradient-to-r from-[#2DD4BF] to-[#6366F1] text-white'
                : 'border-white/20 text-slate-300 hover:bg-white/5 hover:text-white'
            }
          >
            <Calendar className="h-4 w-4 mr-2" />
            {t('dailyChecklistView.today')}
          </Button>

          {isLoading && <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />}

          {isReadOnly && (
            <span className="px-3 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 rounded-full border border-amber-500/20">
              {isViewer ? t('dailyChecklistView.viewerRole') : t('dailyChecklistView.readOnly')}
            </span>
          )}
        </div>

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
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* 멤버가 없는 경우 */}
      {boardMembers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">{t('dailyChecklistView.noMembers')}</h3>
          <p className="text-sm text-slate-400 max-w-md">
            {t('dailyChecklistView.inviteMembers')}
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
                assigneeColor={memberColorMap?.[column.user.id] ?? null}
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
      <div className="px-3 md:px-6 py-2 md:py-3 bg-kanban-card border-t border-kanban-border">
        <p className="text-sm text-slate-400">
          {isViewer
            ? t('dailyChecklistView.viewerGuide')
            : isReadOnly
            ? t('dailyChecklistView.readOnlyGuide')
            : t('dailyChecklistView.editGuide')}
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
