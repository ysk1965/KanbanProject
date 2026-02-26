import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Pin, Plus, ChevronRight, Trash2, Pencil } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { orgAnnouncementService } from '../../utils/services';
import { formatRelativeTime } from '../../utils/dateUtils';
import type { OrgAnnouncement, OrgRole } from '../../types';

interface Props {
  orgId: string;
  role: OrgRole;
  onCreateClick: () => void;
  onEditClick: (a: OrgAnnouncement) => void;
  onViewAllClick: () => void;
}

export function OrgAnnouncementSection({ orgId, role, onCreateClick, onEditClick, onViewAllClick }: Props) {
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<OrgAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = role === 'OWNER' || role === 'ADMIN';

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await orgAnnouncementService.list(orgId, { limit: 10 });
        setAnnouncements(data.announcements);
      } catch {
        // optional
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [orgId]);

  const handleDelete = async (id: string) => {
    if (!confirm(t('organization.announcement.deleteConfirm', 'Delete this announcement?'))) return;
    try {
      await orgAnnouncementService.delete(orgId, id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch {
      toast.error(t('organization.announcement.deleteError', 'Failed to delete announcement'));
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      const updated = await orgAnnouncementService.togglePin(orgId, id);
      setAnnouncements(prev => prev.map(a => a.id === id ? updated : a)
        .sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }));
    } catch { /* */ }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone size={14} className="text-bridge-accent" />
          <h3 className="text-sm font-bold text-foreground">
            {t('organization.dashboard.announcements', 'Announcements')}
          </h3>
          <span className="text-[10px] font-bold text-bridge-accent bg-bridge-accent/15 px-1.5 py-0.5 rounded-full">
            {announcements.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {announcements.length > 0 && (
            <button onClick={onViewAllClick}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
              {t('organization.dashboard.viewAll', 'View all')}
              <ChevronRight size={12} />
            </button>
          )}
          {isAdmin && (
            <button onClick={onCreateClick}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 px-3 py-1.5 rounded-lg transition-colors">
              <Plus size={13} />
              {t('organization.dashboard.newAnnouncement', 'New')}
            </button>
          )}
        </div>
      </div>

      {announcements.length === 0 ? (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-12 text-center">
          <div className="w-14 h-14 rounded-xl bg-bridge-accent/15 flex items-center justify-center mx-auto mb-4">
            <Megaphone size={28} className="text-bridge-accent/60" />
          </div>
          <p className="text-sm text-muted-foreground mb-1">
            {t('organization.dashboard.noAnnouncements', 'No announcements yet')}
          </p>
          {isAdmin && (
            <p className="text-xs text-slate-500">
              {t('organization.dashboard.noAnnouncementsHint', 'Create one to share updates with your team')}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a, index) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="group bg-bridge-obsidian rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] transition-all"
            >
              {a.is_pinned && (
                <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-accent/20 to-transparent rounded-t-xl" />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      {a.is_pinned && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-bridge-accent bg-bridge-accent/15 px-1.5 py-0.5 rounded-full shrink-0">
                          PIN
                        </span>
                      )}
                      <span className="text-sm font-semibold text-foreground">{a.title}</span>
                    </div>
                    {a.content && (
                      <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-3 mb-2.5">{a.content}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-bridge-accent/15 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-bridge-accent">{a.author_name?.charAt(0)}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">{a.author_name}</span>
                      <span className="text-[11px] text-slate-600">&middot;</span>
                      <span className="text-[11px] text-slate-500">{formatRelativeTime(a.created_at)}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => handleTogglePin(a.id)}
                        className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
                        title={a.is_pinned ? 'Unpin' : 'Pin'}>
                        <Pin size={13} className={a.is_pinned ? 'text-bridge-accent' : 'text-slate-500'} />
                      </button>
                      <button onClick={() => onEditClick(a)}
                        className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors">
                        <Pencil size={13} className="text-slate-500" />
                      </button>
                      <button onClick={() => handleDelete(a.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors">
                        <Trash2 size={13} className="text-slate-500 hover:text-rose-500" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
