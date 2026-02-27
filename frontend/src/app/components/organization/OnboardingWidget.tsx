import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { organizationService } from '../../utils/services';
import { resolveFileUrl } from '../../utils/api';
import type { OnboardingInstanceSummary } from '../../types';

interface OnboardingWidgetProps {
  orgId: string;
}

export function OnboardingWidget({ orgId }: OnboardingWidgetProps) {
  const { t } = useTranslation();
  const [instances, setInstances] = useState<OnboardingInstanceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInstances = useCallback(async () => {
    try {
      const data = await organizationService.getOnboardingInstances(orgId, { status: 'IN_PROGRESS' });
      setInstances(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  if (loading) {
    return <div className="h-24 bg-bridge-obsidian rounded-2xl animate-pulse" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={14} className="text-emerald-500" />
          <h3 className="text-sm font-bold text-foreground">
            {t('organization.dashboard.onboarding', 'Onboarding Progress')}
          </h3>
          {instances.length > 0 && (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full">
              {instances.length}
            </span>
          )}
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-2">
            <ClipboardCheck size={20} className="text-emerald-500/60" />
          </div>
          <p className="text-xs text-muted-foreground">
            {t('organization.dashboard.noOnboarding', 'No active onboarding')}
          </p>
        </div>
      ) : (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] divide-y divide-foreground/[0.08]">
          {instances.slice(0, 5).map((inst, i) => (
            <motion.div
              key={inst.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="px-4 py-3"
            >
              <div className="flex items-center gap-3 mb-2">
                {inst.member_profile_image_url ? (
                  <img
                    src={resolveFileUrl(inst.member_profile_image_url)}
                    alt={inst.member_name}
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-bridge-accent">
                      {inst.member_name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {inst.member_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {inst.progress_percent}%
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {inst.template_name} · {inst.completed_items}/{inst.total_items}
                  </div>
                </div>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 bg-foreground/[0.03] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-emerald-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${inst.progress_percent}%` }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                />
              </div>
              {inst.next_item && (
                <div className="flex items-center gap-1 mt-1.5">
                  <ChevronRight size={10} className="text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground truncate">
                    {inst.next_item.title}
                    {inst.next_item.due_date && ` (${inst.next_item.due_date})`}
                  </span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
