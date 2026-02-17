import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, ChevronDown, Folder, FileText, Loader2, CheckSquare, Layers, Plus, ClipboardList } from 'lucide-react';
import { format, parseISO, isToday as isDateToday } from 'date-fns';
import { featureAPI, taskAPI, dailyChecklistAPI, FeatureResponse, TaskResponse, DailyChecklistItemResponse, BoardChecklistItemResponse, MeetingSummary } from '../utils/api';

interface ChecklistCreateModalProps {
  boardId: string;
  assigneeId: string;
  startTime: string;
  endTime: string;
  selectedDate?: string; // yyyy-MM-dd format
  displayMode: 'time' | 'block';
  startBlockIndex?: number;
  endBlockIndex?: number;
  splitBlocks?: Array<{ startTime: string; endTime: string }>;
  onCreate: (taskId: string, title: string) => void;
  onSelectExisting: (checklistItemId: string) => void;
  onSelectBoardItem: (checklistItemId: string) => void;
  onSelectMeeting?: (meetingId: string) => void;
  onClose: () => void;
}

export function ChecklistCreateModal({
  boardId,
  assigneeId,
  startTime,
  endTime,
  selectedDate,
  displayMode,
  startBlockIndex,
  endBlockIndex,
  splitBlocks,
  onCreate,
  onSelectExisting,
  onSelectBoardItem,
  onSelectMeeting,
  onClose,
}: ChecklistCreateModalProps) {
  const { t } = useTranslation();

  // 선택된 날짜 계산
  const targetDate = selectedDate || format(new Date(), 'yyyy-MM-dd');
  const targetDateObj = parseISO(targetDate);
  const isTargetToday = isDateToday(targetDateObj);
  const dateLabel = isTargetToday
    ? t('dailySchedule.todayLabel')
    : format(targetDateObj, 'M/d');

  // 해당 날짜의 체크리스트 (먼저 표시)
  const [todayChecklists, setTodayChecklists] = useState<DailyChecklistItemResponse[]>([]);
  const [isLoadingToday, setIsLoadingToday] = useState(true);

  // 보드 체크리스트 항목 (기존 항목)
  const [boardItems, setBoardItems] = useState<BoardChecklistItemResponse[]>([]);
  const [isLoadingBoardItems, setIsLoadingBoardItems] = useState(true);

  // 오늘의 회의 목록
  const [todayMeetings, setTodayMeetings] = useState<MeetingSummary[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(true);

  // 새로 생성 모드 토글
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [features, setFeatures] = useState<FeatureResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  const [selectedFeatureId, setSelectedFeatureId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [title, setTitle] = useState('');

  const [isFeatureDropdownOpen, setIsFeatureDropdownOpen] = useState(false);
  const [isTaskDropdownOpen, setIsTaskDropdownOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 타임블록 데이터 통합 로드 (데일리 체크리스트 + 보드 체크리스트 + 회의)
  useEffect(() => {
    const loadTimeblockData = async () => {
      setIsLoadingToday(true);
      setIsLoadingBoardItems(true);
      setIsLoadingMeetings(true);
      try {
        const data = await dailyChecklistAPI.getTimeblockData(boardId, targetDate, assigneeId);
        setTodayChecklists(data.daily_checklist_items || []);
        setBoardItems(data.board_checklist_items || []);
        setTodayMeetings(data.meetings || []);
      } catch (error) {
        console.error('Failed to load timeblock data:', error);
        setTodayChecklists([]);
        setBoardItems([]);
        setTodayMeetings([]);
      } finally {
        setIsLoadingToday(false);
        setIsLoadingBoardItems(false);
        setIsLoadingMeetings(false);
      }
    };
    loadTimeblockData();
  }, [boardId, assigneeId, targetDate]);

  // 기존 항목 필터링: 완료 항목 제외, 오늘의 체크리스트에 이미 있는 항목 제외
  const filteredBoardItems = useMemo(() => {
    const todayItemIds = new Set(
      todayChecklists
        .map((item) => item.checklist_item_id)
        .filter(Boolean)
    );
    return boardItems.filter(
      (item) => !item.completed && !todayItemIds.has(item.id)
    );
  }, [boardItems, todayChecklists]);

  // Feature 목록 로드 (새로 생성 모드일 때만)
  useEffect(() => {
    if (!showCreateForm) return;

    const loadFeatures = async () => {
      setIsLoadingFeatures(true);
      try {
        const response = await featureAPI.getFeatures(boardId);
        setFeatures(response.features);
      } catch (error) {
        console.error('Failed to load features:', error);
      } finally {
        setIsLoadingFeatures(false);
      }
    };
    loadFeatures();
  }, [boardId, showCreateForm]);

  // Feature 선택 시 Task 목록 로드
  useEffect(() => {
    if (!selectedFeatureId) {
      setTasks([]);
      setSelectedTaskId('');
      return;
    }

    const loadTasks = async () => {
      setIsLoadingTasks(true);
      try {
        const response = await taskAPI.getTasks(boardId, { feature_id: selectedFeatureId });
        setTasks(response.tasks);
        setSelectedTaskId('');
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        setIsLoadingTasks(false);
      }
    };
    loadTasks();
  }, [boardId, selectedFeatureId]);

  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selectedFeatureId),
    [features, selectedFeatureId]
  );

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId),
    [tasks, selectedTaskId]
  );

  const canSubmit = selectedTaskId && title.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      onCreate(selectedTaskId, title.trim());
    } catch (error) {
      console.error('Failed to create checklist item:', error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-bridge-dark rounded-2xl shadow-2xl w-[560px] min-h-[700px] max-h-[90vh] flex flex-col overflow-hidden border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">{t('dailySchedule.addTimeblock')}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Time/Block Display */}
        <div className="px-6 py-3 border-b border-white/10">
          <div className="bg-bridge-accent/20 rounded-xl px-4 py-2.5 flex items-center gap-3 border border-bridge-accent/30">
            {displayMode === 'block' ? (
              <>
                <Layers className="h-4 w-4 text-bridge-accent" />
                <span className="text-bridge-accent font-medium text-sm">
                  {startBlockIndex !== undefined && endBlockIndex !== undefined
                    ? startBlockIndex === endBlockIndex
                      ? t('dailySchedule.blockN', { n: startBlockIndex + 1 })
                      : t('dailySchedule.blockRange', { start: startBlockIndex + 1, end: endBlockIndex + 1 })
                    : t('dailySchedule.selectBlock')}
                </span>
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-bridge-accent flex-shrink-0" />
                <span className="text-bridge-accent font-medium text-sm">
                  <span className="font-bold">{format(targetDateObj, 'M/d')}</span>
                  {' '}
                  {splitBlocks && splitBlocks.length > 1
                    ? splitBlocks.map((seg, i) => (
                        <span key={i}>
                          {i > 0 && ', '}
                          {seg.startTime} - {seg.endTime}
                        </span>
                      ))
                    : `${startTime} - ${endTime}`
                  }
                </span>
              </>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* 오늘의 회의에서 선택 */}
          {onSelectMeeting && (
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                <FileText className="inline h-4 w-4 mr-1 text-purple-400" />
                {t('meeting.selectMeeting', { date: dateLabel })}
              </label>
              <div className="border border-white/10 rounded-xl max-h-48 overflow-y-auto bg-bridge-surface">
                {isLoadingMeetings ? (
                  <div className="px-4 py-4 text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.loading')}
                  </div>
                ) : todayMeetings.length === 0 ? (
                  <div className="px-4 py-4 text-slate-400 text-sm text-center">
                    {t('dailySchedule.noMeetingsForDate', { date: dateLabel })}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {todayMeetings.map(meeting => (
                      <button
                        key={meeting.id}
                        onClick={() => onSelectMeeting(meeting.id)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bridge-accent/10 transition-colors text-left group"
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: meeting.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{meeting.title}</div>
                          {meeting.start_time && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {meeting.start_time.slice(0, 5)}
                              {meeting.end_time ? ` - ${meeting.end_time.slice(0, 5)}` : ''}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-bridge-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          {t('dailySchedule.select')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 오늘의 체크리스트 (먼저 표시) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              <CheckSquare className="inline h-4 w-4 mr-1 text-bridge-accent" />
              {t('dailySchedule.selectFromToday', { date: dateLabel })}
            </label>
            <div className="border border-white/10 rounded-xl max-h-64 overflow-y-auto bg-bridge-surface">
              {isLoadingToday ? (
                <div className="px-4 py-6 text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : todayChecklists.length === 0 ? (
                <div className="px-4 py-6 text-slate-400 text-sm text-center">
                  {t('dailySchedule.noTodayChecklist', { date: dateLabel })}
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {todayChecklists.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onSelectExisting(item.checklist_item_id)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bridge-accent/10 transition-colors text-left group"
                    >
                      <div className="w-4 h-4 rounded border border-white/20 flex-shrink-0 group-hover:border-bridge-accent/50" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{item.title}</div>
                        {item.feature && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: item.feature.color }}
                            />
                            <span className="text-[10px] text-slate-400 truncate">
                              {item.feature.title} · {item.task?.title}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-bridge-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        {t('dailySchedule.select')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 기존 항목에서 선택 */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              <ClipboardList className="inline h-4 w-4 mr-1 text-bridge-secondary" />
              {t('dailySchedule.selectFromBoard')}
            </label>
            <div className="border border-white/10 rounded-xl max-h-48 overflow-y-auto bg-bridge-surface">
              {isLoadingBoardItems ? (
                <div className="px-4 py-6 text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </div>
              ) : filteredBoardItems.length === 0 ? (
                <div className="px-4 py-6 text-slate-400 text-sm text-center">
                  {t('dailySchedule.noBoardItems')}
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filteredBoardItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onSelectBoardItem(item.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bridge-accent/10 transition-colors text-left group"
                    >
                      <div className="w-4 h-4 rounded border border-white/20 flex-shrink-0 group-hover:border-bridge-secondary/50" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">{item.title}</div>
                        {item.feature && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: item.feature.color }}
                            />
                            <span className="text-[10px] text-slate-400 truncate">
                              {item.feature.title} · {item.task?.title}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-bridge-secondary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        {t('dailySchedule.select')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 구분선 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-white/10" />
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {showCreateForm ? t('dailySchedule.collapse') : t('dailySchedule.createNew')}
            </button>
            <div className="flex-1 border-t border-white/10" />
          </div>

          {/* 새로 생성 폼 (토글) */}
          {showCreateForm && (
            <>
              {/* Feature Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <Folder className="inline h-4 w-4 mr-1 text-amber-500" />
                  Feature
                </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsFeatureDropdownOpen(!isFeatureDropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-bridge-surface border border-white/10 rounded-xl text-left hover:border-white/20 transition-colors"
              >
                {isLoadingFeatures ? (
                  <span className="text-slate-400 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </span>
                ) : selectedFeature ? (
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedFeature.color }}
                    />
                    <span className="text-white">{selectedFeature.title}</span>
                  </div>
                ) : (
                  <span className="text-slate-400">{t('dailySchedule.selectFeature')}</span>
                )}
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isFeatureDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isFeatureDropdownOpen && !isLoadingFeatures && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-bridge-surface border border-white/10 rounded-xl shadow-xl z-10 max-h-72 overflow-y-auto">
                  {features.length === 0 ? (
                    <div className="px-4 py-3 text-slate-400 text-sm">{t('dailySchedule.noFeatures')}</div>
                  ) : (
                    features.map((feature) => (
                      <button
                        key={feature.id}
                        onClick={() => {
                          setSelectedFeatureId(feature.id);
                          setIsFeatureDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors ${
                          feature.id === selectedFeatureId ? 'bg-bridge-accent/20' : ''
                        }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: feature.color }}
                        />
                        <span className="text-white">{feature.title}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Task Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              <FileText className="inline h-4 w-4 mr-1 text-bridge-accent" />
              Task
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => selectedFeatureId && setIsTaskDropdownOpen(!isTaskDropdownOpen)}
                disabled={!selectedFeatureId}
                className={`w-full flex items-center justify-between px-4 py-3 bg-bridge-surface border border-white/10 rounded-xl text-left transition-colors ${
                  !selectedFeatureId ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/20'
                }`}
              >
                {isLoadingTasks ? (
                  <span className="text-slate-400 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </span>
                ) : selectedTask ? (
                  <span className="text-white">{selectedTask.title}</span>
                ) : (
                  <span className="text-slate-400">
                    {selectedFeatureId ? t('dailySchedule.selectTask') : t('dailySchedule.selectFeatureFirst')}
                  </span>
                )}
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isTaskDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isTaskDropdownOpen && !isLoadingTasks && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-bridge-surface border border-white/10 rounded-xl shadow-xl z-10 max-h-72 overflow-y-auto">
                  {tasks.length === 0 ? (
                    <div className="px-4 py-3 text-slate-400 text-sm">{t('dailySchedule.noTasks')}</div>
                  ) : (
                    tasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setIsTaskDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-white/5 transition-colors ${
                          task.id === selectedTaskId ? 'bg-bridge-accent/20' : ''
                        }`}
                      >
                        <span className="text-white">{task.title}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

              {/* 새 체크리스트 생성 */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {t('dailySchedule.newChecklistItem')}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('dailySchedule.newChecklistPlaceholder')}
                  className="w-full px-4 py-3 bg-bridge-surface border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors border border-white/10 rounded-xl hover:bg-white/5"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="flex-1 py-3 bg-gradient-to-r from-bridge-accent to-purple-500 text-sm font-bold text-white rounded-xl shadow-lg shadow-bridge-accent/20 disabled:opacity-50 disabled:grayscale hover:shadow-bridge-accent/40 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('dailySchedule.creating')}
              </>
            ) : (
              t('common.create')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
