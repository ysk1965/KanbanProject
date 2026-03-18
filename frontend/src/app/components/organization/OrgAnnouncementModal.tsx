import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Pin, ImagePlus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MotionModal } from '../ui/MotionModal';
import { orgAnnouncementService } from '../../utils/services';
import { fileAPI, resolveFileUrl } from '../../utils/api';
import type { OrgAnnouncement, OrgAnnouncementAttachment } from '../../types';

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

  // Image upload state
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    tempKey: string;
    previewUrl: string;
    fileName: string;
  }>>([]);
  const [existingAttachments, setExistingAttachments] = useState<OrgAnnouncementAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setContent(editing.content || '');
      setIsPinned(editing.is_pinned);
      setExistingAttachments(editing.attachments || []);
    } else {
      setTitle('');
      setContent('');
      setIsPinned(false);
      setExistingAttachments([]);
    }
    setUploadedFiles([]);
  }, [editing, open]);

  const handleFileUpload = async (files: FileList) => {
    const totalCount = uploadedFiles.length + existingAttachments.length + files.length;
    if (totalCount > 5) {
      toast.error(t('organization.announcement.maxImages', 'Maximum 5 images allowed'));
      return;
    }
    setUploading(true);
    try {
      const newFiles = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const result = await fileAPI.smartUpload(file);
        newFiles.push({ tempKey: result.tempKey, previewUrl: result.previewUrl, fileName: file.name });
      }
      setUploadedFiles(prev => [...prev, ...newFiles]);
    } catch {
      toast.error(t('common.error', 'Upload failed'));
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || saving || uploading) return;
    setSaving(true);
    try {
      if (editing) {
        await orgAnnouncementService.update(orgId, editing.id, {
          title: title.trim(),
          content: content.trim() || undefined,
          keep_attachment_ids: existingAttachments.map(a => a.id),
          new_file_keys: uploadedFiles.length > 0 ? uploadedFiles.map(f => f.tempKey) : undefined,
        });
      } else {
        await orgAnnouncementService.create(orgId, {
          title: title.trim(),
          content: content.trim() || undefined,
          is_pinned: isPinned,
          file_keys: uploadedFiles.length > 0 ? uploadedFiles.map(f => f.tempKey) : undefined,
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
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('organization.announcement.title', 'Title')}
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('organization.announcement.titlePlaceholder', 'Announcement title')}
              maxLength={200}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3
                text-sm text-foreground placeholder-slate-500 outline-none
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('organization.announcement.content', 'Content')}
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={t('organization.announcement.contentPlaceholder', 'Details (optional)')}
              rows={4}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3
                text-sm text-foreground placeholder-slate-500 outline-none resize-none
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          </div>

          {/* Image attachments */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {t('organization.announcement.images', 'Images')}
              </label>
              <span className="text-xs text-slate-500">
                {existingAttachments.length + uploadedFiles.length}/5
              </span>
            </div>

            {/* Preview grid */}
            {(existingAttachments.length > 0 || uploadedFiles.length > 0) && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
                {existingAttachments.map(att => (
                  <div key={att.id} className="relative group aspect-square rounded-lg overflow-hidden border border-foreground/10">
                    <img src={resolveFileUrl(att.url)} className="w-full h-full object-cover" alt={att.file_name} />
                    <button
                      onClick={() => setExistingAttachments(prev => prev.filter(a => a.id !== att.id))}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-foreground/10">
                    <img src={file.previewUrl} className="w-full h-full object-cover" alt={file.fileName} />
                    <button
                      onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add button */}
            {existingAttachments.length + uploadedFiles.length < 5 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5
                  px-3 py-2 rounded-xl border border-dashed border-foreground/10 transition-all w-full justify-center"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                {t('organization.announcement.addImage', 'Add Image')}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => e.target.files && handleFileUpload(e.target.files)}
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
              <span className="text-xs text-slate-500">
                {t('organization.announcement.pinToTop', 'Pin to top')}
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-4 pt-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-600">Esc {t('common.close', 'Close')}</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-foreground/5 transition-colors">
              {t('common.cancel', 'Cancel')}
            </button>
            <button onClick={handleSubmit} disabled={!title.trim() || saving || uploading}
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
