import { useState, Component, ErrorInfo, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Feature,
  Task,
  Block,
  Tag,
  Milestone,
  Subscription,
  AiCredits,
  InviteLink,
  BoardWebSocketEvent,
  ChecklistItem,
  JobRole,
  BoardContractor,
} from "../types";
import { BoardMember as ShareBoardMember, MemberRole } from "./ShareBoardModal";
import { UpgradeTrigger } from "./UpgradeModal";
import { FeatureDetailModal } from "./FeatureDetailModal";
import { TaskDetailModal } from "./TaskDetailModal";
import { AddBlockModal } from "./AddBlockModal";
import { AddFeatureModal } from "./AddFeatureModal";
import { ShareBoardModal } from "./ShareBoardModal";
import { JobRoleManageModal } from "./JobRoleManageModal";
import { SubscriptionModal } from "./SubscriptionModal";
import { InquiryModal } from "./InquiryModal";
import { MilestoneModal } from "./MilestoneModal";
import { MilestoneOnboardingModal } from "./MilestoneOnboardingModal";
import { UpgradeModal } from "./UpgradeModal";
import { PremiumBenefitsModal } from "./PremiumBenefitsModal";
import { SeatPurchaseModal } from "./SeatPurchaseModal";
import { AlertModal } from "./AlertModal";
import { AiCreditPurchaseModal } from "./AiCreditPurchaseModal";
import { MotionModal } from "./ui/MotionModal";
import { Users, Loader2 } from "lucide-react";

// DEBUG: TaskDetailModal 크래시 원인 포착용 로컬 ErrorBoundary
class ModalErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; componentStack: string | null }
> {
  state = {
    error: null as Error | null,
    componentStack: null as string | null,
  };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack || null });
    console.error(
      "[ModalErrorBoundary]",
      error.message,
      error.stack,
      info.componentStack,
    );
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
          }}
        >
          <div
            style={{
              background: "#1e2a42",
              padding: 24,
              borderRadius: 16,
              maxWidth: 700,
              width: "95%",
              color: "#fff",
              fontFamily: "monospace",
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <h2 style={{ color: "#f87171", marginBottom: 12 }}>
              TaskDetailModal Error
            </h2>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                fontSize: 13,
                color: "#fbbf24",
              }}
            >
              {this.state.error.message}
            </pre>
            {this.state.componentStack && (
              <>
                <h3
                  style={{
                    color: "#38bdf8",
                    marginTop: 16,
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                >
                  Component Stack:
                </h3>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    fontSize: 11,
                    color: "#4ade80",
                    maxHeight: 300,
                    overflow: "auto",
                    background: "#0f172a",
                    padding: 12,
                    borderRadius: 8,
                  }}
                >
                  {this.state.componentStack}
                </pre>
              </>
            )}
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                fontSize: 11,
                color: "#94a3b8",
                marginTop: 8,
                maxHeight: 150,
                overflow: "auto",
              }}
            >
              {this.state.error.stack}
            </pre>
            <button
              onClick={() =>
                this.setState({ error: null, componentStack: null })
              }
              style={{
                marginTop: 16,
                padding: "8px 20px",
                background: "#6366f1",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              닫기
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface BoardModalManagerProps {
  boardId: string;
  // Feature Modal
  selectedFeature: Feature | null;
  isFeatureModalOpen: boolean;
  onCloseFeature: () => void;
  featureTasks: Task[];
  blocks: Block[];
  onAddSubtask: (title: string) => void;
  onRenameSubtask: (taskId: string, newTitle: string) => void;
  onUpdateFeature: (updates: Partial<Feature>) => void;
  onDeleteFeature: (
    featureId: string,
    taskMigrations?: Array<{ task_id: string; target_feature_id: string }>,
  ) => void;
  onFeatureTaskClick?: (task: Task) => void;
  // Task Modal
  selectedTask: Task | null;
  isTaskModalOpen: boolean;
  highlightChecklistItemId?: string | null;
  onCloseTask: () => void;
  onUpdateTask: (updates: Partial<Task>) => void;
  onDeleteTask: (taskId: string) => void;
  onMoveToDone: (taskId: string) => void;
  onMoveToBlock: (taskId: string, blockId: string) => void;
  onMoveToFeature: (taskId: string, featureId: string) => void;
  onMoveChecklistToTask: (
    checklistItemId: string,
    sourceTaskId: string,
    targetTaskId: string,
  ) => void;
  features: Feature[];
  allTasks: Task[];
  wsCommentEvent: BoardWebSocketEvent | null;
  wsChecklistEvent: BoardWebSocketEvent | null;
  onOpenFeature?: (featureId: string) => void;
  onChecklistSync?: (taskId: string, items: ChecklistItem[]) => void;
  // Tag
  tags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (
    tagId: string,
    data: { name?: string; color?: string },
  ) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  // AddBlock Modal
  isAddBlockModalOpen: boolean;
  onCloseAddBlock: () => void;
  onAddBlock: (name: string, color: string) => void;
  // EditBlock Modal
  editingBlock: Block | null;
  onCloseEditBlock: () => void;
  onEditBlock: (name: string, color: string) => void;
  // AddFeature Modal
  isAddFeatureModalOpen: boolean;
  onCloseAddFeature: () => void;
  onAddFeature: (data: {
    title: string;
    description?: string;
    dueDate?: string;
    milestoneId?: string;
  }) => void;
  milestones: Milestone[];
  kanbanSelectedMilestoneId: string;
  // ShareBoard Modal
  isShareBoardModalOpen: boolean;
  onCloseShareBoard: () => void;
  boardMembersData: ShareBoardMember[];
  onAddMember: (email: string, role: MemberRole) => void;
  onUpdateMemberRole: (memberId: string, role: MemberRole) => void;
  onRemoveMember: (memberId: string) => void;
  onUpdateMemberColor: (memberId: string, color: string | null) => void;
  onReorderMembers: (memberIds: string[]) => void;
  currentUserId: string;
  onlineUsers: string[];
  inviteLinks: InviteLink[];
  onCreateInviteLink: (
    role: string,
    maxUses: number,
    expiresIn: string,
  ) => Promise<InviteLink>;
  onDeleteInviteLink: (linkId: string) => void;
  seatInfo?: { seatCount: number; usedSeats: number };
  onOpenSeatManagement?: () => void;
  aiCredits: AiCredits | null;
  onOpenAiCreditPurchase?: () => void;
  isOrgBoard?: boolean;
  organizationName?: string | null;
  pendingJoinRequestCount?: number;
  isAdminOrOwner?: boolean;
  onJoinRequestHandled?: () => void;
  boardName?: string;
  onTransferOwnership?: (newOwnerUserId: string) => Promise<void>;
  hideBillingForUser: boolean;
  // 직군(JobRole)
  jobRoles?: JobRole[];
  onUpdateMemberJobRole?: (memberId: string, jobRoleId: string | null) => void;
  canManageJobRoles?: boolean;
  onJobRolesChanged?: (roles: JobRole[]) => void;
  // Subscription Modal
  isSubscriptionModalOpen: boolean;
  onCloseSubscription: () => void;
  subscription: Subscription | null;
  currentBillableMembers: number;
  onChangeBillingCycle: (cycle: "MONTHLY" | "YEARLY") => void;
  onPurchaseSeats: (seats: number) => void;
  onCancelSubscription: () => void;
  onUndoCancellation?: () => Promise<void>;
  // Inquiry Modal
  isInquiryModalOpen: boolean;
  onCloseInquiry: () => void;
  // Milestone Modal
  isMilestoneModalOpen: boolean;
  onCloseMilestone: () => void;
  selectedMilestone: Milestone | null;
  allFeatures: Feature[];
  featureMilestoneCountMap: Record<string, number>;
  featurePrimaryMilestoneMap: Record<string, string>;
  onSetPrimaryMilestoneFeature: (featureId: string) => void | Promise<void>;
  onSaveMilestone: (data: any) => void;
  onDeleteMilestone: (id: string) => void;
  onSelectMilestone: (milestone: Milestone | null) => void;
  // Milestone Onboarding
  isMilestoneOnboardingOpen: boolean;
  onCloseMilestoneOnboarding: () => void;
  onCreateMilestone: () => void;
  // Upgrade Modal
  isUpgradeModalOpen: boolean;
  onCloseUpgrade: () => void;
  upgradeTrigger: UpgradeTrigger;
  onSeatUpgrade: (
    billingCycle: "MONTHLY" | "YEARLY",
    seatCount: number,
  ) => void;
  // Premium Benefits Modal
  isPremiumBenefitsModalOpen: boolean;
  onClosePremiumBenefits: () => void;
  // Seat Purchase Modal
  seatPurchaseModal: {
    open: boolean;
    seatCount: number;
    billableMemberCount: number;
    pendingEmail: string;
    pendingRole: MemberRole;
    pendingMemberId?: string;
  } | null;
  onCloseSeatPurchase: () => void;
  billingCycle: "MONTHLY" | "YEARLY";
  onPurchaseSeatsAndRetry: (seats: number) => void;
  // Org Seat Limit Modal
  orgSeatLimitModal: {
    open: boolean;
    orgId: string;
    seatCount: number;
    activeMemberCount: number;
    monthlyPricePerSeat: number;
    yearlyPricePerSeat: number;
    isOrgAdmin: boolean;
    pendingEmail: string;
    pendingRole: MemberRole;
    pendingMemberId?: string;
  } | null;
  onCloseOrgSeatLimit: () => void;
  onOrgPurchaseSeatsAndRetry: (seats: number) => void;
  // Alert Modal
  alertModal: { open: boolean; type: "premium" | "permission" };
  onCloseAlert: () => void;
  // AI Credit Modal
  showCreditModal: boolean;
  onCloseCreditModal: () => void;
  creditModalMode: "purchase" | "exhausted";
  onCreditPurchaseComplete: (credits: AiCredits) => void;
  currentCredits: AiCredits | null;
  isOrgBoard?: boolean;
  // Onboarding
  isOnboarding?: boolean;
  // Permissions
  canEdit: boolean;
  isAdminOrOwner: boolean;
  currentUser: any;
  boardMembers: ShareBoardMember[];
  contractors?: BoardContractor[];
}

function OrgSeatLimitModalInline({
  modal,
  onClose,
  onPurchase,
}: {
  modal: NonNullable<BoardModalManagerProps["orgSeatLimitModal"]>;
  onClose: () => void;
  onPurchase: (seats: number) => void;
}) {
  const { t } = useTranslation();
  const [additionalSeats, setAdditionalSeats] = useState(1);
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      await onPurchase(additionalSeats);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionModal open={modal.open} onClose={onClose}>
      <div className="w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl">
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center">
            <Users className="w-4 h-4 text-bridge-accent" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {t("orgSeatLimit.title")}
            </h3>
            <p className="text-xs text-slate-500">
              {t("orgSeatLimit.subtitle")}
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          {modal.isOrgAdmin ? (
            <>
              <div className="flex items-center justify-between py-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t("orgSeatLimit.currentSeats")}
                </span>
                <span className="text-sm font-bold text-foreground">
                  {modal.activeMemberCount} / {modal.seatCount}
                </span>
              </div>

              {modal.pendingEmail && (
                <p className="text-xs text-slate-400 mb-3">
                  {t("orgSeatLimit.pendingInvite", {
                    email: modal.pendingEmail,
                  })}
                </p>
              )}
              {modal.pendingMemberId && (
                <p className="text-xs text-slate-400 mb-3">
                  {t("orgSeatLimit.pendingRoleChange")}
                </p>
              )}

              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-foreground">
                  {t("orgSeatLimit.additionalSeats")}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setAdditionalSeats(Math.max(1, additionalSeats - 1))
                    }
                    className="w-7 h-7 rounded-lg bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors text-sm font-bold"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-foreground">
                    {additionalSeats}
                  </span>
                  <button
                    onClick={() => setAdditionalSeats(additionalSeats + 1)}
                    className="w-7 h-7 rounded-lg bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors text-sm font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-500 mb-4">
                ₩{modal.monthlyPricePerSeat.toLocaleString()}/
                {t("orgSeatLimit.month")} · ₩
                {modal.yearlyPricePerSeat.toLocaleString()}/
                {t("orgSeatLimit.year")}
              </div>
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-bridge-accent/15 flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-bridge-accent" />
              </div>
              <p className="text-sm text-foreground mb-1">
                {t("orgSeatLimit.nonAdminTitle")}
              </p>
              <p className="text-xs text-slate-400">
                {t("orgSeatLimit.nonAdminMessage")}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-600">
            Esc {t("orgSeatLimit.close")}
          </span>
          {modal.isOrgAdmin ? (
            <button
              onClick={handlePurchase}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : modal.pendingMemberId ? (
                t("orgSeatLimit.purchaseAndPromote")
              ) : (
                t("orgSeatLimit.purchaseAndContinue")
              )}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all"
            >
              {t("orgSeatLimit.confirm")}
            </button>
          )}
        </div>
      </div>
    </MotionModal>
  );
}

export function BoardModalManager(props: BoardModalManagerProps) {
  const [isJobRoleManagerOpen, setIsJobRoleManagerOpen] = useState(false);
  return (
    <>
      <FeatureDetailModal
        feature={props.selectedFeature}
        tasks={props.featureTasks}
        blocks={props.blocks}
        open={props.isFeatureModalOpen}
        onClose={props.onCloseFeature}
        onAddSubtask={props.onAddSubtask}
        onRenameSubtask={props.onRenameSubtask}
        onUpdateFeature={props.onUpdateFeature}
        onDelete={props.onDeleteFeature}
        allFeatures={props.allFeatures}
        availableTags={props.tags}
        onCreateTag={props.onCreateTag}
        onUpdateTag={props.onUpdateTag}
        onDeleteTag={props.onDeleteTag}
        boardId={props.boardId}
        canEdit={props.canEdit}
        isOnboarding={props.isOnboarding}
        onTaskClick={props.onFeatureTaskClick}
      />

      <ModalErrorBoundary>
        <TaskDetailModal
          task={props.selectedTask}
          open={props.isTaskModalOpen}
          onClose={props.onCloseTask}
          onUpdate={props.onUpdateTask}
          onDelete={props.onDeleteTask}
          onMoveToDone={props.onMoveToDone}
          onMoveToBlock={props.onMoveToBlock}
          onMoveToFeature={props.onMoveToFeature}
          onMoveChecklistToTask={props.onMoveChecklistToTask}
          blocks={props.blocks}
          features={props.features}
          allTasks={props.allTasks}
          milestones={props.milestones}
          currentMilestoneId={props.kanbanSelectedMilestoneId}
          availableTags={props.tags}
          onCreateTag={props.onCreateTag}
          onUpdateTag={props.onUpdateTag}
          onDeleteTag={props.onDeleteTag}
          boardMembers={props.boardMembers}
          contractors={props.contractors}
          currentUser={props.currentUser}
          boardId={props.boardId}
          canEdit={props.canEdit}
          isAdminOrOwner={props.isAdminOrOwner}
          wsCommentEvent={props.wsCommentEvent}
          wsChecklistEvent={props.wsChecklistEvent}
          onOpenFeature={props.onOpenFeature}
          onChecklistSync={props.onChecklistSync}
          highlightChecklistItemId={props.highlightChecklistItemId}
        />
      </ModalErrorBoundary>

      <AddBlockModal
        open={props.isAddBlockModalOpen}
        onClose={props.onCloseAddBlock}
        onAdd={props.onAddBlock}
      />

      <AddBlockModal
        open={!!props.editingBlock}
        onClose={props.onCloseEditBlock}
        onAdd={props.onEditBlock}
        isEdit={true}
        initialName={props.editingBlock?.name || ""}
        initialColor={props.editingBlock?.color || "#3B82F6"}
      />

      <AddFeatureModal
        open={props.isAddFeatureModalOpen}
        onClose={props.onCloseAddFeature}
        onAdd={props.onAddFeature}
        milestones={props.milestones}
        defaultMilestoneId={props.kanbanSelectedMilestoneId}
      />

      <ShareBoardModal
        open={props.isShareBoardModalOpen}
        onClose={props.onCloseShareBoard}
        members={props.boardMembersData}
        onAddMember={props.onAddMember}
        onUpdateMemberRole={props.onUpdateMemberRole}
        onRemoveMember={props.onRemoveMember}
        onUpdateMemberColor={props.onUpdateMemberColor}
        onReorderMembers={props.onReorderMembers}
        currentUserId={props.currentUserId}
        boardId={props.boardId}
        onlineUserIds={props.onlineUsers}
        inviteLinks={props.inviteLinks}
        onCreateInviteLink={props.onCreateInviteLink}
        onDeleteInviteLink={props.onDeleteInviteLink}
        seatInfo={props.seatInfo}
        onOpenSeatManagement={props.onOpenSeatManagement}
        aiCredits={!props.hideBillingForUser ? props.aiCredits : undefined}
        onOpenAiCreditPurchase={
          !props.hideBillingForUser ? props.onOpenAiCreditPurchase : undefined
        }
        isOrgBoard={props.isOrgBoard}
        organizationName={props.organizationName}
        pendingJoinRequestCount={props.pendingJoinRequestCount}
        isAdminOrOwner={props.isAdminOrOwner}
        onJoinRequestHandled={props.onJoinRequestHandled}
        boardName={props.boardName}
        onTransferOwnership={props.onTransferOwnership}
        jobRoles={props.jobRoles}
        onUpdateMemberJobRole={props.onUpdateMemberJobRole}
        onOpenJobRoleManager={() => setIsJobRoleManagerOpen(true)}
        canManageJobRoles={props.canManageJobRoles}
      />

      <JobRoleManageModal
        open={isJobRoleManagerOpen}
        onClose={() => setIsJobRoleManagerOpen(false)}
        boardId={props.boardId}
        canManage={!!props.canManageJobRoles}
        onChanged={props.onJobRolesChanged}
      />

      {!props.hideBillingForUser && (
        <SubscriptionModal
          open={props.isSubscriptionModalOpen}
          onClose={props.onCloseSubscription}
          subscription={props.subscription}
          currentBillableMembers={props.currentBillableMembers}
          boardId={props.boardId}
          onChangeBillingCycle={props.onChangeBillingCycle}
          onPurchaseSeats={props.onPurchaseSeats}
          onCancelSubscription={props.onCancelSubscription}
          onUndoCancellation={props.onUndoCancellation}
        />
      )}

      <InquiryModal
        isOpen={props.isInquiryModalOpen}
        onClose={props.onCloseInquiry}
      />

      <MilestoneModal
        isOpen={props.isMilestoneModalOpen}
        onClose={props.onCloseMilestone}
        milestone={props.selectedMilestone}
        milestones={props.milestones}
        features={props.allFeatures}
        featureMilestoneCountMap={props.featureMilestoneCountMap}
        featurePrimaryMilestoneMap={props.featurePrimaryMilestoneMap}
        onSetPrimaryFeature={props.onSetPrimaryMilestoneFeature}
        onSave={props.onSaveMilestone}
        onDelete={props.onDeleteMilestone}
        onSelectMilestone={props.onSelectMilestone}
      />

      <MilestoneOnboardingModal
        isOpen={props.isMilestoneOnboardingOpen}
        onClose={props.onCloseMilestoneOnboarding}
        onCreateMilestone={props.onCreateMilestone}
      />

      {!props.hideBillingForUser && (
        <UpgradeModal
          open={props.isUpgradeModalOpen}
          onClose={props.onCloseUpgrade}
          trigger={props.upgradeTrigger}
          currentBillableMembers={props.currentBillableMembers}
          onUpgrade={props.onSeatUpgrade}
        />
      )}

      {!props.hideBillingForUser && (
        <PremiumBenefitsModal
          open={props.isPremiumBenefitsModalOpen}
          onClose={props.onClosePremiumBenefits}
          currentBillableMembers={props.currentBillableMembers}
          onUpgrade={props.onSeatUpgrade}
        />
      )}

      {props.seatPurchaseModal && (
        <SeatPurchaseModal
          open={props.seatPurchaseModal.open}
          onClose={props.onCloseSeatPurchase}
          seatCount={props.seatPurchaseModal.seatCount}
          billableMemberCount={props.seatPurchaseModal.billableMemberCount}
          billingCycle={props.billingCycle}
          onPurchase={props.onPurchaseSeatsAndRetry}
          pendingInviteEmail={props.seatPurchaseModal.pendingEmail || undefined}
          isRoleChange={!!props.seatPurchaseModal.pendingMemberId}
        />
      )}

      {props.orgSeatLimitModal && (
        <OrgSeatLimitModalInline
          modal={props.orgSeatLimitModal}
          onClose={props.onCloseOrgSeatLimit}
          onPurchase={props.onOrgPurchaseSeatsAndRetry}
        />
      )}

      <AlertModal
        open={
          props.alertModal.open &&
          !(props.hideBillingForUser && props.alertModal.type === "premium")
        }
        onClose={props.onCloseAlert}
        type={props.alertModal.type}
      />

      <AiCreditPurchaseModal
        isOpen={props.showCreditModal}
        onClose={props.onCloseCreditModal}
        boardId={props.boardId}
        mode={props.creditModalMode}
        onPurchaseComplete={props.onCreditPurchaseComplete}
        currentCredits={props.currentCredits}
        isOrgBoard={props.isOrgBoard}
      />
    </>
  );
}
