import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle, Sparkles, Coins } from 'lucide-react';
import { AiCredits } from '../../types';
import { diaryService } from '../../utils/services';
import { Button } from '../ui/button';
import { MotionModal } from '../ui/MotionModal';

interface PersonalCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'purchase' | 'exhausted';
  onPurchaseComplete?: (credits: AiCredits) => void;
  currentCredits?: AiCredits | null;
}

const CREDIT_PACKAGES = [100, 200, 300, 500, 1000];
const PRICE_PER_CREDIT = 10; // KRW

export function PersonalCreditModal({
  isOpen,
  onClose,
  mode,
  onPurchaseComplete,
  currentCredits,
}: PersonalCreditModalProps) {
  const { t } = useTranslation();
  const [internalMode, setInternalMode] = useState<'purchase' | 'exhausted'>(mode);
  const [selectedAmount, setSelectedAmount] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPrice = selectedAmount * PRICE_PER_CREDIT;

  const handlePurchase = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await diaryService.purchasePersonalCredits({
        credit_amount: selectedAmount,
        amount: totalPrice,
      });

      if (onPurchaseComplete) {
        onPurchaseComplete(result.updated_credits);
      }

      onClose();
    } catch (err: any) {
      console.error('Personal credit purchase failed:', err);
      setError(err?.message || t('ai_credits.purchase.failed', '구매에 실패했습니다'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MotionModal open={isOpen} onClose={onClose} className="sm:max-w-md p-0 overflow-hidden">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            {internalMode === 'exhausted' ? (
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-500" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-bridge-accent/15 border border-bridge-accent/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-bridge-accent" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {internalMode === 'exhausted'
                  ? t('personal_credits.exhausted.title', 'AI 크레딧 소진')
                  : t('personal_credits.purchase.title', 'AI 크레딧 충전')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('personal_credits.subtitle', '개인 AI 다이어리 크레딧')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Credit Status */}
        {currentCredits && (
          <div className="mb-6 p-4 bg-foreground/5 border border-foreground/10 rounded-xl">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="text-center">
                <p className="text-slate-400 text-xs">{t('personal_credits.monthly', '월간')}</p>
                <p className="text-lg font-bold text-foreground mt-0.5">
                  {currentCredits.monthly_credits - currentCredits.monthly_used}
                  <span className="text-xs text-slate-500 font-normal">/{currentCredits.monthly_credits}</span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs">{t('personal_credits.purchased', '충전')}</p>
                <p className="text-lg font-bold text-bridge-secondary mt-0.5">
                  {currentCredits.purchased_credits}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-xs">{t('personal_credits.total', '전체')}</p>
                <p className={`text-lg font-bold mt-0.5 ${
                  currentCredits.total_available <= 0
                    ? 'text-red-400'
                    : currentCredits.total_available <= 3
                      ? 'text-amber-400'
                      : 'text-foreground'
                }`}>
                  {currentCredits.total_available}
                </p>
              </div>
            </div>
            {currentCredits.reset_date && (
              <p className="text-[11px] text-slate-500 text-center mt-3 pt-3 border-t border-foreground/[0.08]">
                {t('personal_credits.reset_info', '월간 크레딧 리셋')}: {new Date(currentCredits.reset_date).toLocaleDateString('ko-KR')}
              </p>
            )}
          </div>
        )}

        {/* Exhausted Mode Warning */}
        {internalMode === 'exhausted' && (
          <div className="mb-6 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <p className="text-sm text-muted-foreground">
              {t('personal_credits.exhausted.description', 'AI 크레딧이 모두 소진되었습니다. 크레딧을 충전하면 다이어리 AI 대화를 계속할 수 있습니다.')}
            </p>
          </div>
        )}

        {/* Purchase Section */}
        {internalMode === 'purchase' && (
          <>
            {/* Package Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-muted-foreground mb-3">
                {t('ai_credits.purchase.quantity', '충전할 크레딧')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CREDIT_PACKAGES.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setSelectedAmount(amount)}
                    className={`px-4 py-3 rounded-xl font-bold transition-all ${
                      selectedAmount === amount
                        ? 'bg-bridge-accent text-white shadow-lg shadow-bridge-accent/30'
                        : 'bg-foreground/5 text-muted-foreground hover:bg-foreground/10 border border-foreground/10'
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Summary */}
            <div className="mb-6 p-4 bg-foreground/5 border border-foreground/10 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">{t('ai_credits.purchase.unit_price', '크레딧당 단가')}</span>
                <span className="text-sm text-muted-foreground">₩{PRICE_PER_CREDIT.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">{t('ai_credits.purchase.quantity', '수량')}</span>
                <span className="text-sm text-muted-foreground">{selectedAmount} {t('ai_credits.purchase.quantity_unit', '크레딧')}</span>
              </div>
              <div className="h-px bg-foreground/10 my-3" />
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">{t('ai_credits.purchase.total_price', '결제 금액')}</span>
                <span className="text-2xl font-bold text-bridge-accent">
                  ₩{totalPrice.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={onClose}
                variant="ghost"
                className="flex-1 bg-foreground/5 hover:bg-foreground/10 text-foreground"
              >
                {t('common.cancel', '취소')}
              </Button>
              <Button
                onClick={handlePurchase}
                disabled={isLoading}
                className="flex-1 bg-bridge-accent hover:bg-bridge-accent/90 text-white font-bold"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('common.loading', '처리 중...')}
                  </span>
                ) : (
                  <>
                    <Coins className="w-4 h-4 mr-1.5" />
                    {t('ai_credits.purchase.buy_button', '충전하기')}
                  </>
                )}
              </Button>
            </div>

            <p className="mt-4 text-xs text-slate-500 text-center">
              {t('personal_credits.purchase.description', '충전한 크레딧은 월간 리셋과 별도로 유지됩니다')}
            </p>
          </>
        )}

        {/* Exhausted Mode Actions */}
        {internalMode === 'exhausted' && (
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => setInternalMode('purchase')}
              className="w-full bg-bridge-accent hover:bg-bridge-accent/90 text-white font-bold"
            >
              <Coins className="w-4 h-4 mr-1.5" />
              {t('personal_credits.exhausted.buy_button', '크레딧 충전하기')}
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              className="w-full bg-foreground/5 hover:bg-foreground/10 text-foreground"
            >
              {t('personal_credits.exhausted.later_button', '나중에')}
            </Button>
          </div>
        )}
      </div>
    </MotionModal>
  );
}
