import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users, LayoutGrid, CalendarOff, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { organizationService, leaveService } from '../../../utils/services';
import type { OrgBoardSimple, LeaveRequestResponse, OrgRole, OrgAnnouncement } from '../../../types';
import { OrgAnnouncementSection } from '../OrgAnnouncementSection';
import { OrgAnnouncementModal } from '../OrgAnnouncementModal';
import { OrgAnnouncementListModal } from '../OrgAnnouncementListModal';

interface OrgDashboardTabProps {
  orgId: string;
  role: OrgRole;
}

export function OrgDashboardTab({ orgId, role }: OrgDashboardTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<OrgBoardSimple[]>([]);
  const [todayLeaves, setTodayLeaves] = useState<LeaveRequestResponse[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Announcement modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<OrgAnnouncement | null>(null);
  const [showListModal, setShowListModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const handleAnnouncementSaved = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Users, color: 'bridge-accent', label: t('organization.dashboard.members', 'Members'), value: memberCount },
          { icon: LayoutGrid, color: 'bridge-secondary', label: t('organization.dashboard.boards', 'Boards'), value: boards.length },
          { icon: CalendarOff, color: 'amber-500', label: t('organization.dashboard.todayLeaves', "Today's Leaves"), value: todayLeaves.length },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-5"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-8 h-8 rounded-lg bg-${stat.color}/20 flex items-center justify-center`}>
                <stat.icon size={16} className={`text-${stat.color}`} />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {stat.label}
              </span>
            </div>
            <span className="text-2xl font-bold text-foreground">{stat.value}</span>
          </motion.div>
        ))}
      </div>

      {/* Announcements Feed */}
      <div key={refreshKey}>
        <OrgAnnouncementSection
          orgId={orgId}
          role={role}
          onCreateClick={() => { setEditingAnnouncement(null); setShowCreateModal(true); }}
          onEditClick={(a) => { setEditingAnnouncement(a); setShowCreateModal(true); }}
          onViewAllClick={() => setShowListModal(true)}
        />
      </div>

      {/* Connected Boards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <LayoutGrid size={14} className="text-bridge-secondary" />
            <h3 className="text-sm font-bold text-foreground">
              {t('organization.dashboard.connectedBoards', 'Connected Boards')}
            </h3>
            <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded-full">
              {boards.length}
            </span>
          </div>
        </div>
        {boards.length === 0 ? (
          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-bridge-secondary/10 flex items-center justify-center mx-auto mb-3">
              <LayoutGrid size={24} className="text-bridge-secondary/60" />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('organization.dashboard.noBoards', 'No boards connected yet')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {boards.map((board, index) => (
              <motion.div
                key={board.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                onClick={() => navigate(`/boards/${board.id}`)}
                className="group bg-bridge-obsidian rounded-xl border border-foreground/[0.05] p-4 flex items-center justify-between cursor-pointer hover:border-foreground/[0.08] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-bridge-secondary/10 flex items-center justify-center">
                    <LayoutGrid size={14} className="text-bridge-secondary" />
                  </div>
                  <div>
                    <span className="text-foreground font-medium text-sm group-hover:text-bridge-accent transition-colors">{board.name}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{board.owner.name}</span>
                      <span>{board.member_count} members</span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground group-hover:text-bridge-accent group-hover:translate-x-0.5 transition-all" />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Today's Leaves */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarOff size={14} className="text-amber-500 dark:text-amber-400" />
            <h3 className="text-sm font-bold text-foreground">
              {t('organization.dashboard.onLeaveToday', 'On Leave Today')}
            </h3>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
              {todayLeaves.length}
            </span>
          </div>
        </div>
        {todayLeaves.length === 0 ? (
          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.05] p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
              <CalendarOff size={24} className="text-emerald-500/60" />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('organization.dashboard.noLeaves', 'No one is on leave today')}
            </p>
          </div>
        ) : (
          <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.05] divide-y divide-foreground/[0.05]">
            {todayLeaves.map((leave, index) => (
              <motion.div
                key={leave.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.04 }}
                className="p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center text-xs text-bridge-accent font-bold">
                    {leave.requester?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <span className="text-sm text-foreground font-medium">{leave.requester?.name}</span>
                    {leave.requester?.department_name && (
                      <span className="text-xs text-muted-foreground ml-2">{leave.requester.department_name}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground px-2 py-1 bg-foreground/[0.03] rounded-lg">
                  {leave.policy?.name} ({leave.duration_type === 'FULL_DAY' ? t('organization.leave.fullDay', 'Full Day') : leave.duration_type === 'AM_HALF' ? t('organization.leave.amHalf', 'AM Half') : t('organization.leave.pmHalf', 'PM Half')})
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <OrgAnnouncementModal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingAnnouncement(null); }}
        orgId={orgId}
        editing={editingAnnouncement}
        onSaved={handleAnnouncementSaved}
      />
      <OrgAnnouncementListModal
        open={showListModal}
        onClose={() => setShowListModal(false)}
        orgId={orgId}
        role={role}
        onEditClick={(a) => { setEditingAnnouncement(a); setShowCreateModal(true); }}
      />
    </div>
  );
}
