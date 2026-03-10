import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { User, Clock, LayoutGrid, MessageSquare, Settings, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { MotionModal } from "../ui/MotionModal";
import { MemberProfileHeader } from "./member/MemberProfileHeader";
import { MemberProfileTab } from "./member/MemberProfileTab";
import { MemberHistoryTab } from "./member/MemberHistoryTab";
import { MemberBoardsTab } from "./member/MemberBoardsTab";
import { MemberOneOnOneTab } from "./member/MemberOneOnOneTab";
import { MemberSettingsTab } from "./member/MemberSettingsTab";
import { MemberSidebar } from "./member/MemberSidebar";
import { organizationService } from "../../utils/services";
import { useOrgData } from "../../contexts/OrgDataContext";
import type {
  OrgMemberDetail,
  OrgMemberBoard,
  OrgRole,
  OrgDepartment,
  OrgJobGroup,
  OrgPosition,
  OrgTitle,
  OrgGrade,
  OrgStructureSettings,
  LeaveBalance,
} from "../../types";

interface MemberDetailModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  memberId: string;
  myRole: OrgRole;
  myUserId: string;
  departments: OrgDepartment[];
  jobGroups: OrgJobGroup[];
  positions: OrgPosition[];
  titles: OrgTitle[];
  grades: OrgGrade[];
  structureSettings?: OrgStructureSettings;
  onMemberUpdated: () => void;
}

type TabKey = "profile" | "history" | "boards" | "oneOnOne" | "settings";

const TABS: { key: TabKey; labelKey: string; icon: typeof User; selfOnly?: boolean }[] = [
  {
    key: "profile",
    labelKey: "organization.members.detail.profileTab",
    icon: User,
  },
  {
    key: "history",
    labelKey: "organization.members.detail.historyTab",
    icon: Clock,
  },
  {
    key: "boards",
    labelKey: "organization.members.detail.boardsTab",
    icon: LayoutGrid,
  },
  {
    key: "oneOnOne",
    labelKey: "organization.members.detail.oneOnOneTab",
    icon: MessageSquare,
  },
  {
    key: "settings",
    labelKey: "organization.members.detail.settingsTab",
    icon: Settings,
    selfOnly: true,
  },
];

export function MemberDetailModal({
  open,
  onClose,
  orgId,
  memberId,
  myRole,
  myUserId,
  departments,
  jobGroups,
  positions,
  titles,
  grades,
  structureSettings,
  onMemberUpdated,
}: MemberDetailModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { org } = useOrgData();
  const hrSystemEnabled = org?.hr_system_enabled === true;

  const [member, setMember] = useState<OrgMemberDetail | null>(null);
  const [boards, setBoards] = useState<OrgMemberBoard[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isSelf = member?.user.id === myUserId;
  const isAdmin = myRole === "OWNER" || myRole === "ADMIN";

  const loadData = useCallback(async () => {
    if (!memberId) return;
    try {
      setLoading(true);
      const data = await organizationService.getMember(orgId, memberId);
      setMember(data);
    } catch (error) {
      console.warn("Failed to load member detail:", error);
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

  const loadLeaveBalances = useCallback(async () => {
    if (!memberId) return;
    try {
      const data = await organizationService.getMemberLeaveBalances(
        orgId,
        memberId,
      );
      setLeaveBalances(data);
    } catch {
      setLeaveBalances([]);
    }
  }, [orgId, memberId]);

  useEffect(() => {
    if (open && memberId) {
      setActiveTab("profile");
      setLeaveBalances([]);
      loadData();
      loadBoards();
    }
  }, [open, memberId, loadData, loadBoards]);

  // Load leave balances only after member is loaded (need isSelf check), skip if HR system enabled
  useEffect(() => {
    if (member && (isAdmin || isSelf) && !hrSystemEnabled) {
      loadLeaveBalances();
    }
  }, [member, isAdmin, isSelf, hrSystemEnabled, loadLeaveBalances]);

  const handleChangeRole = async (role: OrgRole) => {
    try {
      await organizationService.changeMemberRole(orgId, memberId, { role });
      loadData();
      onMemberUpdated();
    } catch (error) {
      console.warn("Failed to change role:", error);
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
      console.warn("Failed to remove member:", error);
    }
  };

  const handleMemberUpdate = (updated: OrgMemberDetail) => {
    setMember(updated);
    onMemberUpdated();
  };

  const handlePhotoUpload = async (file: File) => {
    try {
      const updated = await organizationService.uploadMemberProfileImage(
        orgId,
        memberId,
        file,
      );
      setMember(updated);
      onMemberUpdated();
    } catch (error) {
      console.warn("Failed to upload profile image:", error);
    }
  };

  const handleLeaveOrg = async () => {
    try {
      await organizationService.removeMember(orgId, memberId);
      onClose();
      onMemberUpdated();
      navigate("/boards");
    } catch (error: unknown) {
      console.warn("Failed to leave organization:", error);
      const errObj = error as { code?: string };
      if (errObj?.code === "O015") {
        alert(t("organization.members.detail.settings.boardOwnerCannotLeave", "조직 보드의 Owner인 경우 나갈 수 없습니다. 먼저 보드 Owner를 변경해주세요."));
      }
      throw error;
    }
  };

  const handlePhotoDelete = async () => {
    try {
      const updated = await organizationService.deleteMemberProfileImage(
        orgId,
        memberId,
      );
      setMember(updated);
      onMemberUpdated();
    } catch (error) {
      console.warn("Failed to delete profile image:", error);
    }
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className="w-full sm:max-w-4xl bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/[0.08] shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
    >
      {/* Accent Line */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent rounded-t-2xl shrink-0" />

      {loading || !member ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
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
                {t("organization.members.detail.removeConfirm", {
                  name: member.user.name,
                })}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
                >
                  {t("organization.members.detail.cancel")}
                </button>
                <button
                  onClick={handleRemove}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  {t("organization.members.detail.removeMember")}
                </button>
              </div>
            </div>
          )}

          {/* Body: Tab Content + Sidebar */}
          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Left: Tab Nav + Content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              {/* Tab Navigation */}
              <div className="flex gap-1 border-b border-foreground/[0.08] px-4 sm:px-6 shrink-0 overflow-x-auto">
                {TABS.filter(
                  (tab) =>
                    !(tab.key === "history" && hrSystemEnabled) &&
                    !(tab.selfOnly && !isSelf),
                ).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`relative px-3 sm:px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        activeTab === tab.key
                          ? "text-bridge-accent"
                          : "text-slate-400 hover:text-foreground"
                      }`}
                    >
                      <Icon size={14} />
                      {t(tab.labelKey)}
                      {activeTab === tab.key && (
                        <motion.div
                          layoutId="member-tab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-bridge-accent"
                          transition={{
                            type: "spring",
                            bounce: 0.2,
                            duration: 0.4,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === "profile" && (
                  <MemberProfileTab
                    member={member}
                    orgId={orgId}
                    myRole={myRole}
                    isSelf={isSelf}
                    departments={departments}
                    jobGroups={jobGroups}
                    positions={positions}
                    titles={titles}
                    grades={grades}
                    structureSettings={structureSettings}
                    leaveBalances={hrSystemEnabled ? [] : leaveBalances}
                    hrSystemEnabled={hrSystemEnabled}
                    onUpdate={handleMemberUpdate}
                  />
                )}
                {activeTab === "history" && (
                  <MemberHistoryTab
                    orgId={orgId}
                    memberId={memberId}
                    member={member}
                    isAdmin={isAdmin}
                    isSelf={isSelf}
                    departments={departments}
                    jobGroups={jobGroups}
                    positions={positions}
                    titles={titles}
                    grades={grades}
                    structureSettings={structureSettings}
                  />
                )}
                {activeTab === "boards" && (
                  <MemberBoardsTab
                    boards={boards}
                    loading={boardsLoading}
                    onBoardClick={(boardId) => {
                      onClose();
                      navigate(`/boards/${boardId}`);
                    }}
                  />
                )}
                {activeTab === "oneOnOne" && (
                  <MemberOneOnOneTab
                    orgId={orgId}
                    member={member}
                    myUserId={myUserId}
                  />
                )}
                {activeTab === "settings" && isSelf && (
                  <MemberSettingsTab
                    member={member}
                    isSelf={isSelf}
                    onLeaveOrg={handleLeaveOrg}
                  />
                )}
              </div>
            </div>

            {/* Right: Sidebar (desktop only) */}
            <div className="hidden md:block">
              <MemberSidebar
                member={member}
                boards={boards}
                leaveBalances={hrSystemEnabled ? [] : leaveBalances}
                isAdmin={isAdmin}
                isSelf={isSelf}
                hrSystemEnabled={hrSystemEnabled}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-foreground/[0.08] shrink-0">
            <span className="text-[10px] text-slate-500">
              Esc {t("common.close", "닫기")}
            </span>
          </div>
        </>
      )}
    </MotionModal>
  );
}
