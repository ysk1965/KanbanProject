import { useState, useCallback } from 'react';
import { Sparkles, Loader2, Check, X, ChevronRight, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { featureAPI, FeatureAIDecompositionResponse, FeatureAITaskSuggestion } from '../utils/api';
import { MotionModal } from './ui/MotionModal';

interface FeatureAIDecomposeModalProps {
  boardId: string;
  featureId: string;
  featureTitle: string;
  existingTaskTitles: string[];
  onClose: () => void;
  onApplied: () => void;
}

interface SelectionState {
  tasks: Record<number, boolean>;
  checklists: Record<string, boolean>;
}

export function FeatureAIDecomposeModal({
  boardId,
  featureId,
  featureTitle,
  existingTaskTitles,
  onClose,
  onApplied,
}: FeatureAIDecomposeModalProps) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FeatureAIDecompositionResponse | null>(null);
  const [selection, setSelection] = useState<SelectionState>({ tasks: {}, checklists: {} });
  const [lockedTasks, setLockedTasks] = useState<Record<number, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<{ tasks_created: number; checklists_created: number } | null>(null);

  const existingTitlesLower = existingTaskTitles.map(t => t.trim().toLowerCase());

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuggestions(null);
    setResult(null);

    try {
      const data = await featureAPI.aiDecompose(boardId, featureId, i18n.language);
      setSuggestions(data);

      const taskSel: Record<number, boolean> = {};
      const checklistSel: Record<string, boolean> = {};
      const locked: Record<number, boolean> = {};
      const expanded: Record<number, boolean> = {};

      data.tasks.forEach((task: FeatureAITaskSuggestion, ti: number) => {
        const isExisting = existingTitlesLower.includes(task.title.trim().toLowerCase());
        taskSel[ti] = !isExisting;
        locked[ti] = isExisting;
        expanded[ti] = true;

        task.checklists.forEach((_, ci: number) => {
          checklistSel[`${ti}-${ci}`] = !isExisting;
        });
      });

      setSelection({ tasks: taskSel, checklists: checklistSel });
      setLockedTasks(locked);
      setExpandedTasks(expanded);
    } catch {
      setError(t('featureDetail.aiError'));
    } finally {
      setLoading(false);
    }
  }, [boardId, featureId, i18n.language, existingTitlesLower, t]);

  // Auto-fetch on mount
  useState(() => {
    fetchSuggestions();
  });

  const toggleTask = (ti: number) => {
    if (lockedTasks[ti]) return;
    const newVal = !selection.tasks[ti];
    setSelection(prev => {
      const next = { tasks: { ...prev.tasks, [ti]: newVal }, checklists: { ...prev.checklists } };
      if (suggestions) {
        suggestions.tasks[ti].checklists.forEach((_, ci) => {
          next.checklists[`${ti}-${ci}`] = newVal;
        });
      }
      return next;
    });
  };

  const toggleChecklist = (ti: number, ci: number) => {
    if (lockedTasks[ti]) return;
    const key = `${ti}-${ci}`;
    setSelection(prev => {
      const newVal = !prev.checklists[key];
      const next = { tasks: { ...prev.tasks }, checklists: { ...prev.checklists, [key]: newVal } };
      if (!newVal) {
        const task = suggestions!.tasks[ti];
        const anyChecked = task.checklists.some((_, idx) => {
          const k = `${ti}-${idx}`;
          return k === key ? false : next.checklists[k];
        });
        if (!anyChecked && !next.tasks[ti]) {
          // already unchecked
        }
      }
      return next;
    });
  };

  const toggleTaskExpand = (ti: number) => {
    setExpandedTasks(prev => ({ ...prev, [ti]: !prev[ti] }));
  };

  const getSelectedCount = () => {
    if (!suggestions) return 0;
    return Object.entries(selection.tasks).filter(([ti, v]) => v && !lockedTasks[Number(ti)]).length;
  };

  const selectAll = () => {
    if (!suggestions) return;
    const taskSel: Record<number, boolean> = {};
    const checklistSel: Record<string, boolean> = {};
    suggestions.tasks.forEach((task, ti) => {
      if (!lockedTasks[ti]) {
        taskSel[ti] = true;
        task.checklists.forEach((_, ci) => { checklistSel[`${ti}-${ci}`] = true; });
      } else {
        taskSel[ti] = false;
        task.checklists.forEach((_, ci) => { checklistSel[`${ti}-${ci}`] = false; });
      }
    });
    setSelection({ tasks: taskSel, checklists: checklistSel });
  };

  const deselectAll = () => {
    if (!suggestions) return;
    const taskSel: Record<number, boolean> = {};
    const checklistSel: Record<string, boolean> = {};
    suggestions.tasks.forEach((task, ti) => {
      taskSel[ti] = false;
      task.checklists.forEach((_, ci) => { checklistSel[`${ti}-${ci}`] = false; });
    });
    setSelection({ tasks: taskSel, checklists: checklistSel });
  };

  const handleApply = async () => {
    if (!suggestions) return;
    setApplying(true);
    setError(null);

    try {
      const tasksToApply = suggestions.tasks
        .map((task, ti) => {
          if (!selection.tasks[ti] || lockedTasks[ti]) return null;
          const checklists = task.checklists
            .filter((_, ci) => selection.checklists[`${ti}-${ci}`])
            .map(cl => ({ title: cl.title }));
          return { title: task.title, description: task.description ?? undefined, checklists };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);

      if (tasksToApply.length === 0) return;

      const applyResult = await featureAPI.aiApply(boardId, featureId, { tasks: tasksToApply });
      setResult(applyResult);
    } catch {
      setError(t('featureDetail.aiError'));
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
    <MotionModal open={true} onClose={onClose} className="sm:max-w-lg p-0 overflow-hidden max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-bridge-accent" />
            <h3 className="text-sm font-bold text-foreground">{t('featureDetail.aiDecomposeTitle')}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feature context */}
        <div className="px-5 py-3 border-b border-foreground/5">
          <p className="text-xs text-slate-400 truncate">{featureTitle}</p>
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
              <p className="text-sm text-slate-400">{t('featureDetail.aiAnalyzing')}</p>
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
                {t('featureDetail.aiRetry')}
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
                {t('featureDetail.aiApplySuccess', {
                  tasks: result.tasks_created,
                  checklists: result.checklists_created,
                })}
              </p>
              <button
                onClick={() => { onApplied(); onClose(); }}
                className="px-4 py-2 text-sm font-medium text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all"
              >
                {t('featureDetail.aiApplyDone')}
              </button>
            </div>
          )}

          {/* Suggestions list */}
          {suggestions && !result && !loading && (
            <div className="space-y-2">
              {suggestions.tasks.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">{t('featureDetail.aiNoSuggestions')}</p>
              ) : (
                <>
                  {/* Select all / deselect all */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {t('featureDetail.aiSelectedCount', { count: getSelectedCount() })}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={selectAll}
                        className="text-[10px] text-bridge-accent hover:text-bridge-accent/80 transition-colors">
                        {t('featureDetail.aiSelectAll')}
                      </button>
                      <span className="text-slate-600">|</span>
                      <button onClick={deselectAll}
                        className="text-[10px] text-slate-400 hover:text-foreground transition-colors">
                        {t('featureDetail.aiDeselectAll')}
                      </button>
                    </div>
                  </div>

                  {suggestions.tasks.map((task, ti) => (
                    <div key={ti} className="bg-white/[0.03] rounded-xl border border-foreground/5 overflow-hidden">
                      {/* Task row */}
                      <div className={`flex items-center gap-2 px-4 py-3 ${lockedTasks[ti] ? 'opacity-60' : ''}`}>
                        <button onClick={() => toggleTask(ti)} disabled={lockedTasks[ti]}>
                          {renderCheckbox(!!selection.tasks[ti], lockedTasks[ti])}
                        </button>
                        {task.checklists.length > 0 && (
                          <button onClick={() => toggleTaskExpand(ti)} className="text-slate-400 hover:text-foreground transition-colors">
                            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expandedTasks[ti] ? 'rotate-90' : ''}`} />
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-foreground">{task.title}</span>
                          {task.description && (
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{task.description}</p>
                          )}
                        </div>
                        {lockedTasks[ti] && (
                          <span className="text-[10px] text-blue-400 whitespace-nowrap">{t('featureDetail.aiAlreadyExists')}</span>
                        )}
                      </div>

                      {/* Checklists */}
                      {expandedTasks[ti] && task.checklists.length > 0 && (
                        <div className="border-t border-foreground/5">
                          {task.checklists.map((cl, ci) => (
                            <div key={ci} className={`flex items-center gap-2 px-4 py-2 pl-10 ${lockedTasks[ti] ? 'opacity-60' : ''}`}>
                              <button onClick={() => toggleChecklist(ti, ci)} disabled={lockedTasks[ti]}>
                                {renderCheckbox(!!selection.checklists[`${ti}-${ci}`], lockedTasks[ti])}
                              </button>
                              <span className="text-xs text-slate-400">{cl.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {suggestions && !result && !loading && suggestions.tasks.length > 0 && (
          <div className="px-5 py-4 border-t border-foreground/5 flex justify-end gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-foreground transition-colors">
              {t('common.cancel')}
            </button>
            <button
              onClick={handleApply}
              disabled={applying || getSelectedCount() === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-bridge-accent to-purple-500 rounded-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {applying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('featureDetail.aiApplying')}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('featureDetail.aiApply')}
                </>
              )}
            </button>
          </div>
        )}
    </MotionModal>
  );
}
