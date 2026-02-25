import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users, LayoutGrid, CalendarOff } from 'lucide-react';
import { organizationService, leaveService } from '../../../utils/services';
import type { OrgBoardSimple, LeaveRequestResponse } from '../../../types';

interface OrgDashboardTabProps {
  orgId: string;
}

export function OrgDashboardTab({ orgId }: OrgDashboardTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<OrgBoardSimple[]>([]);
  const [todayLeaves, setTodayLeaves] = useState<LeaveRequestResponse[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [boardsData, orgData] = await Promise.all([
          organizationService.getBoards(orgId),
          organizationService.get(orgId),
        ]);
        setBoards(boardsData);
        setMemberCount(orgData.member_count);

        // Fetch today's approved leaves
        const today = new Date().toISOString().split('T')[0];
        try {
          const leavesData = await leaveService.getRequests(orgId, {
            status: 'APPROVED',
            start_date: today,
            end_date: today,
            size: 100,
          });
          setTodayLeaves(leavesData.content);
        } catch {
          // Leave data is optional
        }
      } catch (error) {
        console.warn('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [orgId]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-bridge-obsidian rounded-2xl border border-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
              <Users size={16} className="text-bridge-accent" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {t('organization.dashboard.members', 'Members')}
            </span>
          </div>
          <span className="text-2xl font-bold text-white">{memberCount}</span>
        </div>

        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-bridge-secondary/20 flex items-center justify-center">
              <LayoutGrid size={16} className="text-bridge-secondary" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {t('organization.dashboard.boards', 'Boards')}
            </span>
          </div>
          <span className="text-2xl font-bold text-white">{boards.length}</span>
        </div>

        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <CalendarOff size={16} className="text-amber-400" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {t('organization.dashboard.todayLeaves', "Today's Leaves")}
            </span>
          </div>
          <span className="text-2xl font-bold text-white">{todayLeaves.length}</span>
        </div>
      </div>

      {/* Connected Boards */}
      {boards.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">
            {t('organization.dashboard.connectedBoards', 'Connected Boards')}
          </h3>
          <div className="space-y-2">
            {boards.map((board) => (
              <div
                key={board.id}
                onClick={() => navigate(`/boards/${board.id}`)}
                className="bg-bridge-obsidian rounded-xl border border-white/5 p-4 flex items-center justify-between cursor-pointer hover:border-white/10 transition-colors"
              >
                <div>
                  <span className="text-white font-medium text-sm">{board.name}</span>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>{board.owner.name}</span>
                    <span>{board.member_count} members</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Leaves */}
      {todayLeaves.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">
            {t('organization.dashboard.onLeaveToday', 'On Leave Today')}
          </h3>
          <div className="bg-bridge-obsidian rounded-xl border border-white/5 divide-y divide-white/5">
            {todayLeaves.map((leave) => (
              <div key={leave.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center text-xs text-bridge-accent font-bold">
                    {leave.requester?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <span className="text-sm text-white font-medium">{leave.requester?.name}</span>
                    {leave.requester?.department_name && (
                      <span className="text-xs text-slate-500 ml-2">{leave.requester.department_name}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-400 px-2 py-1 bg-white/5 rounded-lg">
                  {leave.policy?.name} ({leave.duration_type === 'FULL_DAY' ? t('organization.leave.fullDay', 'Full Day') : leave.duration_type === 'AM_HALF' ? t('organization.leave.amHalf', 'AM Half') : t('organization.leave.pmHalf', 'PM Half')})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
