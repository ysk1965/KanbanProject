import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Plus, Minus } from 'lucide-react';

interface SeatPurchaseModalProps {
  open: boolean;
  onClose: () => void;
  seatCount: number;
  billableMemberCount: number;
  billingCycle: 'MONTHLY' | 'YEARLY';
  onPurchase: (additionalSeats: number) => Promise<void>;
  pendingInviteEmail?: string;
  isRoleChange?: boolean; // Observer→Member 역할 승격 케이스
}

const PRICE_PER_SEAT = {
  monthly: 5, // $5
  yearly: 50, // $50
};

export function SeatPurchaseModal({
  open,
  onClose,
  seatCount,
  billableMemberCount,
  billingCycle,
  onPurchase,
  pendingInviteEmail,
  isRoleChange,
}: SeatPurchaseModalProps) {
  const { t } = useTranslation();
  const [additionalSeats, setAdditionalSeats] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const pricePerSeat = billingCycle === 'YEARLY' ? PRICE_PER_SEAT.yearly : PRICE_PER_SEAT.monthly;
  const period = billingCycle === 'YEARLY' ? t('seatPurchase.year') : t('seatPurchase.month');
  const additionalCost = additionalSeats * pricePerSeat;
  const newSeatCount = seatCount + additionalSeats;
  const newTotalPrice = newSeatCount * pricePerSeat;

  const handlePurchase = async () => {
    setIsProcessing(true);
    try {
      await onPurchase(additionalSeats);
      // requestPayment 이후 Toss 결제창으로 리다이렉트됨
    } catch (error: any) {
      if (error?.code === 'PAY_PROCESS_CANCELED' || error?.code === 'USER_CANCEL') {
        // 사용자가 결제를 취소한 경우
      } else {
        console.error('Failed to purchase seats:', error);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-bridge-obsidian rounded-2xl border border-white/10 shadow-2xl p-6"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 p-1 text-white/60 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-bridge-accent/10 rounded-xl">
                <Users className="h-5 w-5 text-bridge-accent" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{t('seatPurchase.title')}</h2>
                <p className="text-sm text-slate-400">{t('seatPurchase.subtitle')}</p>
              </div>
            </div>

            {/* Current seat usage */}
            <div className="bg-white/5 rounded-xl p-4 mb-4 border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">{t('seatPurchase.currentSeats')}</span>
                <span className="text-lg font-bold text-white">
                  {billableMemberCount} / {seatCount}
                </span>
              </div>
              <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-bridge-accent rounded-full"
                  style={{ width: `${Math.min((billableMemberCount / seatCount) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Pending action notice */}
            {(pendingInviteEmail || isRoleChange) && (
              <div className="bg-bridge-accent/5 border border-bridge-accent/20 rounded-xl p-3 mb-4">
                <p className="text-sm text-slate-300">
                  {isRoleChange
                    ? t('seatPurchase.pendingRoleChange')
                    : t('seatPurchase.pendingInvite', { email: pendingInviteEmail })}
                </p>
              </div>
            )}

            {/* Quantity selector */}
            <div className="mb-4">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">
                {t('seatPurchase.additionalSeats')}
              </label>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setAdditionalSeats(Math.max(1, additionalSeats - 1))}
                  disabled={additionalSeats <= 1}
                  className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-4 w-4 text-white" />
                </button>
                <span className="text-3xl font-bold text-white w-16 text-center">{additionalSeats}</span>
                <button
                  onClick={() => setAdditionalSeats(additionalSeats + 1)}
                  className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
                >
                  <Plus className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>

            {/* Price breakdown */}
            <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">
                  {additionalSeats} {t('seatPurchase.seats')} × ${pricePerSeat}/{period}
                </span>
                <span className="text-white font-bold">${additionalCost}</span>
              </div>
              <div className="border-t border-white/10 mt-2 pt-2 flex justify-between text-sm">
                <span className="text-slate-400">{t('seatPurchase.newTotal')}</span>
                <span className="text-bridge-secondary font-bold">
                  {newSeatCount} {t('seatPurchase.seats')}, ${newTotalPrice}/{period}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-slate-300 rounded-xl font-medium hover:bg-white/10 transition-all"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handlePurchase}
                disabled={isProcessing}
                className="flex-1 px-4 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing
                  ? t('common.processing')
                  : isRoleChange
                    ? t('seatPurchase.purchaseAndPromote')
                    : t('seatPurchase.purchaseAndContinue')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
