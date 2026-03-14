import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Edit3,
  Trash2,
  Megaphone,
  Eye,
  EyeOff,
  X,
  Loader2,
} from 'lucide-react';
import { adminService } from '../../utils/services';
import type { AnnouncementDetail } from '../../utils/api';
import { formatDate, formatDateTime, toDateTimeLocalValue, fromDateTimeLocalValue } from '../../utils/dateUtils';
import { ConfirmModal, Toast } from './AdminConfirmModal';

export function AdminAnnouncementsTab() {
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<AnnouncementDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<AnnouncementDetail | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      console.error('Failed to load announcements:', err);
      setError(t('admin.announcements.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await adminService.deleteAnnouncement(deleteTarget);
      setAnnouncements(announcements.filter((a) => a.id !== deleteTarget));
      setToast({ message: t('admin.announcements.deleted'), type: 'success' });
    } catch (err) {
      console.error('Failed to delete announcement:', err);
      setToast({ message: t('admin.announcements.deleteFailed'), type: 'error' });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSave = async (data: AnnouncementFormData) => {
    try {
      if (editingAnnouncement) {
        const updated = await adminService.updateAnnouncement(editingAnnouncement.id, data);
        setAnnouncements(announcements.map((a) => (a.id === updated.id ? updated : a)));
        setEditingAnnouncement(null);
      } else {
        const created = await adminService.createAnnouncement(data);
        setAnnouncements([created, ...announcements]);
        setIsCreateOpen(false);
      }
      setToast({ message: t('admin.announcements.saved'), type: 'success' });
    } catch (err) {
      console.error('Failed to save announcement:', err);
      setToast({ message: t('admin.announcements.saveFailed'), type: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="로딩 중">
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={loadAnnouncements} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const typeLabel: Record<string, string> = { POPUP: t('admin.announcements.typePopup'), BANNER: t('admin.announcements.typeBanner'), NOTICE: t('admin.announcements.typeNotice') };
  const typeBadge: Record<string, string> = {
    POPUP: 'bg-purple-500/20 text-purple-400',
    BANNER: 'bg-amber-500/20 text-amber-400',
    NOTICE: 'bg-blue-500/20 text-blue-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{t('admin.announcements.title')}</h2>
          <p className="text-slate-400">{t('admin.announcements.subtitle')}</p>
        </div>
        <button
          onClick={() => { setIsCreateOpen(true); setEditingAnnouncement(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl font-medium hover:bg-bridge-accent/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('admin.announcements.newAnnouncement')}
        </button>
      </div>

      {(isCreateOpen || editingAnnouncement) && (
        <AnnouncementFormModal
          announcement={editingAnnouncement}
          onSave={handleSave}
          onClose={() => { setIsCreateOpen(false); setEditingAnnouncement(null); }}
        />
      )}

      {announcements.length === 0 ? (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-12 text-center">
          <Megaphone className="h-12 w-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">{t('admin.announcements.noAnnouncements')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <div key={ann.id} className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${typeBadge[ann.type] || typeBadge.NOTICE}`}>
                      {typeLabel[ann.type] || ann.type}
                    </span>
                    {ann.is_active ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Eye className="h-3 w-3" /> {t('admin.announcements.active')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <EyeOff className="h-3 w-3" /> {t('admin.announcements.inactive')}
                      </span>
                    )}
                    {ann.priority > 0 && (
                      <span className="text-xs text-amber-400">{t('admin.announcements.priority')}: {ann.priority}</span>
                    )}
                  </div>
                  <h3 className="text-foreground font-medium mb-1">{ann.title}</h3>
                  {ann.content && (
                    <p className="text-slate-400 text-sm line-clamp-2">{ann.content}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    {ann.start_at && <span>{t('admin.announcements.start')}: {formatDateTime(ann.start_at)}</span>}
                    {ann.end_at && <span>{t('admin.announcements.end')}: {formatDateTime(ann.end_at)}</span>}
                    <span>{t('admin.announcements.created')}: {formatDate(ann.created_at)}</span>
                  </div>
                </div>
                <div className="flex gap-1 ml-4">
                  <button
                    onClick={() => { setEditingAnnouncement(ann); setIsCreateOpen(false); }}
                    className="p-2 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(ann.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={t('admin.announcements.deleteTitle')}
        message={t('admin.announcements.confirmDelete')}
        variant="danger"
        confirmLabel={t('common.delete')}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={!!toast}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ==================== Form Modal ====================

interface AnnouncementFormData {
  title: string;
  content?: string;
  type?: 'POPUP' | 'BANNER' | 'NOTICE';
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
  priority?: number;
  target_role?: string | null;
}

function AnnouncementFormModal({
  announcement,
  onSave,
  onClose,
}: {
  announcement: AnnouncementDetail | null;
  onSave: (data: AnnouncementFormData) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(announcement?.title || '');
  const [content, setContent] = useState(announcement?.content || '');
  const [type, setType] = useState<'POPUP' | 'BANNER' | 'NOTICE'>(announcement?.type || 'NOTICE');
  const [isActive, setIsActive] = useState(announcement?.is_active ?? true);
  const [startAt, setStartAt] = useState(toDateTimeLocalValue(announcement?.start_at));
  const [endAt, setEndAt] = useState(toDateTimeLocalValue(announcement?.end_at));
  const [priority, setPriority] = useState(announcement?.priority || 0);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      // 종료일이 시간 없이 날짜만 있거나 00:00이면 23:59로 보정
      let normalizedEndAt = endAt || '';
      if (normalizedEndAt && normalizedEndAt.endsWith('T00:00')) {
        normalizedEndAt = normalizedEndAt.replace('T00:00', 'T23:59');
      }

      await onSave({
        title: title.trim(),
        content: content.trim() || undefined,
        type,
        is_active: isActive,
        start_at: startAt ? fromDateTimeLocalValue(startAt) : null,
        end_at: normalizedEndAt ? fromDateTimeLocalValue(normalizedEndAt) : null,
        priority,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/10 p-6 shadow-2xl w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-foreground">
            {announcement ? t('admin.announcements.editAnnouncement') : t('admin.announcements.newAnnouncement')}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-foreground transition-colors" aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">{t('admin.announcements.titleLabel')} *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              placeholder={t('admin.announcements.titlePlaceholder')}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">{t('admin.announcements.contentLabel')}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
              placeholder={t('admin.announcements.contentPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">{t('admin.announcements.typeLabel')}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'POPUP' | 'BANNER' | 'NOTICE')}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              >
                <option value="NOTICE">{t('admin.announcements.typeNotice')}</option>
                <option value="BANNER">{t('admin.announcements.typeBanner')}</option>
                <option value="POPUP">{t('admin.announcements.typePopup')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">{t('admin.announcements.priority')}</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                min={0}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">{t('admin.announcements.startDate')}</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">{t('admin.announcements.endDate')}</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setIsActive(!isActive)}
              className={`w-10 h-6 rounded-full transition-colors relative ${isActive ? 'bg-bridge-accent' : 'bg-foreground/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'left-5' : 'left-1'}`} />
            </div>
            <span className="text-sm text-muted-foreground">{isActive ? t('admin.announcements.active') : t('admin.announcements.inactive')}</span>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl hover:bg-foreground/10 transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isSaving}
            className="flex-1 px-4 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 disabled:opacity-50 transition-all"
          >
            {isSaving ? t('admin.announcements.saving') : announcement ? t('common.edit') : t('common.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
