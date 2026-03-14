import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Loader2, UserPlus } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { boardJoinRequestAPI } from '../utils/api';
import { BoardJoinRequest } from '../types';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '../utils/dateUtils';

interface JoinRequestsPanelProps {
  boardId: string;
  onMemberAdded?: () => void;
}

export default function JoinRequestsPanel({
  boardId,
  onMemberAdded,
}: JoinRequestsPanelProps) {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<BoardJoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await boardJoinRequestAPI.list(boardId);
      setRequests(data.requests);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (requestId: string) => {
    if (processingId) return;
    setProcessingId(requestId);
    try {
      await boardJoinRequestAPI.approve(boardId, requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      onMemberAdded?.();
    } catch {
      // error handled
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (processingId) return;
    setProcessingId(requestId);
    try {
      await boardJoinRequestAPI.reject(boardId, requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      // error handled
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-500">
        {t('board.joinRequest.noRequests', '대기 중인 참가 요청이 없습니다.')}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {requests.map((request, index) => (
          <motion.div
            key={request.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ delay: index * 0.04 }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
              {request.requester.profile_image ? (
                <img
                  src={request.requester.profile_image}
                  alt={request.requester.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <UserPlus className="w-4 h-4 text-bridge-accent" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {request.requester.name}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {request.requester.email}
                {request.message && ` · "${request.message}"`}
              </div>
              <div className="text-xs text-slate-600">
                {formatRelativeTime(request.created_at)}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {processingId === request.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
              ) : (
                <>
                  <IconButton
                    aria-label={t('board.joinRequest.approve', '승인')}
                    onClick={() => handleApprove(request.id)}
                    className="text-emerald-500 hover:bg-emerald-500/10"
                    title={t('board.joinRequest.approve', '승인')}
                  >
                    <Check />
                  </IconButton>
                  <IconButton
                    aria-label={t('board.joinRequest.reject', '거절')}
                    onClick={() => handleReject(request.id)}
                    className="text-red-400 hover:bg-red-500/10"
                    title={t('board.joinRequest.reject', '거절')}
                  >
                    <X />
                  </IconButton>
                </>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
