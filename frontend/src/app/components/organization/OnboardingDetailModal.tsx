import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardCheck,
  ChevronDown,
  Check,
  Circle,
  User,
  Calendar,
  Loader2,
} from 'lucide-react';
import { MotionModal } from '../ui/MotionModal';
import { organizationService } from '../../utils/services';
import { resolveFileUrl } from '../../utils/api';
import { formatDateShort } from '../../utils/dateUtils';
import type {
  OnboardingInstanceSummary,
  OnboardingInstanceItemDetail,
} from '../../types';

interface OnboardingDetailModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  instances: OnboardingInstanceSummary[];
}

export function OnboardingDetailModal({
  open,
  onClose,
  orgId,
  instances,
}: OnboardingDetailModalProps) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<
    Record<string, OnboardingInstanceItemDetail[]>
  >({});
  const [loadingItems, setLoadingItems] = useState<string | null>(null);
  const [togglingItem, setTogglingItem] = useState<string | null>(null);

  // Local progress tracking for optimistic updates
  const [progressMap, setProgressMap] = useState<
    Record<string, { completed_items: number; total_items: number; progress_percent: number }>
  >({});

  const avgProgress =
    instances.length > 0
      ? Math.round(
          instances.reduce((sum, i) => {
            const local = progressMap[i.id];
            return sum + (local ? local.progress_percent : i.progress_percent);
          }, 0) / instances.length,
        )
      : 0;

  const handleToggle = useCallback(
    async (instanceId: string, item: OnboardingInstanceItemDetail) => {
      if (togglingItem) return;
      setTogglingItem(item.id);
      try {
        const result = await organizationService.toggleOnboardingItem(
          orgId,
          instanceId,
          item.id,
        );
        // Update items locally
        setItemsMap((prev) => ({
          ...prev,
          [instanceId]: (prev[instanceId] || []).map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  is_completed: result.is_completed,
                  completed_at: result.completed_at,
                }
              : it,
          ),
        }));
        // Update progress locally
        setProgressMap((prev) => ({
          ...prev,
          [instanceId]: {
            completed_items: result.instance_progress.completed_items,
            total_items: result.instance_progress.total_items,
            progress_percent: result.instance_progress.progress_percent,
          },
        }));
      } catch {
        // silently fail
      } finally {
        setTogglingItem(null);
      }
    },
    [orgId, togglingItem],
  );

  const handleExpand = useCallback(
    async (instanceId: string) => {
      if (expandedId === instanceId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(instanceId);

      // Fetch items if not cached
      if (!itemsMap[instanceId]) {
        setLoadingItems(instanceId);
        try {
          const items = await organizationService.getOnboardingInstanceItems(
            orgId,
            instanceId,
          );
          setItemsMap((prev) => ({ ...prev, [instanceId]: items }));
        } catch {
          // silently fail
        } finally {
          setLoadingItems(null);
        }
      }
    },
    [expandedId, itemsMap, orgId],
  );

  return (
    <MotionModal open={open} onClose={onClose} accentColor className="sm:max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <ClipboardCheck size={16} className="text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground">
            {t('organization.dashboard.onboarding', '온보딩 진행 현황')}
          </h2>
          <p className="text-[11px] text-slate-500">
            {t('organization.dashboard.onboardingInProgress', {
              count: instances.length,
              defaultValue: '{{count}}명 진행 중',
            })}
          </p>
        </div>
        <span className="text-lg font-bold text-emerald-500">{avgProgress}%</span>
      </div>

      {/* Overall progress bar */}
      <div className="px-5 pt-3 pb-1">
        <div className="w-full h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${avgProgress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Member list */}
      <div className="px-5 pb-5 pt-3 space-y-2">
        {instances.map((inst, i) => {
          const isExpanded = expandedId === inst.id;
          const items = itemsMap[inst.id];
          const isLoadingThis = loadingItems === inst.id;
          const local = progressMap[inst.id];
          const completedItems = local
            ? local.completed_items
            : inst.completed_items;
          const totalItems = local ? local.total_items : inst.total_items;
          const progressPercent = local
            ? local.progress_percent
            : inst.progress_percent;

          return (
            <motion.div
              key={inst.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-xl border border-foreground/[0.08] overflow-hidden"
            >
              {/* Member row */}
              <button
                onClick={() => handleExpand(inst.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-foreground/5 transition-colors text-left"
              >
                {inst.member_profile_image_url ? (
                  <img
                    src={resolveFileUrl(inst.member_profile_image_url)}
                    alt={inst.member_name}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-bold text-bridge-accent">
                      {inst.member_name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground truncate">
                      {inst.member_name}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-500">
                      {progressPercent}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-500 truncate">
                      {inst.template_name}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      · {completedItems}/{totalItems}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1 rounded-full bg-foreground/[0.06] overflow-hidden mt-1.5">
                    <motion.div
                      className="h-full rounded-full bg-emerald-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                    />
                  </div>
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0"
                >
                  <ChevronDown size={14} className="text-slate-400" />
                </motion.div>
              </button>

              {/* Expanded items */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 pt-1 border-t border-foreground/[0.08]">
                      {isLoadingThis ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
                        </div>
                      ) : items && items.length > 0 ? (
                        <div className="space-y-1 mt-1">
                          {items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleToggle(inst.id, item)}
                              disabled={togglingItem === item.id}
                              className="w-full flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-foreground/5 transition-colors text-left group"
                            >
                              {/* Checkbox */}
                              <div className="mt-0.5 shrink-0">
                                {item.is_completed ? (
                                  <div className="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center">
                                    <Check size={10} className="text-white" />
                                  </div>
                                ) : (
                                  <div className="w-4 h-4 rounded border border-foreground/20 group-hover:border-emerald-500/50 transition-colors flex items-center justify-center">
                                    <Circle size={6} className="text-transparent group-hover:text-emerald-500/30" />
                                  </div>
                                )}
                              </div>
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <span
                                  className={`text-xs leading-tight ${
                                    item.is_completed
                                      ? 'line-through text-slate-500'
                                      : 'text-foreground'
                                  }`}
                                >
                                  {item.title}
                                </span>
                                {/* Meta row */}
                                <div className="flex items-center gap-2 mt-0.5">
                                  {item.due_date && (
                                    <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                                      <Calendar size={9} />
                                      {formatDateShort(item.due_date)}
                                    </span>
                                  )}
                                  {item.assignee_name && (
                                    <span className="flex items-center gap-0.5 text-[10px] text-slate-500">
                                      <User size={9} />
                                      {item.assignee_name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 text-center py-3">
                          {t('organization.onboarding.items', 'Items')}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-[10px] text-slate-600">Esc {t('common.close', '닫기')}</span>
      </div>
    </MotionModal>
  );
}
