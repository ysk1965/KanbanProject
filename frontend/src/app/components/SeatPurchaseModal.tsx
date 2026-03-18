import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, Plus, Minus } from 'lucide-react';
import { MotionModal } from './ui/MotionModal';

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
      // Polar checkout 리다이렉트가 발생하므로 여기까지 도달하지 않음
    } catch (error: any) {
      console.error('Failed to purchase seats:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose} className="p-0 overflow-hidden">
        <div className="p-6">
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 text-white/60 hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-bridge-accent/10 rounded-xl">
              <Users className="h-5 w-5 text-bridge-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('seatPurchase.title')}</h2>
              <p className="text-sm text-slate-400">{t('seatPurchase.subtitle')}</p>
            </div>
          </div>

          {/* Current seat usage */}
          <div className="bg-foreground/5 rounded-xl p-4 mb-4 border border-foreground/10">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">{t('seatPurchase.currentSeats')}</span>
              <span className="text-lg font-bold text-foreground">
                {billableMemberCount} / {seatCount}
              </span>
            </div>
            <div className="mt-2 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-bridge-accent rounded-full"
                style={{ width: `${Math.min((billableMemberCount / seatCount) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Pending action notice */}
          {(pendingInviteEmail || isRoleChange) && (
            <div className="bg-bridge-accent/5 border border-bridge-accent/20 rounded-xl p-3 mb-4">
              <p className="text-sm text-muted-foreground">
                {isRoleChange
                  ? t('seatPurchase.pendingRoleChange')
                  : t('seatPurchase.pendingInvite', { email: pendingInviteEmail })}
              </p>
            </div>
          )}

          {/* Quantity selector */}
          <div className="mb-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 block">
              {t('seatPurchase.additionalSeats')}
            </label>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setAdditionalSeats(Math.max(1, additionalSeats - 1))}
                disabled={additionalSeats <= 1}
                className="p-2 bg-foreground/5 border border-foreground/10 rounded-xl hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Minus className="h-4 w-4 text-foreground" />
              </button>
              <span className="text-3xl font-bold text-foreground w-16 text-center">{additionalSeats}</span>
              <button
                onClick={() => setAdditionalSeats(additionalSeats + 1)}
                className="p-2 bg-foreground/5 border border-foreground/10 rounded-xl hover:bg-foreground/10 transition-colors"
              >
                <Plus className="h-4 w-4 text-foreground" />
              </button>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="bg-foreground/5 rounded-xl p-4 mb-6 border border-foreground/10">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">
                {additionalSeats} {t('seatPurchase.seats')} × ${pricePerSeat}/{period}
              </span>
              <span className="text-foreground font-bold">${additionalCost}</span>
            </div>
            <div className="border-t border-foreground/10 mt-2 pt-2 flex justify-between text-sm">
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
              className="flex-1 px-4 py-3 bg-foreground/5 border border-foreground/10 text-muted-foreground rounded-xl font-medium hover:bg-foreground/10 transition-all"
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
        </div>
    </MotionModal>
  );
}
