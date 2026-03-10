import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, AlertTriangle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { OrgMemberDetail } from '../../../types';

interface MemberSettingsTabProps {
  member: OrgMemberDetail;
  isSelf: boolean;
  onLeaveOrg: () => Promise<void>;
}

export function MemberSettingsTab({ member, isSelf, onLeaveOrg }: MemberSettingsTabProps) {
  const { t } = useTranslation();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const isOwner = member.role === 'OWNER';

  const handleLeave = async () => {
    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    try {
      setLeaving(true);
      await onLeaveOrg();
    } catch {
      setLeaving(false);
      setConfirmLeave(false);
    }
  };

  if (!isSelf) return null;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-red-500/20 overflow-hidden"
      >
        <div className="px-5 py-3 bg-red-500/5 border-b border-red-500/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h3 className="text-sm font-bold text-red-400">
              {t('organization.members.detail.settings.dangerZone', 'Danger Zone')}
            </h3>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Leave Organization */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t('organization.members.detail.settings.leaveOrg', '조직 나가기')}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {t('organization.members.detail.settings.leaveOrgDesc', '조직에서 나가면 소속된 모든 보드에서도 함께 제거됩니다. 이 작업은 되돌릴 수 없습니다.')}
              </p>
            </div>
            <button
              onClick={handleLeave}
              disabled={isOwner || leaving}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
            >
              {leaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              {t('organization.members.detail.settings.leaveButton', '나가기')}
            </button>
          </div>

          {isOwner && (
            <p className="text-[10px] text-amber-400">
              {t('organization.members.detail.settings.ownerCannotLeave', '조직 소유자는 나갈 수 없습니다. 먼저 소유권을 이전해주세요.')}
            </p>
          )}

          {/* Confirm */}
          {confirmLeave && !isOwner && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl"
            >
              <p className="text-sm text-red-400 mb-3">
                {t('organization.members.detail.settings.leaveConfirm', '정말 이 조직에서 나가시겠습니까? 소속된 모든 보드에서 제거되며, 다시 참여하려면 새로 초대를 받아야 합니다.')}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmLeave(false)}
                  disabled={leaving}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-50"
                >
                  {t('organization.members.detail.cancel')}
                </button>
                <button
                  onClick={handleLeave}
                  disabled={leaving}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {leaving && <Loader2 className="h-3 w-3 animate-spin" />}
                  {t('organization.members.detail.settings.confirmLeave', '나가기 확인')}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
