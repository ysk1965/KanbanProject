import { useMemo } from 'react';
import { Board, BoardTierInfo } from '../types';
import { BoardMember as ShareBoardMember, MemberRole } from '../components/ShareBoardModal';

export function useBoardPermissions(
  tierInfo: BoardTierInfo | null,
  boardMembersData: ShareBoardMember[],
  currentUser: { id: string; role?: string } | null,
  board: Board | null,
  hideBilling: boolean,
  isSystemAdmin: boolean,
  isTester: boolean
) {
  const canAccessSchedule = hideBilling || (tierInfo?.can_access_schedule ?? true);
  const canAccessMilestone = hideBilling || (tierInfo?.can_access_milestone ?? true);
  const canAccessSlack = hideBilling || (tierInfo?.can_access_slack ?? true);
  const canAccessStatistics = hideBilling || (tierInfo?.can_access_statistics ?? true);

  const isAdminOrOwner = boardMembersData?.some(
    (m) => m.userId === currentUser?.id && (m.role === 'owner' || m.role === 'admin')
  ) ?? false;

  const canViewStatistics = canAccessStatistics && (isAdminOrOwner || isSystemAdmin);

  const memberRole = boardMembersData?.find(
    (m) => m.userId === currentUser?.id
  )?.role;

  const currentUserRole = memberRole ?? (
    isSystemAdmin && board?.my_role
      ? board.my_role.toLowerCase() as MemberRole
      : undefined
  );

  const isViewer = currentUserRole === 'viewer';
  const isOwner = currentUserRole === 'owner';
  const canEdit = !isViewer;
  const hideBillingForUser = hideBilling || !isOwner;

  return {
    canAccessSchedule,
    canAccessMilestone,
    canAccessSlack,
    canAccessStatistics,
    canViewStatistics,
    isAdminOrOwner,
    currentUserRole,
    isViewer,
    isOwner,
    canEdit,
    hideBillingForUser,
  };
}
