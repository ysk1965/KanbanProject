import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { User, Activity, LayoutGrid } from 'lucide-react';
import { motion } from 'framer-motion';
import { MotionModal } from '../ui/MotionModal';
import { MemberProfileHeader } from './member/MemberProfileHeader';
import { MemberProfileTab } from './member/MemberProfileTab';
import { MemberActivityTab } from './member/MemberActivityTab';
import { MemberBoardsTab } from './member/MemberBoardsTab';
import { organizationService } from '../../utils/services';
import type { OrgMemberDetail, OrgMemberBoard, OrgRole, OrgDepartment, OrgJobGroup } from '../../types';

interface MemberDetailModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  memberId: string;
  myRole: OrgRole;
  myUserId: string;
  departments: OrgDepartment[];
  jobGroups: OrgJobGroup[];
  onMemberUpdated: () => void;
}

type TabKey = 'profile' | 'activity' | 'boards';

const TABS: { key: TabKey; labelKey: string; icon: typeof User }[] = [
  { key: 'profile', labelKey: 'organization.members.detail.profileTab', icon: User },
  { key: 'activity', labelKey: 'organization.members.detail.activityTab', icon: Activity },
  { key: 'boards', labelKey: 'organization.members.detail.boardsTab', icon: LayoutGrid },
];

export function MemberDetailModal({
  open, onClose, orgId, memberId, myRole, myUserId, departments, jobGroups, onMemberUpdated,
}: MemberDetailModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [member, setMember] = useState<OrgMemberDetail | null>(null);
  const [boards, setBoards] = useState<OrgMemberBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isSelf = member?.user.id === myUserId;

  const loadData = useCallback(async () => {
    if (!memberId) return;
    try {
      setLoading(true);
      const data = await organizationService.getMember(orgId, memberId);
      setMember(data);
    } catch (error) {
      console.warn('Failed to load member detail:', error);
    } finally {
      setLoading(false);
    }
  }, [orgId, memberId]);

  const loadBoards = useCallback(async () => {
    if (!memberId) return;
    try {
      setBoardsLoading(true);
      const data = await organizationService.getMemberBoards(orgId, memberId);
      setBoards(data);
    } catch {
      setBoards([]);
    } finally {
      setBoardsLoading(false);
    }
  }, [orgId, memberId]);

  useEffect(() => {
    if (open && memberId) {
      setActiveTab('profile');
      loadData();
      loadBoards();
    }
  }, [open, memberId, loadData, loadBoards]);

  const handleChangeRole = async (role: OrgRole) => {
    try {
      await organizationService.changeMemberRole(orgId, memberId, { role });
      loadData();
      onMemberUpdated();
    } catch (error) {
      console.warn('Failed to change role:', error);
    }
  };

  const handleRemove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    try {
      await organizationService.removeMember(orgId, memberId);
      onClose();
      onMemberUpdated();
    } catch (error) {
      console.warn('Failed to remove member:', error);
    }
  };

  const handleMemberUpdate = (updated: OrgMemberDetail) => {
    setMember(updated);
    onMemberUpdated();
  };

  const handlePhotoUpload = async (file: File) => {
    try {
      const updated = await organizationService.uploadMemberProfileImage(orgId, memberId, file);
      setMember(updated);
      onMemberUpdated();
    } catch (error) {
      console.warn('Failed to upload profile image:', error);
    }
  };

  const handlePhotoDelete = async () => {
    try {
      const updated = await organizationService.deleteMemberProfileImage(orgId, memberId);
      setMember(updated);
      onMemberUpdated();
    } catch (error) {
      console.warn('Failed to delete profile image:', error);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose} className="w-full sm:max-w-2xl bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-black/5 dark:border-white/5 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
      {/* Accent Line */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent rounded-t-2xl shrink-0" />

      {loading || !member ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-bridge-accent/30 border-t-bridge-accent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Header */}
          <MemberProfileHeader
            member={member}
            myRole={myRole}
            isSelf={isSelf}
            onChangeRole={handleChangeRole}
            onRemove={handleRemove}
            onPhotoUpload={handlePhotoUpload}
            onPhotoDelete={handlePhotoDelete}
          />

          {/* Remove Confirmation */}
          {confirmRemove && (
            <div className="mx-6 mb-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-sm text-red-400 mb-2">
                {t('organization.members.detail.removeConfirm', { name: member.user.name })}
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmRemove(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors">
                  {t('organization.members.detail.cancel')}
                </button>
                <button onClick={handleRemove}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-colors">
                  {t('organization.members.detail.removeMember')}
                </button>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex gap-1 border-b border-black/5 dark:border-white/5 px-6 shrink-0">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? 'text-bridge-accent'
                      : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon size={14} />
                  {t(tab.labelKey)}
                  {activeTab === tab.key && (
                    <motion.div
                      layoutId="member-tab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-bridge-accent"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'profile' && (
              <MemberProfileTab
                member={member}
                orgId={orgId}
                myRole={myRole}
                isSelf={isSelf}
                departments={departments}
                jobGroups={jobGroups}
                onUpdate={handleMemberUpdate}
              />
            )}
            {activeTab === 'activity' && (
              <MemberActivityTab member={member} boardCount={boards.length} />
            )}
            {activeTab === 'boards' && (
              <MemberBoardsTab
                boards={boards}
                loading={boardsLoading}
                onBoardClick={(boardId) => { onClose(); navigate(`/boards/${boardId}`); }}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-black/5 dark:border-white/5 shrink-0">
            <span className="text-[10px] text-slate-600">Esc {t('common.close', '닫기')}</span>
          </div>
        </>
      )}
    </MotionModal>
  );
}
