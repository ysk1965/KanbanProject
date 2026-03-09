import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Feature, Task, Block, Tag, Milestone, Subscription, AiCredits, InviteLink, BoardWebSocketEvent } from '../types';
import { BoardMember as ShareBoardMember, MemberRole } from './ShareBoardModal';
import { UpgradeTrigger } from './UpgradeModal';
import { FeatureDetailModal } from './FeatureDetailModal';
import { TaskDetailModal } from './TaskDetailModal';
import { AddBlockModal } from './AddBlockModal';
import { AddFeatureModal } from './AddFeatureModal';
import { ShareBoardModal } from './ShareBoardModal';
import { SubscriptionModal } from './SubscriptionModal';
import { InquiryModal } from './InquiryModal';
import { MilestoneModal } from './MilestoneModal';
import { MilestoneOnboardingModal } from './MilestoneOnboardingModal';
import { UpgradeModal } from './UpgradeModal';
import { PremiumBenefitsModal } from './PremiumBenefitsModal';
import { SeatPurchaseModal } from './SeatPurchaseModal';
import { AlertModal } from './AlertModal';
import { AiCreditPurchaseModal } from './AiCreditPurchaseModal';
import { MotionModal } from './ui/MotionModal';
import { Users, Loader2 } from 'lucide-react';

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
  onDeleteFeature: (featureId: string, taskMigrations?: Array<{ task_id: string; target_feature_id: string }>) => void;
  onFeatureTaskClick?: (task: Task) => void;
  // Task Modal
  selectedTask: Task | null;
  isTaskModalOpen: boolean;
  onCloseTask: () => void;
  onUpdateTask: (updates: Partial<Task>) => void;
  onDeleteTask: (taskId: string) => void;
  onMoveToDone: (taskId: string) => void;
  onMoveToBlock: (taskId: string, blockId: string) => void;
  onMoveToFeature: (taskId: string, featureId: string) => void;
  onMoveChecklistToTask: (checklistItemId: string, sourceTaskId: string, targetTaskId: string) => void;
  features: Feature[];
  allTasks: Task[];
  wsCommentEvent: BoardWebSocketEvent | null;
  wsChecklistEvent: BoardWebSocketEvent | null;
  onOpenFeature?: (featureId: string) => void;
  // Tag
  tags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (tagId: string, data: { name?: string; color?: string }) => Promise<void>;
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
  onAddFeature: (data: { title: string; description?: string; dueDate?: string; milestoneId?: string }) => void;
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
  onCreateInviteLink: (role: string, maxUses: number, expiresIn: string) => Promise<InviteLink>;
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
  hideBillingForUser: boolean;
  // Subscription Modal
  isSubscriptionModalOpen: boolean;
  onCloseSubscription: () => void;
  subscription: Subscription | null;
  currentBillableMembers: number;
  onChangeBillingCycle: (cycle: 'MONTHLY' | 'YEARLY') => void;
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
  onSeatUpgrade: (billingCycle: 'MONTHLY' | 'YEARLY', seatCount: number) => void;
  // Premium Benefits Modal
  isPremiumBenefitsModalOpen: boolean;
  onClosePremiumBenefits: () => void;
  // Seat Purchase Modal
  seatPurchaseModal: { open: boolean; seatCount: number; billableMemberCount: number; pendingEmail: string; pendingRole: MemberRole; pendingMemberId?: string } | null;
  onCloseSeatPurchase: () => void;
  billingCycle: 'MONTHLY' | 'YEARLY';
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
  alertModal: { open: boolean; type: 'premium' | 'permission' };
  onCloseAlert: () => void;
  // AI Credit Modal
  showCreditModal: boolean;
  onCloseCreditModal: () => void;
  creditModalMode: 'purchase' | 'exhausted';
  onCreditPurchaseComplete: (credits: AiCredits) => void;
  currentCredits: AiCredits | null;
  // Onboarding
  isOnboarding?: boolean;
  // Permissions
  canEdit: boolean;
  isAdminOrOwner: boolean;
  currentUser: any;
  boardMembers: ShareBoardMember[];
}

function OrgSeatLimitModalInline({
  modal,
  onClose,
  onPurchase,
}: {
  modal: NonNullable<BoardModalManagerProps['orgSeatLimitModal']>;
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
            <h3 className="text-sm font-bold text-foreground">{t('orgSeatLimit.title')}</h3>
            <p className="text-[11px] text-slate-500">{t('orgSeatLimit.subtitle')}</p>
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          {modal.isOrgAdmin ? (
            <>
              <div className="flex items-center justify-between py-2 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  {t('orgSeatLimit.currentSeats')}
                </span>
                <span className="text-sm font-bold text-foreground">
                  {modal.activeMemberCount} / {modal.seatCount}
                </span>
              </div>

              {modal.pendingEmail && (
                <p className="text-xs text-slate-400 mb-3">
                  {t('orgSeatLimit.pendingInvite', { email: modal.pendingEmail })}
                </p>
              )}
              {modal.pendingMemberId && (
                <p className="text-xs text-slate-400 mb-3">
                  {t('orgSeatLimit.pendingRoleChange')}
                </p>
              )}

              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-foreground">{t('orgSeatLimit.additionalSeats')}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAdditionalSeats(Math.max(1, additionalSeats - 1))}
                    className="w-7 h-7 rounded-lg bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors text-sm font-bold"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-foreground">{additionalSeats}</span>
                  <button
                    onClick={() => setAdditionalSeats(additionalSeats + 1)}
                    className="w-7 h-7 rounded-lg bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors text-sm font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 mb-4">
                ₩{modal.monthlyPricePerSeat.toLocaleString()}/{t('orgSeatLimit.month')} · ₩{modal.yearlyPricePerSeat.toLocaleString()}/{t('orgSeatLimit.year')}
              </div>
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-bridge-accent/15 flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-bridge-accent" />
              </div>
              <p className="text-sm text-foreground mb-1">{t('orgSeatLimit.nonAdminTitle')}</p>
              <p className="text-xs text-slate-400">{t('orgSeatLimit.nonAdminMessage')}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-[10px] text-slate-600">Esc {t('orgSeatLimit.close')}</span>
          {modal.isOrgAdmin ? (
            <button
              onClick={handlePurchase}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : modal.pendingMemberId ? (
                t('orgSeatLimit.purchaseAndPromote')
              ) : (
                t('orgSeatLimit.purchaseAndContinue')
              )}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all"
            >
              {t('orgSeatLimit.confirm')}
            </button>
          )}
        </div>
      </div>
    </MotionModal>
  );
}

export function BoardModalManager(props: BoardModalManagerProps) {
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
        availableTags={props.tags}
        onCreateTag={props.onCreateTag}
        onUpdateTag={props.onUpdateTag}
        onDeleteTag={props.onDeleteTag}
        boardMembers={props.boardMembers}
        currentUser={props.currentUser}
        boardId={props.boardId}
        canEdit={props.canEdit}
        isAdminOrOwner={props.isAdminOrOwner}
        wsCommentEvent={props.wsCommentEvent}
        wsChecklistEvent={props.wsChecklistEvent}
        onOpenFeature={props.onOpenFeature}
      />

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
        initialName={props.editingBlock?.name || ''}
        initialColor={props.editingBlock?.color || '#3B82F6'}
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
        onOpenAiCreditPurchase={!props.hideBillingForUser ? props.onOpenAiCreditPurchase : undefined}
        isOrgBoard={props.isOrgBoard}
        organizationName={props.organizationName}
        pendingJoinRequestCount={props.pendingJoinRequestCount}
        isAdminOrOwner={props.isAdminOrOwner}
        onJoinRequestHandled={props.onJoinRequestHandled}
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
        open={props.alertModal.open && !(props.hideBillingForUser && props.alertModal.type === 'premium')}
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
      />
    </>
  );
}
