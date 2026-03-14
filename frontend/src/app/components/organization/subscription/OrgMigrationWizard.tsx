import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  Loader2,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { orgSubscriptionService, boardService } from '../../../utils/services';
import type { Board, MigrationPreview } from '../../../types';

interface OrgMigrationWizardProps {
  orgId: string;
  onComplete: () => void;
  onCancel: () => void;
}

type BillingCycle = 'MONTHLY' | 'YEARLY';

export function OrgMigrationWizard({
  orgId,
  onComplete,
  onCancel,
}: OrgMigrationWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);

  // Step 1 state
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [loadingBoards, setLoadingBoards] = useState(true);

  // Step 2 state
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Step 3 state
  const [migrating, setMigrating] = useState(false);

  // Load user's boards
  useEffect(() => {
    const loadBoards = async () => {
      try {
        setLoadingBoards(true);
        const data = await boardService.getBoards();
        setBoards(data);
      } catch (error) {
        console.warn('Failed to load boards:', error);
      } finally {
        setLoadingBoards(false);
      }
    };
    loadBoards();
  }, []);

  const toggleBoard = (boardId: string) => {
    setSelectedBoardIds((prev) =>
      prev.includes(boardId)
        ? prev.filter((id) => id !== boardId)
        : [...prev, boardId],
    );
  };

  const fetchPreview = useCallback(async () => {
    if (selectedBoardIds.length === 0) return;
    try {
      setLoadingPreview(true);
      const data = await orgSubscriptionService.migratePreview(orgId, {
        billing_cycle: billingCycle,
        board_ids: selectedBoardIds,
      });
      setPreview(data);
    } catch (error) {
      console.warn('Failed to fetch migration preview:', error);
      toast.error(t('orgSubscription.migration.previewError', 'Failed to load cost preview'));
    } finally {
      setLoadingPreview(false);
    }
  }, [orgId, selectedBoardIds, billingCycle, t]);

  const handleNextToStep2 = () => {
    setStep(2);
    fetchPreview();
  };

  const handleMigrate = async () => {
    try {
      setMigrating(true);
      await orgSubscriptionService.migrate(orgId, {
        billing_cycle: billingCycle,
        board_ids: selectedBoardIds,
      });
      toast.success(t('orgSubscription.migration.success', 'Migration completed'));
      onComplete();
    } catch (error) {
      console.warn('Migration failed:', error);
      toast.error(t('orgSubscription.migration.error', 'Migration failed'));
    } finally {
      setMigrating(false);
    }
  };

  const formatCurrency = (amountInCents: number) => {
    return `$${(amountInCents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  return (
    <div>
      {/* Step Indicator */}
      <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s <= step
                  ? 'bg-bridge-accent text-white'
                  : 'bg-foreground/[0.06] text-slate-400'
              }`}
            >
              {s < step ? <Check size={12} /> : s}
            </div>
            <span
              className={`text-xs font-bold ${
                s === step ? 'text-foreground' : 'text-slate-500'
              }`}
            >
              {s === 1 && t('orgSubscription.migration.step1', 'Select Boards')}
              {s === 2 && t('orgSubscription.migration.step2', 'Cost Preview')}
              {s === 3 && t('orgSubscription.migration.step3', 'Confirm')}
            </span>
            {s < 3 && <ChevronRight size={12} className="text-slate-500" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="px-5 pb-5 pt-4">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* Billing Cycle Toggle */}
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                  {t('orgSubscription.migration.billingCycle', 'Billing Cycle')}
                </label>
                <div className="flex gap-2">
                  {(['MONTHLY', 'YEARLY'] as BillingCycle[]).map((cycle) => (
                    <button
                      key={cycle}
                      onClick={() => setBillingCycle(cycle)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                        billingCycle === cycle
                          ? 'bg-bridge-accent text-white'
                          : 'bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10'
                      }`}
                    >
                      {cycle === 'MONTHLY'
                        ? t('orgSubscription.migration.monthly', 'Monthly')
                        : t('orgSubscription.migration.yearly', 'Yearly')}
                      {cycle === 'YEARLY' && (
                        <span className="ml-1.5 text-xs opacity-70">
                          {t('orgSubscription.migration.yearlySave', '(Save 20%)')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Board Selection */}
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                  {t('orgSubscription.migration.selectBoards', 'Select Boards to Migrate')}
                </label>
                {loadingBoards ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
                  </div>
                ) : boards.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">
                    {t('orgSubscription.migration.noBoards', 'No boards available')}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto custom-scrollbar">
                    {boards.map((board) => {
                      const isSelected = selectedBoardIds.includes(board.id);
                      return (
                        <div
                          key={board.id}
                          onClick={() => toggleBoard(board.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                            isSelected
                              ? 'border-bridge-accent bg-bridge-accent/10'
                              : 'border-foreground/[0.08] hover:border-foreground/[0.12]'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'border-bridge-accent bg-bridge-accent'
                                : 'border-foreground/20'
                            }`}
                          >
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <LayoutGrid size={14} className="text-bridge-secondary shrink-0" />
                            <span className="text-sm text-foreground font-medium truncate">
                              {board.name}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 shrink-0">
                            {t('orgSubscription.migration.members', '{{count}} members', {
                              count: board.member_count,
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {loadingPreview ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
                </div>
              ) : preview ? (
                <div className="space-y-4">
                  {/* Cost Comparison */}
                  <div className="bg-foreground/[0.03] rounded-xl border border-foreground/[0.08] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-slate-400">
                        {t('orgSubscription.migration.currentCost', 'Current monthly cost')}
                      </span>
                      <span className="text-sm font-bold text-foreground">
                        {formatCurrency(preview.current_total_monthly)}
                      </span>
                    </div>
                    <div className="flex items-center justify-center">
                      <ArrowRight size={16} className="text-bridge-accent" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-slate-400">
                        {t('orgSubscription.migration.newCost', 'New monthly cost')}
                      </span>
                      <span className="text-sm font-bold text-bridge-accent">
                        {formatCurrency(preview.new_monthly)}
                      </span>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-2 border-b border-foreground/[0.08]">
                      <span className="text-[12px] text-slate-400">
                        {t('orgSubscription.migration.uniqueMembers', 'Unique members')}
                      </span>
                      <span className="text-sm font-bold text-foreground">
                        {preview.unique_members}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-foreground/[0.08]">
                      <span className="text-[12px] text-slate-400">
                        {t('orgSubscription.migration.credit', 'Credit from existing')}
                      </span>
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        -{formatCurrency(preview.credit_from_existing)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[12px] font-bold text-foreground">
                        {t('orgSubscription.migration.firstPayment', 'First payment')}
                      </span>
                      <span className="text-lg font-bold text-bridge-accent">
                        {formatCurrency(preview.first_payment)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 text-center">
                  <AlertTriangle size={24} className="text-amber-600 dark:text-amber-400 mb-2" />
                  <p className="text-sm text-slate-400">
                    {t('orgSubscription.migration.previewUnavailable', 'Preview unavailable')}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="bg-foreground/[0.03] rounded-xl border border-foreground/[0.08] p-4 space-y-3">
                <h4 className="text-[13px] font-bold text-foreground">
                  {t('orgSubscription.migration.confirmTitle', 'Migration Summary')}
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-400">
                      {t('orgSubscription.migration.plan', 'Plan')}
                    </span>
                    <span className="text-sm font-bold text-bridge-accent">Team</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-400">
                      {t('orgSubscription.migration.cycle', 'Billing cycle')}
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {billingCycle === 'MONTHLY'
                        ? t('orgSubscription.migration.monthly', 'Monthly')
                        : t('orgSubscription.migration.yearly', 'Yearly')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-400">
                      {t('orgSubscription.migration.boardCount', 'Boards')}
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {selectedBoardIds.length}
                    </span>
                  </div>
                  {preview && (
                    <div className="flex items-center justify-between pt-2 border-t border-foreground/[0.08]">
                      <span className="text-[12px] font-bold text-foreground">
                        {t('orgSubscription.migration.firstPayment', 'First payment')}
                      </span>
                      <span className="text-lg font-bold text-bridge-accent">
                        {formatCurrency(preview.first_payment)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                {t(
                  'orgSubscription.migration.confirmDesc',
                  'By proceeding, your selected boards will be migrated to the organization Team plan. Existing board subscriptions will be credited.',
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          {t('orgSubscription.migration.stepOf', 'Step {{current}} of {{total}}', {
            current: step,
            total: 3,
          })}
        </span>
        <div className="flex gap-2">
          {step === 1 ? (
            <button
              onClick={onCancel}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              <ChevronLeft size={12} />
              {t('common.back', 'Back')}
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={step === 1 ? handleNextToStep2 : () => setStep(3)}
              disabled={step === 1 && selectedBoardIds.length === 0}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
            >
              {t('common.next', 'Next')}
              <ChevronRight size={12} />
            </button>
          ) : (
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
            >
              {migrating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('orgSubscription.migration.migrate', 'Migrate')
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
