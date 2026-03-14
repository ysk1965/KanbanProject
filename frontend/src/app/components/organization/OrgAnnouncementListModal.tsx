import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Pin, Trash2, Pencil } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { MotionModal } from '../ui/MotionModal';
import { orgAnnouncementService } from '../../utils/services';
import { formatRelativeTime } from '../../utils/dateUtils';
import type { OrgAnnouncement, OrgRole } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: string;
  role: OrgRole;
  onEditClick: (a: OrgAnnouncement) => void;
}

export function OrgAnnouncementListModal({ open, onClose, orgId, role, onEditClick }: Props) {
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<OrgAnnouncement[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = role === 'OWNER' || role === 'ADMIN';

  const fetchData = useCallback(async (reset = false) => {
    try {
      setLoading(true);
      const data = await orgAnnouncementService.list(orgId, {
        cursor: reset ? undefined : cursor || undefined,
        limit: 20,
      });
      setAnnouncements(prev => reset ? data.announcements : [...prev, ...data.announcements]);
      setHasMore(data.has_more);
      setCursor(data.next_cursor);
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  }, [orgId, cursor]);

  useEffect(() => {
    if (open) fetchData(true);
  }, [open, orgId]);

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
      setAnnouncements(prev => prev.map(a => a.id === id ? updated : a));
    } catch { /* */ }
  };

  return (
    <MotionModal open={open} onClose={onClose}>
      <div className="w-full sm:max-w-lg max-h-[70vh] flex flex-col">
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center">
            <Megaphone size={16} className="text-bridge-accent" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            {t('organization.dashboard.announcements', 'Announcements')}
          </h3>
          <span className="text-xs font-bold text-bridge-accent bg-bridge-accent/15 px-1.5 py-0.5 rounded-full">
            {announcements.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-foreground/[0.08]">
          {announcements.map((a, index) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.02 }}
              className="group px-5 py-3.5 flex items-start justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {a.is_pinned && <Pin size={11} className="text-bridge-accent shrink-0" />}
                  <span className="text-sm font-medium text-foreground">{a.title}</span>
                </div>
                {a.content && (
                  <p className="text-xs text-muted-foreground mb-1.5 whitespace-pre-wrap">{a.content}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{a.author_name}</span>
                  <span>&middot;</span>
                  <span>{formatRelativeTime(a.created_at)}</span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => handleTogglePin(a.id)}
                    className="p-1 rounded-md hover:bg-foreground/5 transition-colors">
                    <Pin size={12} className={a.is_pinned ? 'text-bridge-accent' : 'text-slate-500'} />
                  </button>
                  <button onClick={() => { onEditClick(a); onClose(); }}
                    className="p-1 rounded-md hover:bg-foreground/5 transition-colors">
                    <Pencil size={12} className="text-slate-500" />
                  </button>
                  <button onClick={() => handleDelete(a.id)}
                    className="p-1 rounded-md hover:bg-rose-500/10 transition-colors">
                    <Trash2 size={12} className="text-slate-500 hover:text-rose-500" />
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {hasMore && (
          <div className="px-5 py-3 border-t border-foreground/[0.08]">
            <button onClick={() => fetchData(false)} disabled={loading}
              className="w-full text-xs text-bridge-accent hover:text-bridge-accent/80 font-bold transition-colors">
              {loading ? '...' : t('common.loadMore', 'Load more')}
            </button>
          </div>
        )}

        <div className="flex items-center justify-end px-5 pb-4 pt-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-500">Esc {t('common.close', 'Close')}</span>
        </div>
      </div>
    </MotionModal>
  );
}
