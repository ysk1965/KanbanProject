import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderPlus, Edit3, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MotionModal } from '../../ui/MotionModal';
import { orgPhotoService } from '../../../utils/services';
import type { OrgPhotoTab } from '../../../types';

interface AlbumCreateModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  album?: OrgPhotoTab | null;
  onSaved: () => void;
}

export function AlbumCreateModal({
  open,
  onClose,
  orgId,
  album,
  onSaved,
}: AlbumCreateModalProps) {
  const { t } = useTranslation();
  const isEdit = !!album;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName(album?.name || '');
      setDescription(album?.description || '');
      setSaving(false);
    }
  }, [open, album]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName || saving) return;
    try {
      setSaving(true);
      if (isEdit && album) {
        await orgPhotoService.updateTab(orgId, album.id, {
          name: trimmedName,
          description: description.trim() || undefined,
        });
        toast.success(t('photoGallery.albumUpdated', 'Album updated'));
      } else {
        await orgPhotoService.createTab(orgId, {
          name: trimmedName,
          description: description.trim() || undefined,
        });
        toast.success(t('photoGallery.albumCreated', 'Album created'));
      }
      onSaved();
      onClose();
    } catch (error) {
      console.warn('Failed to save album:', error);
      toast.error(
        isEdit
          ? t('photoGallery.albumUpdateError', 'Failed to update album')
          : t('photoGallery.albumCreateError', 'Failed to create album'),
      );
    } finally {
      setSaving(false);
    }
  }, [name, description, saving, isEdit, album, orgId, t, onSaved, onClose]);

  const HeaderIcon = isEdit ? Edit3 : FolderPlus;

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-sm">
      {/* 1) Top Accent Line */}
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

      {/* 2) Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
          <HeaderIcon size={16} className="text-bridge-accent" />
        </div>
        <h3 className="text-base font-bold text-foreground">
          {isEdit
            ? t('photoGallery.editAlbumTitle', 'Edit Album')
            : t('photoGallery.createAlbumTitle', 'Create Album')}
        </h3>
      </div>

      {/* 3) Body */}
      <div className="px-5 pb-5 pt-4 space-y-3">
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
            {t('photoGallery.albumName', 'Album name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !saving && name.trim() && handleSave()}
            placeholder={t('photoGallery.albumNamePlaceholder', 'e.g. Team Workshop 2026')}
            maxLength={50}
            autoFocus
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground placeholder-slate-500 outline-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
            {t('photoGallery.albumDescription', 'Description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('photoGallery.albumDescPlaceholder', 'Optional description')}
            maxLength={200}
            rows={2}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 outline-none resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
      </div>

      {/* 4) Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          Esc {t('common.close', 'Close')}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent disabled:opacity-50 hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                {t('common.saving', 'Saving...')}
              </span>
            ) : isEdit ? (
              t('common.save', 'Save')
            ) : (
              t('photoGallery.createAlbumButton', 'Create')
            )}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
