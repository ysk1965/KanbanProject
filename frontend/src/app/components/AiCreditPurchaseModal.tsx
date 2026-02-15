import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertCircle, Sparkles, History } from 'lucide-react';
import { AiCredits, AiCreditUsageHistory } from '../types';
import { aiCreditService } from '../utils/services';
import { formatRelativeTime } from '../utils/dateUtils';
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

function featureTypeStyle(type: string): string {
  switch (type) {
    case 'MEETING':         return 'bg-purple-500/15 text-purple-400';
    case 'NOTE':            return 'bg-teal-500/15 text-teal-400';
    case 'REPORT_TEAM':     return 'bg-blue-500/15 text-blue-400';
    case 'REPORT_PERSONAL': return 'bg-amber-500/15 text-amber-400';
    default:                return 'bg-white/10 text-slate-400';
  }
}

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
  const [activeTab, setActiveTab] = useState<'purchase' | 'usage'>('purchase');
  const [selectedAmount, setSelectedAmount] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageHistory, setUsageHistory] = useState<AiCreditUsageHistory[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageLoaded, setUsageLoaded] = useState(false);

  const loadUsageHistory = useCallback(async () => {
    if (usageLoaded) return;
    setUsageLoading(true);
    try {
      const data = await aiCreditService.getUsageHistory(boardId);
      setUsageHistory(data);
      setUsageLoaded(true);
    } catch (err) {
      console.error('Failed to load usage history:', err);
    } finally {
      setUsageLoading(false);
    }
  }, [boardId, usageLoaded]);

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
                  : t('ai_credits.title')}
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

        {/* Purchase Mode with Tabs */}
        {internalMode === 'purchase' && (
          <>
            {/* Tab Bar */}
            <div className="flex gap-1 mb-5 p-1 bg-white/5 rounded-xl">
              <button
                onClick={() => setActiveTab('purchase')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'purchase'
                    ? 'bg-bridge-accent text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {t('ai_credits.purchase.title')}
              </button>
              <button
                onClick={() => {
                  setActiveTab('usage');
                  loadUsageHistory();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'usage'
                    ? 'bg-bridge-accent text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                {t('ai_credits.usage.tab_title')}
              </button>
            </div>

            {/* Purchase Tab */}
            {activeTab === 'purchase' && (
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
                  {t('ai_credits.purchase.description')}
                </p>
              </>
            )}

            {/* Usage History Tab */}
            {activeTab === 'usage' && (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {usageLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-bridge-accent rounded-full animate-spin" />
                  </div>
                ) : usageHistory.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    {t('ai_credits.usage.empty')}
                  </div>
                ) : (
                  usageHistory.map((item) => (
                    <div key={item.id} className="p-3 bg-white/[0.04] border border-white/5 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-white truncate">
                            {item.user_name}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                            featureTypeStyle(item.feature_type)
                          }`}>
                            {t(`ai_credits.usage.feature.${item.feature_type}`, { defaultValue: item.feature_type })}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-bridge-secondary whitespace-nowrap ml-2">
                          -{item.credits_used}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {formatRelativeTime(item.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
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
