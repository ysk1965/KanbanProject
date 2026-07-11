import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, FileText, Folder, PenTool, RotateCcw, Search, X, Loader2, AlertTriangle } from 'lucide-react';
import { MotionModal } from '../ui/MotionModal';
import { formatDateTime, formatRelativeTime } from '../../utils/dateUtils';
import { noteService, orgNoteService, myNoteService } from '../../utils/services';
import type { NoteTrashItem } from '../../utils/api';

interface NoteTrashModalProps {
  open: boolean;
  onClose: () => void;
  scopeType: 'board' | 'org' | 'personal';
  scopeId: string;
  canPermanentDelete: boolean;
  onRestored?: (noteId: string) => void;
  onChanged?: () => void;
}

export function NoteTrashModal({
  open,
  onClose,
  scopeType,
  scopeId,
  canPermanentDelete,
  onRestored,
  onChanged,
}: NoteTrashModalProps) {
  const { t } = useTranslation();
  const svc = scopeType === 'personal' ? myNoteService : scopeType === 'org' ? orgNoteService : noteService;

  const [items, setItems] = useState<NoteTrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<NoteTrashItem | null>(null);
  const [confirmEmptyAll, setConfirmEmptyAll] = useState(false);

  const load = useCallback(async () => {
    if (!scopeId) return;
    setLoading(true);
    try {
      const data = await svc.getTrash(scopeId);
      setItems(data);
    } catch (err) {
      console.error('Failed to load trash:', err);
    } finally {
      setLoading(false);
    }
  }, [scopeId, svc]);

  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setConfirmTarget(null);
      setConfirmEmptyAll(false);
      load();
    }
  }, [open, load]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.title.toLowerCase().includes(q)
      || (i.parent_title?.toLowerCase().includes(q) ?? false)
      || (i.deleted_by?.name.toLowerCase().includes(q) ?? false),
    );
  }, [items, searchQuery]);

  const handleRestore = async (item: NoteTrashItem) => {
    setActingId(item.id);
    try {
      await svc.restoreFromTrash(scopeId, item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      onRestored?.(item.id);
      onChanged?.();
    } catch (err) {
      console.error('Failed to restore note:', err);
    } finally {
      setActingId(null);
    }
  };

  const handlePermanentDelete = async (item: NoteTrashItem) => {
    setActingId(item.id);
    try {
      await svc.permanentDelete(scopeId, item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      onChanged?.();
    } catch (err) {
      console.error('Failed to permanent delete:', err);
    } finally {
      setActingId(null);
      setConfirmTarget(null);
    }
  };

  const handleEmptyAll = async () => {
    setActingId('__all__');
    try {
      await svc.emptyTrash(scopeId);
      setItems([]);
      onChanged?.();
    } catch (err) {
      console.error('Failed to empty trash:', err);
    } finally {
      setActingId(null);
      setConfirmEmptyAll(false);
    }
  };

  const getIcon = (type: NoteTrashItem['type']) => {
    if (type === 'FOLDER') return <Folder size={16} className="text-amber-400" />;
    if (type === 'BOARD') return <PenTool size={16} className="text-bridge-secondary" />;
    return <FileText size={16} className="text-bridge-accent" />;
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      aria-label={t('notes.trash.title', '휴지통')}
      accentColor
      className="!max-w-2xl"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <Trash2 size={18} className="text-bridge-accent" />
        <h2 className="text-sm font-bold text-foreground flex-1">
          {t('notes.trash.title', '휴지통')}
          {items.length > 0 && (
            <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
              {items.length}
            </span>
          )}
        </h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          aria-label={t('common.close', '닫기')}
        >
          <X size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="px-5 pt-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('notes.trash.searchPlaceholder', '제목·삭제자로 검색...')}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 pt-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Trash2 size={32} className="mb-3 opacity-40" />
            <p className="text-sm">
              {items.length === 0
                ? t('notes.trash.empty', '휴지통이 비어 있습니다')
                : t('notes.trash.noMatches', '검색 결과가 없습니다')}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((item) => {
              const isActing = actingId === item.id;
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors"
                >
                  <div className="flex-shrink-0">{getIcon(item.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground font-medium truncate">{item.title}</span>
                      {item.has_children && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary flex-shrink-0">
                          {t('notes.trash.withChildren', '하위 포함')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {item.parent_title && (
                        <span className={item.parent_deleted ? 'line-through' : ''}>
                          {item.parent_title}
                        </span>
                      )}
                      {item.parent_title && <span className="mx-1.5">·</span>}
                      <span title={item.deleted_at ? formatDateTime(item.deleted_at) : ''}>
                        {item.deleted_at ? formatRelativeTime(item.deleted_at) : ''}
                      </span>
                      {item.deleted_by && (
                        <>
                          <span className="mx-1.5">·</span>
                          <span>{item.deleted_by.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      disabled={isActing}
                      onClick={() => handleRestore(item)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-bridge-accent hover:bg-bridge-accent/10 transition-colors disabled:opacity-50"
                    >
                      {isActing ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      {t('notes.trash.restore', '복구')}
                    </button>
                    {canPermanentDelete && (
                      <button
                        disabled={isActing}
                        onClick={() => setConfirmTarget(item)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        {t('notes.trash.permanentDelete', '영구 삭제')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          {t('notes.trash.autoDeleteNotice', '30일 후 자동으로 영구 삭제됩니다.')}
        </span>
        {canPermanentDelete && items.length > 0 && (
          <button
            onClick={() => setConfirmEmptyAll(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            {t('notes.trash.emptyAll', '전체 비우기')}
          </button>
        )}
      </div>

      {/* Confirm: Permanent delete single */}
      {confirmTarget && (
        <ConfirmInline
          icon={<AlertTriangle size={18} className="text-rose-400" />}
          title={t('notes.trash.permanentDeleteConfirmTitle', '영구 삭제할까요?')}
          message={t('notes.trash.permanentDeleteConfirm', '"{{title}}"와 모든 하위 항목, 댓글, 버전이 즉시 삭제되며 되돌릴 수 없습니다.', { title: confirmTarget.title })}
          confirmLabel={t('notes.trash.permanentDelete', '영구 삭제')}
          onConfirm={() => handlePermanentDelete(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
          loading={actingId === confirmTarget.id}
        />
      )}

      {/* Confirm: Empty all */}
      {confirmEmptyAll && (
        <ConfirmInline
          icon={<AlertTriangle size={18} className="text-rose-400" />}
          title={t('notes.trash.emptyAllConfirmTitle', '휴지통을 비울까요?')}
          message={t('notes.trash.emptyAllConfirm', '휴지통의 모든 항목({{count}}개)이 영구 삭제됩니다. 되돌릴 수 없습니다.', { count: items.length })}
          confirmLabel={t('notes.trash.emptyAll', '전체 비우기')}
          onConfirm={handleEmptyAll}
          onCancel={() => setConfirmEmptyAll(false)}
          loading={actingId === '__all__'}
        />
      )}
    </MotionModal>
  );
}

interface ConfirmInlineProps {
  icon: React.ReactNode;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function ConfirmInline({ icon, title, message, confirmLabel, onConfirm, onCancel, loading }: ConfirmInlineProps) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-bridge-obsidian/95 backdrop-blur rounded-2xl p-5">
      <div className="max-w-sm">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-slate-400 mb-4">{message}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
          >
            {t('common.cancel', '취소')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-500 hover:bg-rose-500/90 transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
