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
  onDeleteFeature: (featureId: string) => void;
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
  // Tag
  tags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (tagId: string, data: { name?: string; color?: string }) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  // AddBlock Modal
  isAddBlockModalOpen: boolean;
  onCloseAddBlock: () => void;
  onAddBlock: (name: string, color: string) => void;
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
  hideBillingForUser: boolean;
  // Subscription Modal
  isSubscriptionModalOpen: boolean;
  onCloseSubscription: () => void;
  subscription: Subscription | null;
  currentBillableMembers: number;
  onChangeBillingCycle: (cycle: 'MONTHLY' | 'YEARLY') => void;
  onPurchaseSeats: (seats: number) => void;
  onCancelSubscription: () => void;
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
  // Alert Modal
  alertModal: { open: boolean; type: 'premium' | 'permission' };
  onCloseAlert: () => void;
  // AI Credit Modal
  showCreditModal: boolean;
  onCloseCreditModal: () => void;
  creditModalMode: 'purchase' | 'exhausted';
  onCreditPurchaseComplete: (credits: AiCredits) => void;
  currentCredits: AiCredits | null;
  // Permissions
  canEdit: boolean;
  isAdminOrOwner: boolean;
  currentUser: any;
  boardMembers: ShareBoardMember[];
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
        availableTags={props.tags}
        onCreateTag={props.onCreateTag}
        onUpdateTag={props.onUpdateTag}
        onDeleteTag={props.onDeleteTag}
        boardId={props.boardId}
        canEdit={props.canEdit}
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
      />

      <AddBlockModal
        open={props.isAddBlockModalOpen}
        onClose={props.onCloseAddBlock}
        onAdd={props.onAddBlock}
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
      />

      {!props.hideBillingForUser && (
        <SubscriptionModal
          open={props.isSubscriptionModalOpen}
          onClose={props.onCloseSubscription}
          subscription={props.subscription}
          currentBillableMembers={props.currentBillableMembers}
          onChangeBillingCycle={props.onChangeBillingCycle}
          onPurchaseSeats={props.onPurchaseSeats}
          onCancelSubscription={props.onCancelSubscription}
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
        features={props.allFeatures}
        featureMilestoneCountMap={props.featureMilestoneCountMap}
        onSave={props.onSaveMilestone}
        onDelete={props.onDeleteMilestone}
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
