import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, ArrowLeft, LayoutGrid, Calendar, Flag, Pencil, Lock, BarChart3, Lightbulb, MessageSquare, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { isWhiteLabelDomain } from '../utils/domain';
import { Board, Milestone, BoardTierInfo, Subscription, AiCredits } from '../types';
import { BoardMember as ShareBoardMember, MemberRole } from './ShareBoardModal';
import { UpgradeTrigger } from './UpgradeModal';
import { TrialBanner } from './TrialBanner';
import { NotificationDropdown } from './NotificationDropdown';
import { UserMenu } from './UserMenu';
import { AnnouncementDisplay } from './AnnouncementDisplay';
import { boardService } from '../utils/services';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

type ViewMode = 'kanban' | 'weekly' | 'schedule' | 'meeting' | 'notes' | 'statistics' | 'ai_report';

interface KanbanBoardHeaderProps {
  board: Board | null;
  boardId: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  // Milestone
  milestones: Milestone[];
  allFeatures: { id: string }[];
  kanbanSelectedMilestoneId: string;
  onMilestoneSelect: (id: string) => void;
  onOpenMilestoneWithCheck: (milestone?: Milestone) => void;
  onOpenMilestoneOnboarding: () => void;
  // Members
  boardMembersData: ShareBoardMember[];
  memberColorMap: Record<string, string | null>;
  onlineUsers: string[];
  // Notifications
  unreadNotificationCount: number;
  onUnreadCountChange: (count: number) => void;
  unreadInquiryCount: number;
  activities: any[];
  hasMoreActivities: boolean;
  onLoadMoreActivities: () => void;
  onNotificationClick: (notification: any) => void;
  // Permissions
  canEdit: boolean;
  canAccessSchedule: boolean;
  canAccessMilestone: boolean;
  canAccessStatistics: boolean;
  canAccessSlack: boolean;
  canViewStatistics: boolean;
  isAdminOrOwner: boolean;
  isViewer: boolean;
  hideBilling: boolean;
  hideBillingForUser: boolean;
  // Subscription
  subscription: Subscription | null;
  tierInfo: BoardTierInfo | null;
  // Actions
  onSaveBoardName: (name: string) => void;
  onOpenShareBoard: () => void;
  onOpenSubscription: () => void;
  onOpenInquiry: () => void;
  onOpenPremiumBenefits: () => void;
  onOpenUpgradeModal: (trigger: UpgradeTrigger) => void;
  // User
  currentUser: { id: string; name: string; email: string; role?: string } | null;
  onLogout: () => void;
  isTester: boolean;
  // Schedule sub mode helpers
  getScheduleSubMode: () => 'schedule' | 'weekly';
  getAISubMode: () => 'statistics' | 'ai_report';
}

export function KanbanBoardHeader({
  board, boardId, viewMode, onViewModeChange,
  milestones, allFeatures, kanbanSelectedMilestoneId, onMilestoneSelect, onOpenMilestoneWithCheck, onOpenMilestoneOnboarding,
  boardMembersData, memberColorMap, onlineUsers,
  unreadNotificationCount, onUnreadCountChange, unreadInquiryCount, activities, hasMoreActivities, onLoadMoreActivities, onNotificationClick,
  canEdit, canAccessSchedule, canAccessMilestone, canAccessStatistics, canAccessSlack, canViewStatistics, isAdminOrOwner, isViewer, hideBilling, hideBillingForUser,
  subscription, tierInfo,
  onSaveBoardName, onOpenShareBoard, onOpenSubscription, onOpenInquiry, onOpenPremiumBenefits, onOpenUpgradeModal,
  currentUser, onLogout, isTester,
  getScheduleSubMode, getAISubMode,
}: KanbanBoardHeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isEditingBoardName, setIsEditingBoardName] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState('');
  const boardNameInputRef = useRef<HTMLInputElement>(null);

  const handleStartEditBoardName = () => {
    if (!canEdit || !board) return;
    setEditingBoardName(board.name);
    setIsEditingBoardName(true);
    setTimeout(() => boardNameInputRef.current?.select(), 0);
  };

  const handleSaveBoardName = async () => {
    const trimmed = editingBoardName.trim();
    if (!trimmed || !board || !boardId || trimmed === board.name) {
      setIsEditingBoardName(false);
      return;
    }
    onSaveBoardName(trimmed);
    setIsEditingBoardName(false);
  };

  return (
    <>
      <AnnouncementDisplay />
      <TrialBanner
        status={subscription?.status || 'ACTIVE'}
        tier={tierInfo?.tier}
        trialEndsAt={tierInfo?.trial_ends_at || subscription?.trial_ends_at}
        onOpenSubscription={onOpenSubscription}
        onOpenPremiumBenefits={onOpenPremiumBenefits}
        onTrialEnding={() => onOpenUpgradeModal('trial_ending')}
        hideBilling={hideBillingForUser}
      />

      <header className="min-h-[3.5rem] md:h-16 border-b border-bridge-border flex items-center justify-between px-3 md:px-6 bg-bridge-dark shrink-0 z-30 gap-2">
        {/* 좌측 영역 */}
        <div className="flex items-center gap-2 md:gap-6 min-w-0">
          {!hideBilling && (
            <button
              onClick={() => navigate('/boards')}
              className="p-2 hover:bg-bridge-surface-hover rounded-lg transition-colors text-zinc-400 hover:text-foreground"
            >
              <ArrowLeft size={18} />
            </button>
          )}

          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {isEditingBoardName ? (
              <input
                ref={boardNameInputRef}
                value={editingBoardName}
                onChange={(e) => setEditingBoardName(e.target.value)}
                onBlur={handleSaveBoardName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveBoardName();
                  if (e.key === 'Escape') setIsEditingBoardName(false);
                }}
                className="text-sm md:text-lg font-bold tracking-tight text-foreground bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent max-w-[160px] sm:max-w-[200px] md:max-w-[300px]"
                autoFocus
              />
            ) : (
              <h1
                className={`text-sm md:text-lg font-bold tracking-tight text-foreground truncate max-w-[100px] sm:max-w-[160px] md:max-w-none ${canEdit ? 'cursor-pointer hover:text-bridge-accent transition-colors' : ''}`}
                onClick={canEdit ? handleStartEditBoardName : undefined}
                title={canEdit ? t('common.edit') : undefined}
              >
                {board?.name || t('kanban.defaultBoardName')}
              </h1>
            )}

            {/* 마일스톤 셀렉터 */}
            <div className="hidden sm:flex items-center gap-2 bg-bridge-surface px-3 py-1.5 rounded-md border border-bridge-border hover:border-bridge-secondary/40 cursor-pointer transition-all">
              <Flag size={14} className="text-bridge-secondary" />
              {milestones.length > 0 ? (
                <Select value={kanbanSelectedMilestoneId} onValueChange={onMilestoneSelect}>
                  <SelectTrigger className="bg-transparent border-none text-xs font-medium text-foreground focus:ring-0 h-auto p-0 w-[120px] [&>svg]:text-zinc-400">
                    <SelectValue placeholder={t('kanban.selectMilestone')} />
                  </SelectTrigger>
                  <SelectContent className="bg-bridge-surface border-bridge-border">
                    <SelectItem value="all" className="text-zinc-300 hover:bg-white/10 focus:bg-white/10 focus:text-foreground text-xs">
                      {t('common.all')}
                    </SelectItem>
                    {milestones.map((milestone) => {
                      const startDate = format(parseISO(milestone.start_date), 'M/d');
                      const endDate = format(parseISO(milestone.end_date), 'M/d');
                      return (
                        <SelectItem
                          key={milestone.id}
                          value={milestone.id}
                          className="text-zinc-300 hover:bg-white/10 focus:bg-white/10 focus:text-foreground text-xs"
                        >
                          <div className="flex flex-col">
                            <span>{milestone.title}</span>
                            <span className="text-zinc-500 text-[10px]">{startDate} ~ {endDate}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : allFeatures.length > 0 ? (
                <button
                  onClick={() => onOpenMilestoneOnboarding()}
                  className="flex items-center gap-1.5 group"
                >
                  <Lightbulb size={12} className="text-bridge-secondary animate-pulse" />
                  <span className="text-xs text-bridge-secondary group-hover:text-bridge-secondary/80 transition-colors">{t('kanban.startMilestone')}</span>
                </button>
              ) : (
                <span className="text-xs text-zinc-500">{t('kanban.noMilestone')}</span>
              )}
            </div>

            {kanbanSelectedMilestoneId !== 'all' && (
              <button
                onClick={() => {
                  const milestone = milestones.find((m) => m.id === kanbanSelectedMilestoneId);
                  if (milestone) onOpenMilestoneWithCheck(milestone);
                }}
                className="p-1.5 text-zinc-400 hover:text-foreground transition-colors"
                title={t('kanban.editMilestone')}
              >
                <Pencil size={14} />
              </button>
            )}

            <button
              onClick={() => onOpenMilestoneWithCheck()}
              className={`p-1.5 transition-colors ${
                !canAccessMilestone
                  ? 'text-zinc-600 hover:text-zinc-500'
                  : 'text-zinc-400 hover:text-foreground'
              }`}
            >
              <Plus size={18} />
              {!canAccessMilestone && <Lock className="h-2.5 w-2.5 absolute -top-0.5 -right-0.5" />}
            </button>
          </div>
        </div>

        {/* 중앙 탭 영역 */}
        <div className="hidden md:flex justify-center min-w-0 md:flex-1">
        <nav className="flex items-center gap-1 bg-bridge-surface p-1 rounded-xl border border-bridge-border overflow-x-auto shrink-0">
          <button
            onClick={() => onViewModeChange('kanban')}
            className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              viewMode === 'kanban'
                ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-bridge-surface-hover'
            }`}
          >
            <LayoutGrid size={14} />
            <span className="hidden md:inline">{t('kanban.viewKanban')}</span>
          </button>

          <button
            onClick={() => {
              const subMode = getScheduleSubMode();
              if (subMode === 'weekly' && !canAccessSchedule) {
                onViewModeChange('schedule');
              } else {
                onViewModeChange(subMode);
              }
            }}
            className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              viewMode === 'schedule' || viewMode === 'weekly'
                ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-bridge-surface-hover'
            }`}
          >
            <Calendar size={14} />
            <span className="hidden md:inline">{t('kanban.viewScheduleTab', '일정')}</span>
          </button>

          {!isWhiteLabelDomain && (
            <button
              onClick={() => onViewModeChange('meeting')}
              className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                viewMode === 'meeting'
                  ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-bridge-surface-hover'
              }`}
            >
              <Users size={14} />
              <span className="hidden md:inline">{t('kanban.viewMeeting', '회의')}</span>
            </button>
          )}

          {!isWhiteLabelDomain && (
            <button
              onClick={() => onViewModeChange('notes')}
              className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                viewMode === 'notes'
                  ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-bridge-surface-hover'
              }`}
            >
              <FileText size={14} />
              <span className="hidden md:inline">{t('kanban.viewNotes', '노트')}</span>
            </button>
          )}

          {!isWhiteLabelDomain && (isAdminOrOwner || (!isViewer && !isTester)) && (
            <button
              onClick={() => {
                if (!canAccessStatistics) {
                  onOpenUpgradeModal('statistics');
                  return;
                }
                const subMode = getAISubMode();
                if (subMode === 'statistics' && !isAdminOrOwner) {
                  onViewModeChange('ai_report');
                } else if (subMode === 'ai_report' && (isViewer || isTester)) {
                  onViewModeChange('statistics');
                } else {
                  onViewModeChange(subMode);
                }
              }}
              className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all relative whitespace-nowrap ${
                viewMode === 'statistics' || viewMode === 'ai_report'
                  ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20'
                  : !canAccessStatistics
                    ? 'text-zinc-600 cursor-not-allowed opacity-50'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-bridge-surface-hover'
              }`}
            >
              <BarChart3 size={14} />
              <span className="hidden md:inline">{t('kanban.viewAIAnalysisTab', 'AI분석')}</span>
              {!canAccessStatistics && <Lock size={10} className="ml-0.5 text-zinc-500" />}
            </button>
          )}
        </nav>
        </div>

        {/* 우측 액션 영역 */}
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <div className="flex items-center gap-0.5 md:gap-1 border-r border-bridge-border pr-2 md:pr-3 mr-0.5 md:mr-1">
            <NotificationDropdown
              boardId={boardId}
              unreadCount={unreadNotificationCount}
              activities={activities}
              hasMoreActivities={hasMoreActivities}
              onLoadMoreActivities={onLoadMoreActivities}
              onNotificationClick={onNotificationClick}
              onUnreadCountChange={onUnreadCountChange}
              canAccessSlack={canAccessSlack}
              onSlackUpgrade={() => onOpenUpgradeModal('slack')}
              isAdmin={isAdminOrOwner}
              isTester={isTester}
            />
            {!isTester && (
              <button
                onClick={onOpenInquiry}
                className="relative flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover rounded-lg transition-all"
                title={t('kanban.inquiry')}
              >
                <MessageSquare size={18} />
                {unreadInquiryCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {unreadInquiryCount > 99 ? '99+' : unreadInquiryCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={onOpenShareBoard}
              className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover rounded-lg transition-all"
            >
              <Users size={18} />
              <span className="hidden md:inline text-xs font-semibold">{t('kanban.team')}</span>
            </button>
          </div>

          {currentUser && (
            <UserMenu
              user={currentUser}
              assigneeColor={memberColorMap[currentUser.id]}
              onOpenSubscription={onOpenSubscription}
              onLogout={onLogout}
              hideBilling={hideBillingForUser}
            />
          )}
        </div>
      </header>
    </>
  );
}
