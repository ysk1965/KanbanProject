import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Loader2 } from 'lucide-react';
import { MotionModal } from './ui/MotionModal';
import type { BoardResource } from '../types';

interface BoardResourceAddModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; url: string; description?: string }) => Promise<void>;
  editingResource?: BoardResource | null;
}

export function BoardResourceAddModal({
  open,
  onClose,
  onSubmit,
  editingResource,
}: BoardResourceAddModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [urlError, setUrlError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (editingResource) {
        setTitle(editingResource.title);
        setUrl(editingResource.url);
        setDescription(editingResource.description || '');
      } else {
        setTitle('');
        setUrl('');
        setDescription('');
      }
      setUrlError('');
      setLoading(false);
    }
  }, [open, editingResource]);

  const validateUrl = (value: string): boolean => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    if (!validateUrl(url.trim())) {
      setUrlError(t('boardResource.invalidUrl'));
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        url: url.trim(),
        description: description.trim() || undefined,
      });
      onClose();
    } catch {
      // error handled by caller
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionModal open={open} onClose={onClose} accentColor aria-label={editingResource ? t('boardResource.editResource') : t('boardResource.addResource')}>
      <form onSubmit={handleSubmit}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center">
            <Link2 size={16} className="text-bridge-accent" />
          </div>
          <h2 className="text-sm font-bold text-foreground">
            {editingResource ? t('boardResource.editResource') : t('boardResource.addResource')}
          </h2>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 pt-4 space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('boardResource.linkTitle')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('boardResource.linkTitlePlaceholder')}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all text-sm"
              maxLength={100}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('boardResource.linkUrl')}
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError('');
              }}
              placeholder={t('boardResource.linkUrlPlaceholder')}
              className={`w-full bg-foreground/[0.03] border rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all text-sm ${
                urlError ? 'border-red-500/50' : 'border-foreground/10'
              }`}
              maxLength={2000}
            />
            {urlError && (
              <p className="text-xs text-red-400 mt-1">{urlError}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('boardResource.linkDescription')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('boardResource.linkDescriptionPlaceholder')}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all text-sm"
              maxLength={255}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-500">Esc {t('common.close')}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-all"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !url.trim() || loading}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
            >
              {loading && <Loader2 size={12} className="animate-spin" />}
              {editingResource ? t('common.save') : t('common.create')}
            </button>
          </div>
        </div>
      </form>
    </MotionModal>
  );
}
