import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Clock, Loader2 } from 'lucide-react';
import { boardJoinRequestAPI } from '../utils/api';
import { useTranslation } from 'react-i18next';

interface JoinRequestBannerProps {
  boardId: string;
  hasPendingRequest: boolean;
  onRequestSent: () => void;
}

export default function JoinRequestBanner({
  boardId,
  hasPendingRequest,
  onRequestSent,
}: JoinRequestBannerProps) {
  const { t } = useTranslation();
  const [isPending, setIsPending] = useState(hasPendingRequest);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequest = async () => {
    if (isSubmitting || isPending) return;
    setIsSubmitting(true);
    try {
      await boardJoinRequestAPI.create(boardId);
      setIsPending(true);
      onRequestSent();
    } catch {
      // error handled by apiClient
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-3 mb-1 px-4 py-3 rounded-xl bg-bridge-accent/10 border border-bridge-accent/20 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 min-w-0">
        <UserPlus className="w-4 h-4 text-bridge-accent shrink-0" />
        <span className="text-sm text-foreground truncate">
          {t('board.joinRequest.viewerMessage', '조직 구성원으로 보드를 열람 중입니다. 멤버로 참가하면 편집할 수 있습니다.')}
        </span>
      </div>

      {isPending ? (
        <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 whitespace-nowrap shrink-0">
          <Clock className="w-3 h-3" />
          {t('board.joinRequest.pending', '승인 대기중')}
        </span>
      ) : (
        <button
          onClick={handleRequest}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <UserPlus className="w-3 h-3" />
          )}
          {t('board.joinRequest.requestJoin', '참가 신청')}
        </button>
      )}
    </motion.div>
  );
}
