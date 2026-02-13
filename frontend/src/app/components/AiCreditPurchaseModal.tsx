import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle, Sparkles } from 'lucide-react';
import { AiCredits } from '../types';
import { aiCreditService } from '../utils/services';
import { Button } from './ui/button';

interface AiCreditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  mode: 'purchase' | 'exhausted';
  onPurchaseComplete?: (credits: AiCredits) => void;
  currentCredits?: AiCredits | null;
}

const CREDIT_PACKAGES = [100, 200, 300, 500, 1000];
const PRICE_PER_CREDIT = 1000; // KRW

export function AiCreditPurchaseModal({
  isOpen,
  onClose,
  boardId,
  mode,
  onPurchaseComplete,
  currentCredits,
}: AiCreditPurchaseModalProps) {
  const { t } = useTranslation();
  const [internalMode, setInternalMode] = useState<'purchase' | 'exhausted'>(mode);
  const [selectedAmount, setSelectedAmount] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalPrice = selectedAmount * PRICE_PER_CREDIT;

  const handlePurchase = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await aiCreditService.purchase(boardId, {
        credit_amount: selectedAmount,
        amount: totalPrice,
      });

      // Show success toast
      alert(t('ai_credits.purchase.success', { count: selectedAmount }));

      if (onPurchaseComplete) {
        onPurchaseComplete(result.updated_credits);
      }

      onClose();
    } catch (err: any) {
      console.error('Purchase failed:', err);
      setError(err?.message || t('ai_credits.purchase.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            {internalMode === 'exhausted' ? (
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-500" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-bridge-accent/10 border border-bridge-accent/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-bridge-accent" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-white">
                {internalMode === 'exhausted'
                  ? t('ai_credits.exhausted_modal.title')
                  : t('ai_credits.purchase.title')}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Exhausted Mode Warning */}
        {internalMode === 'exhausted' && (
          <div className="mb-6 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <p className="text-sm text-slate-300 whitespace-pre-line">
              {t('ai_credits.exhausted_modal.description')}
            </p>
          </div>
        )}

        {/* Purchase Mode */}
        {internalMode === 'purchase' && (
          <>
            {/* Current Status */}
            {currentCredits && (
              <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">{t('ai_credits.remaining')}</p>
                    <p className="text-xl font-bold text-white mt-1">
                      {currentCredits.total_available}
                    </p>
                  </div>
                  {currentCredits.reset_date && (
                    <div>
                      <p className="text-slate-400">{t('ai_credits.reset_date')}</p>
                      <p className="text-sm text-slate-300 mt-1">
                        {new Date(currentCredits.reset_date).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Package Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-3">
                {t('ai_credits.purchase.quantity')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CREDIT_PACKAGES.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setSelectedAmount(amount)}
                    className={`px-4 py-3 rounded-xl font-bold transition-all ${
                      selectedAmount === amount
                        ? 'bg-bridge-accent text-white shadow-lg shadow-bridge-accent/30'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Summary */}
            <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">{t('ai_credits.purchase.unit_price')}</span>
                <span className="text-sm text-slate-300">₩{PRICE_PER_CREDIT.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">{t('ai_credits.purchase.quantity')}</span>
                <span className="text-sm text-slate-300">{selectedAmount} {t('ai_credits.purchase.quantity_unit')}</span>
              </div>
              <div className="h-px bg-white/10 my-3" />
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">{t('ai_credits.purchase.total_price')}</span>
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
                className="flex-1 bg-white/5 hover:bg-white/10 text-white"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handlePurchase}
                disabled={isLoading}
                className="flex-1 bg-bridge-accent hover:bg-bridge-accent/90 text-white font-bold"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('common.loading')}
                  </span>
                ) : (
                  t('ai_credits.purchase.buy_button')
                )}
              </Button>
            </div>

            {/* Info */}
            <p className="mt-4 text-xs text-slate-500 text-center">
              💡 {t('ai_credits.purchase.description')}
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
              {t('ai_credits.exhausted_modal.buy_button')}
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              className="w-full bg-white/5 hover:bg-white/10 text-white"
            >
              {t('ai_credits.exhausted_modal.later_button')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
