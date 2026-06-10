import { useState } from "react";
import { Block } from "../types";
import { MemberRole } from "../components/ShareBoardModal";
import { UpgradeTrigger } from "../components/UpgradeModal";

export interface SeatPurchaseModalState {
  open: boolean;
  seatCount: number;
  billableMemberCount: number;
  pendingEmail: string;
  pendingRole: MemberRole;
  pendingMemberId?: string;
}

export interface OrgSeatLimitModalState {
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
}

export interface AlertModalState {
  open: boolean;
  type: "premium" | "permission";
}

/**
 * KanbanBoardPage의 모달 open/close 상태 모음.
 * 순수 상태 이동(behavior 변경 없음) — 도메인 데이터(selectedFeature 등)는 페이지에 유지.
 * 모달은 중첩(stack)될 수 있으므로 activeModal enum이 아닌 개별 boolean으로 관리.
 */
export function useBoardModals() {
  // 모달 상태
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [isAddFeatureModalOpen, setIsAddFeatureModalOpen] = useState(false);
  const [isShareBoardModalOpen, setIsShareBoardModalOpen] = useState(false);
  const [isContractorManagerOpen, setIsContractorManagerOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isPremiumBenefitsModalOpen, setIsPremiumBenefitsModalOpen] =
    useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [isActivityLogModalOpen, setIsActivityLogModalOpen] = useState(false);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [isMilestoneOnboardingOpen, setIsMilestoneOnboardingOpen] =
    useState(false);

  // Tier & Limits 모달 상태
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeTrigger, setUpgradeTrigger] =
    useState<UpgradeTrigger>("task_limit");
  const [seatPurchaseModal, setSeatPurchaseModal] =
    useState<SeatPurchaseModalState | null>(null);
  const [orgSeatLimitModal, setOrgSeatLimitModal] =
    useState<OrgSeatLimitModalState | null>(null);

  // AI Credits 모달 상태
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditModalMode, setCreditModalMode] = useState<
    "purchase" | "exhausted"
  >("purchase");

  // Quick Add Task 모달 상태
  const [quickAddBlockId, setQuickAddBlockId] = useState<string | null>(null);
  const [isQuickAddSubmitting, setIsQuickAddSubmitting] = useState(false);

  // 키보드 단축키 도움말 모달
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);

  // Alert Modal 상태
  const [alertModal, setAlertModal] = useState<AlertModalState>({
    open: false,
    type: "premium",
  });

  // 키보드 단축키 비활성화 판단용 파생값
  const isAnyModalOpen =
    isFeatureModalOpen ||
    isTaskModalOpen ||
    isAddBlockModalOpen ||
    isAddFeatureModalOpen ||
    isShareBoardModalOpen ||
    isSubscriptionModalOpen ||
    isPremiumBenefitsModalOpen ||
    isInquiryModalOpen ||
    isActivityLogModalOpen ||
    isMilestoneModalOpen ||
    isUpgradeModalOpen ||
    isMilestoneOnboardingOpen ||
    showCreditModal ||
    !!quickAddBlockId ||
    !!seatPurchaseModal ||
    !!orgSeatLimitModal ||
    alertModal.open ||
    isShortcutsHelpOpen;

  return {
    isFeatureModalOpen,
    setIsFeatureModalOpen,
    isTaskModalOpen,
    setIsTaskModalOpen,
    isAddBlockModalOpen,
    setIsAddBlockModalOpen,
    editingBlock,
    setEditingBlock,
    isAddFeatureModalOpen,
    setIsAddFeatureModalOpen,
    isShareBoardModalOpen,
    setIsShareBoardModalOpen,
    isContractorManagerOpen,
    setIsContractorManagerOpen,
    isTrashOpen,
    setIsTrashOpen,
    isSubscriptionModalOpen,
    setIsSubscriptionModalOpen,
    isPremiumBenefitsModalOpen,
    setIsPremiumBenefitsModalOpen,
    isInquiryModalOpen,
    setIsInquiryModalOpen,
    isActivityLogModalOpen,
    setIsActivityLogModalOpen,
    isMilestoneModalOpen,
    setIsMilestoneModalOpen,
    isMilestoneOnboardingOpen,
    setIsMilestoneOnboardingOpen,
    isUpgradeModalOpen,
    setIsUpgradeModalOpen,
    upgradeTrigger,
    setUpgradeTrigger,
    seatPurchaseModal,
    setSeatPurchaseModal,
    orgSeatLimitModal,
    setOrgSeatLimitModal,
    showCreditModal,
    setShowCreditModal,
    creditModalMode,
    setCreditModalMode,
    quickAddBlockId,
    setQuickAddBlockId,
    isQuickAddSubmitting,
    setIsQuickAddSubmitting,
    isShortcutsHelpOpen,
    setIsShortcutsHelpOpen,
    alertModal,
    setAlertModal,
    isAnyModalOpen,
  };
}
