import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Pin } from 'lucide-react';
import { MotionModal } from '../ui/MotionModal';
import { orgAnnouncementService } from '../../utils/services';
import type { OrgAnnouncement } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: string;
  editing?: OrgAnnouncement | null;
  onSaved: () => void;
}

export function OrgAnnouncementModal({ open, onClose, orgId, editing, onSaved }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setContent(editing.content || '');
      setIsPinned(editing.is_pinned);
    } else {
      setTitle('');
      setContent('');
      setIsPinned(false);
    }
  }, [editing, open]);

  const handleSubmit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await orgAnnouncementService.update(orgId, editing.id, {
          title: title.trim(),
          content: content.trim() || undefined,
        });
      } else {
        await orgAnnouncementService.create(orgId, {
          title: title.trim(),
          content: content.trim() || undefined,
          is_pinned: isPinned,
        });
      }
      onSaved();
      onClose();
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose}>
      <div className="w-full sm:max-w-md">
        {/* Top accent */}
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
            <Megaphone size={16} className="text-bridge-accent" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            {editing
              ? t('organization.announcement.edit', 'Edit Announcement')
              : t('organization.announcement.create', 'New Announcement')}
          </h3>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('organization.announcement.title', 'Title')}
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('organization.announcement.titlePlaceholder', 'Announcement title')}
              maxLength={200}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3
                text-sm text-foreground placeholder-slate-600 outline-none
                focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('organization.announcement.content', 'Content')}
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={t('organization.announcement.contentPlaceholder', 'Details (optional)')}
              rows={4}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3
                text-sm text-muted-foreground placeholder-slate-600 outline-none resize-none
                focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
            />
          </div>

          {!editing && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={e => setIsPinned(e.target.checked)}
                className="w-4 h-4 rounded border-foreground/20 text-bridge-accent focus:ring-bridge-accent/30"
              />
              <Pin size={12} className="text-slate-400" />
              <span className="text-xs text-muted-foreground">
                {t('organization.announcement.pinToTop', 'Pin to top')}
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-4 pt-3 border-t border-foreground/[0.08]">
          <span className="text-[10px] text-slate-600">Esc {t('common.close', 'Close')}</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-foreground/5 transition-colors">
              {t('common.cancel', 'Cancel')}
            </button>
            <button onClick={handleSubmit} disabled={!title.trim() || saving}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent
                hover:bg-bridge-accent/90 disabled:opacity-50 transition-all">
              {saving ? '...' : editing
                ? t('common.save', 'Save')
                : t('organization.announcement.post', 'Post')}
            </button>
          </div>
        </div>
      </div>
    </MotionModal>
  );
}
