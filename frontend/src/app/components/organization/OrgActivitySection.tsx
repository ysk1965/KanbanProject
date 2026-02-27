import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity, UserPlus, UserMinus, ShieldCheck, LayoutGrid,
  MinusSquare, CalendarCheck, CalendarX, Megaphone, Plus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { orgActivityService } from '../../utils/services';
import { formatRelativeTime } from '../../utils/dateUtils';
import type { OrgActivity, OrgActivityType } from '../../types';

const ACTIVITY_CONFIG: Record<OrgActivityType, { icon: typeof Activity; bgClass: string; textClass: string }> = {
  MEMBER_JOINED: { icon: UserPlus, bgClass: 'bg-emerald-500/15', textClass: 'text-emerald-500' },
  MEMBER_LEFT: { icon: UserMinus, bgClass: 'bg-rose-500/15', textClass: 'text-rose-500' },
  MEMBER_ROLE_CHANGED: { icon: ShieldCheck, bgClass: 'bg-amber-500/15', textClass: 'text-amber-500' },
  BOARD_ADDED: { icon: LayoutGrid, bgClass: 'bg-teal-500/15', textClass: 'text-teal-500' },
  BOARD_REMOVED: { icon: MinusSquare, bgClass: 'bg-slate-500/15', textClass: 'text-slate-500' },
  BOARD_CREATED: { icon: Plus, bgClass: 'bg-bridge-secondary/15', textClass: 'text-bridge-secondary' },
  LEAVE_APPROVED: { icon: CalendarCheck, bgClass: 'bg-blue-500/15', textClass: 'text-blue-500' },
  LEAVE_REJECTED: { icon: CalendarX, bgClass: 'bg-rose-400/15', textClass: 'text-rose-400' },
  ANNOUNCEMENT_POSTED: { icon: Megaphone, bgClass: 'bg-bridge-accent/15', textClass: 'text-bridge-accent' },
};

function getActivityMessage(a: OrgActivity, t: (key: string, fallback: string, opts?: Record<string, string>) => string): string {
  const name = a.actor_name;
  const target = a.target_name || '';
  switch (a.activity_type) {
    case 'MEMBER_JOINED': return t('organization.activity.MEMBER_JOINED', '{{target}} joined', { target });
    case 'MEMBER_LEFT': return t('organization.activity.MEMBER_LEFT', '{{target}} left', { target });
    case 'MEMBER_ROLE_CHANGED': {
      const newRole = (a.metadata?.new_role as string) || '';
      return t('organization.activity.MEMBER_ROLE_CHANGED', '{{target}} role changed to {{role}}', { target, role: newRole });
    }
    case 'BOARD_ADDED': return t('organization.activity.BOARD_ADDED', '{{target}} board added', { target, name });
    case 'BOARD_REMOVED': return t('organization.activity.BOARD_REMOVED', '{{target}} board removed', { target, name });
    case 'BOARD_CREATED': return t('organization.activity.BOARD_CREATED', '{{target}} board created', { target, name });
    case 'LEAVE_APPROVED': return t('organization.activity.LEAVE_APPROVED', '{{target}} leave approved', { target, name });
    case 'LEAVE_REJECTED': return t('organization.activity.LEAVE_REJECTED', '{{target}} leave rejected', { target, name });
    case 'ANNOUNCEMENT_POSTED': return t('organization.activity.ANNOUNCEMENT_POSTED', 'Announcement posted: {{target}}', { target, name });
    default: return `${name}: ${a.activity_type}`;
  }
}

interface Props {
  orgId: string;
}

export function OrgActivitySection({ orgId }: Props) {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<OrgActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await orgActivityService.list(orgId, { limit: 10 });
        setActivities(data.activities);
      } catch {
        // optional
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [orgId]);

  if (loading) {
    return <div className="h-40 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] animate-pulse" />;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity size={14} className="text-bridge-secondary" />
        <h3 className="text-sm font-bold text-foreground">
          {t('organization.dashboard.activity', 'Activity')}
        </h3>
      </div>

      {activities.length === 0 ? (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-bridge-secondary/10 flex items-center justify-center mx-auto mb-3">
            <Activity size={24} className="text-bridge-secondary/60" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('organization.dashboard.noActivity', 'No activity yet')}
          </p>
        </div>
      ) : (
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-3">
          <div className="space-y-0">
            {activities.map((a, index) => {
              const config = ACTIVITY_CONFIG[a.activity_type] || { icon: Activity, bgClass: 'bg-slate-500/15', textClass: 'text-slate-500' };
              const Icon = config.icon;
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.04 }}
                  className="flex items-start gap-2.5 py-2"
                >
                  <div className={`w-5 h-5 rounded-full ${config.bgClass} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon size={10} className={config.textClass} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      {getActivityMessage(a, t)}
                    </p>
                    <span className="text-[10px] text-slate-500">{formatRelativeTime(a.created_at)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
