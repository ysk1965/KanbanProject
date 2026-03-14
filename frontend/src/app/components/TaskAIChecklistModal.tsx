import { useState, useCallback } from 'react';
import { Sparkles, Loader2, Check, X, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { checklistAPI, ChecklistAIDecompositionResponse, ChecklistAIItemSuggestion } from '../utils/api';
import { MotionModal } from './ui/MotionModal';

interface TaskAIChecklistModalProps {
  boardId: string;
  taskId: string;
  taskTitle: string;
  existingChecklistTitles: string[];
  onClose: () => void;
  onApplied: () => void;
}

export function TaskAIChecklistModal({
  boardId,
  taskId,
  taskTitle,
  existingChecklistTitles,
  onClose,
  onApplied,
}: TaskAIChecklistModalProps) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ChecklistAIDecompositionResponse | null>(null);
  const [selection, setSelection] = useState<Record<number, boolean>>({});
  const [lockedItems, setLockedItems] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<{ items_created: number } | null>(null);

  const existingTitlesLower = existingChecklistTitles.map(t => t.trim().toLowerCase());

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuggestions(null);
    setResult(null);

    try {
      const data = await checklistAPI.aiDecompose(boardId, taskId, i18n.language);
      setSuggestions(data);

      const sel: Record<number, boolean> = {};
      const locked: Record<number, boolean> = {};

      data.items.forEach((item: ChecklistAIItemSuggestion, idx: number) => {
        const isExisting = existingTitlesLower.includes(item.title.trim().toLowerCase());
        sel[idx] = !isExisting;
        locked[idx] = isExisting;
      });

      setSelection(sel);
      setLockedItems(locked);
    } catch {
      setError(t('task.aiChecklistError'));
    } finally {
      setLoading(false);
    }
  }, [boardId, taskId, i18n.language, existingTitlesLower, t]);

  // Auto-fetch on mount
  useState(() => {
    fetchSuggestions();
  });

  const toggleItem = (idx: number) => {
    if (lockedItems[idx]) return;
    setSelection(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const getSelectedCount = () => {
    if (!suggestions) return 0;
    return Object.entries(selection).filter(([idx, v]) => v && !lockedItems[Number(idx)]).length;
  };

  const selectAll = () => {
    if (!suggestions) return;
    const sel: Record<number, boolean> = {};
    suggestions.items.forEach((_, idx) => {
      sel[idx] = !lockedItems[idx];
    });
    setSelection(sel);
  };

  const deselectAll = () => {
    if (!suggestions) return;
    const sel: Record<number, boolean> = {};
    suggestions.items.forEach((_, idx) => {
      sel[idx] = false;
    });
    setSelection(sel);
  };

  const handleApply = async () => {
    if (!suggestions) return;
    setApplying(true);
    setError(null);

    try {
      const itemsToApply = suggestions.items
        .map((item, idx) => {
          if (!selection[idx] || lockedItems[idx]) return null;
          return { title: item.title };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (itemsToApply.length === 0) return;

      const applyResult = await checklistAPI.aiApply(boardId, taskId, { items: itemsToApply });
      setResult(applyResult);
    } catch {
      setError(t('task.aiChecklistError'));
    } finally {
      setApplying(false);
    }
  };

  const renderCheckbox = (checked: boolean, disabled = false) => (
    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
      disabled ? 'border-slate-600 bg-slate-700/50 cursor-not-allowed' :
      checked ? 'border-bridge-accent bg-bridge-accent' : 'border-bridge-border bg-transparent hover:border-foreground/40'
    }`}>
      {checked && <Check className="h-2.5 w-2.5 text-white" />}
    </div>
  );

  return (
    <MotionModal open={true} onClose={onClose} className="sm:max-w-lg p-0 overflow-hidden max-h-[80dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-bridge-accent" />
            <h3 className="text-sm font-bold text-foreground">{t('task.aiChecklistDecomposeTitle')}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-foreground transition-colors" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Task context */}
        <div className="px-5 py-3 border-b border-foreground/5">
          <p className="text-xs text-slate-400 truncate">{taskTitle}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="relative">
                <Sparkles className="h-8 w-8 text-bridge-accent animate-pulse" />
                <Loader2 className="h-5 w-5 text-bridge-accent animate-spin absolute -bottom-1 -right-1" />
              </div>
              <p className="text-sm text-slate-400">{t('task.aiChecklistAnalyzing')}</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchSuggestions}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-bridge-accent bg-bridge-accent/10 rounded-lg hover:bg-bridge-accent/20 transition-all"
              >
                <RefreshCw className="h-3 w-3" />
                {t('task.aiChecklistRetry')}
              </button>
            </div>
          )}

          {/* Success result */}
          {result && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-400" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('task.aiChecklistApplySuccess', { count: result.items_created })}
              </p>
              <button
                onClick={() => { onApplied(); onClose(); }}
                className="px-4 py-2 text-sm font-medium text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all"
              >
                {t('task.aiChecklistApplyDone')}
              </button>
            </div>
          )}

          {/* Suggestions list */}
          {suggestions && !result && !loading && (
            <div className="space-y-2">
              {suggestions.items.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">{t('task.aiChecklistNoSuggestions')}</p>
              ) : (
                <>
                  {/* Select all / deselect all */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {t('task.aiChecklistSelectedCount', { count: getSelectedCount() })}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={selectAll}
                        className="text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors">
                        {t('task.aiChecklistSelectAll')}
                      </button>
                      <span className="text-slate-600">|</span>
                      <button onClick={deselectAll}
                        className="text-xs text-slate-400 hover:text-foreground transition-colors">
                        {t('task.aiChecklistDeselectAll')}
                      </button>
                    </div>
                  </div>

                  {suggestions.items.map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 px-4 py-3 bg-white/[0.03] rounded-xl border border-foreground/5 ${lockedItems[idx] ? 'opacity-60' : ''}`}
                    >
                      <button onClick={() => toggleItem(idx)} disabled={lockedItems[idx]}>
                        {renderCheckbox(!!selection[idx], lockedItems[idx])}
                      </button>
                      <span className="text-sm text-foreground flex-1">{item.title}</span>
                      {lockedItems[idx] && (
                        <span className="text-xs text-blue-400 whitespace-nowrap">{t('task.aiChecklistAlreadyExists')}</span>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {suggestions && !result && !loading && suggestions.items.length > 0 && (
          <div className="px-5 py-4 border-t border-foreground/5 flex justify-end gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-foreground transition-colors">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleApply}
              disabled={applying || getSelectedCount() === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-lg hover:shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {applying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('task.aiChecklistApplying')}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('task.aiChecklistApply')}
                </>
              )}
            </button>
          </div>
        )}
    </MotionModal>
  );
}
