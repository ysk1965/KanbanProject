import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles, Loader2, Star, ChevronRight, ArrowRight,
  CheckSquare, Square as SquareIcon,
} from 'lucide-react';
import type {
  NoteAISuggestionResponse, NoteAIApplyResult, AIApplyRequest,
  AIFeatureSuggestion,
} from '../../utils/api';
import { noteAPI, featureAPI, taskAPI } from '../../utils/api';

interface NoteAIInlineSectionProps {
  boardId: string;
  noteId: string;
  loading: boolean;
  error: string | null;
  suggestions: NoteAISuggestionResponse | null;
  onRetry: () => void;
  onClose: () => void;
}

interface AISelectionState {
  features: Record<number, boolean>;
  tasks: Record<string, boolean>;
  checklists: Record<string, boolean>;
}

export function NoteAIInlineSection({
  boardId,
  noteId,
  loading,
  error,
  suggestions,
  onRetry,
  onClose,
}: NoteAIInlineSectionProps) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<AISelectionState>({
    features: {},
    tasks: {},
    checklists: {},
  });
  const [expandedFeatures, setExpandedFeatures] = useState<Record<number, boolean>>({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [result, setResult] = useState<NoteAIApplyResult | null>(null);
  const [lockedItems, setLockedItems] = useState<{ tasks: Record<string, boolean> }>({ tasks: {} });

  // Initialize selection when suggestions load
  useEffect(() => {
    if (!suggestions || suggestions.features.length === 0) return;
    const featureSel: Record<number, boolean> = {};
    const taskSel: Record<string, boolean> = {};
    const checklistSel: Record<string, boolean> = {};
    const expanded: Record<number, boolean> = {};

    suggestions.features.forEach((feature, fi) => {
      featureSel[fi] = true;
      expanded[fi] = true;
      feature.tasks.forEach((task, ti) => {
        taskSel[`${fi}-${ti}`] = true;
        task.checklists.forEach((_, ci) => {
          checklistSel[`${fi}-${ti}-${ci}`] = true;
        });
      });
    });

    setSelection({ features: featureSel, tasks: taskSel, checklists: checklistSel });
    setExpandedFeatures(expanded);

    // Check for already-existing items on the board
    (async () => {
      try {
        const [featuresRes, tasksRes] = await Promise.all([
          featureAPI.getFeatures(boardId),
          taskAPI.getTasks(boardId),
        ]);
        const existingFeatures = featuresRes.features;
        const existingTasks = tasksRes.tasks;

        const featureTitleToId = new Map<string, string>();
        existingFeatures.forEach(f => featureTitleToId.set(f.title.trim().toLowerCase(), f.id));

        const tasksByFeatureId = new Map<string, Set<string>>();
        existingTasks.forEach(t => {
          if (!tasksByFeatureId.has(t.feature_id)) tasksByFeatureId.set(t.feature_id, new Set());
          tasksByFeatureId.get(t.feature_id)!.add(t.title.trim().toLowerCase());
        });

        const locked: Record<string, boolean> = {};
        suggestions.features.forEach((feature, fi) => {
          let featureId: string | null = null;
          if (feature.type === 'EXISTING' && feature.feature_id) {
            featureId = feature.feature_id;
          } else if (feature.type === 'NEW') {
            const norm = feature.title.trim().toLowerCase();
            if (featureTitleToId.has(norm)) featureId = featureTitleToId.get(norm)!;
          }
          if (featureId) {
            const existing = tasksByFeatureId.get(featureId) || new Set();
            feature.tasks.forEach((task, ti) => {
              if (existing.has(task.title.trim().toLowerCase())) {
                locked[`${fi}-${ti}`] = true;
              }
            });
          }
        });
        setLockedItems({ tasks: locked });
      } catch {
        // Duplicate check is best-effort
      }
    })();
  }, [suggestions, boardId]);

  const isTaskLocked = useCallback((fi: number, ti: number) => !!lockedItems.tasks[`${fi}-${ti}`], [lockedItems]);
  const isFeatureAllLocked = useCallback((fi: number) => {
    if (!suggestions) return false;
    return suggestions.features[fi].tasks.every((_, ti) => isTaskLocked(fi, ti));
  }, [suggestions, isTaskLocked]);

  const toggleFeature = (fi: number) => {
    if (isFeatureAllLocked(fi)) return;
    const newVal = !selection.features[fi];
    setSelection(prev => {
      const next = { ...prev, features: { ...prev.features, [fi]: newVal }, tasks: { ...prev.tasks }, checklists: { ...prev.checklists } };
      suggestions!.features[fi].tasks.forEach((task, ti) => {
        if (!isTaskLocked(fi, ti)) {
          next.tasks[`${fi}-${ti}`] = newVal;
          task.checklists.forEach((_, ci) => { next.checklists[`${fi}-${ti}-${ci}`] = newVal; });
        }
      });
      const anyChecked = suggestions!.features[fi].tasks.some((_, idx) => next.tasks[`${fi}-${idx}`]);
      next.features[fi] = anyChecked;
      return next;
    });
  };

  const toggleTask = (fi: number, ti: number) => {
    if (isTaskLocked(fi, ti)) return;
    const key = `${fi}-${ti}`;
    const newVal = !selection.tasks[key];
    setSelection(prev => {
      const next = { ...prev, tasks: { ...prev.tasks, [key]: newVal }, checklists: { ...prev.checklists } };
      suggestions!.features[fi].tasks[ti].checklists.forEach((_, ci) => {
        next.checklists[`${fi}-${ti}-${ci}`] = newVal;
      });
      const anyTaskChecked = suggestions!.features[fi].tasks.some((_, idx) => {
        const tKey = `${fi}-${idx}`;
        return tKey === key ? newVal : next.tasks[tKey];
      });
      next.features = { ...prev.features, [fi]: anyTaskChecked };
      return next;
    });
  };

  const toggleChecklist = (fi: number, ti: number, ci: number) => {
    if (isTaskLocked(fi, ti)) return;
    const key = `${fi}-${ti}-${ci}`;
    const newVal = !selection.checklists[key];
    setSelection(prev => {
      const next = { ...prev, checklists: { ...prev.checklists, [key]: newVal } };
      const taskKey = `${fi}-${ti}`;
      const anyClChecked = suggestions!.features[fi].tasks[ti].checklists.some((_, idx) => {
        const cKey = `${fi}-${ti}-${idx}`;
        return cKey === key ? newVal : next.checklists[cKey];
      });
      next.tasks = { ...prev.tasks, [taskKey]: anyClChecked };
      const anyTaskChecked = suggestions!.features[fi].tasks.some((_, idx) => {
        const tKey = `${fi}-${idx}`;
        return tKey === taskKey ? anyClChecked : next.tasks[tKey];
      });
      next.features = { ...prev.features, [fi]: anyTaskChecked };
      return next;
    });
  };

  const isAllSelected = useMemo(() => {
    if (!suggestions) return false;
    return suggestions.features.every((_, fi) => selection.features[fi]);
  }, [suggestions, selection]);

  const toggleAll = () => {
    if (!suggestions) return;
    const newVal = !isAllSelected;
    const featureSel: Record<number, boolean> = {};
    const taskSel: Record<string, boolean> = {};
    const checklistSel: Record<string, boolean> = {};
    suggestions.features.forEach((feature, fi) => {
      feature.tasks.forEach((task, ti) => {
        const locked = isTaskLocked(fi, ti);
        taskSel[`${fi}-${ti}`] = locked ? true : newVal;
        task.checklists.forEach((_, ci) => { checklistSel[`${fi}-${ti}-${ci}`] = locked ? true : newVal; });
      });
      const anyChecked = feature.tasks.some((_, idx) => taskSel[`${fi}-${idx}`]);
      featureSel[fi] = anyChecked;
    });
    setSelection({ features: featureSel, tasks: taskSel, checklists: checklistSel });
  };

  const selectedCount = useMemo(() => {
    let count = 0;
    Object.entries(selection.features).forEach(([, v]) => { if (v) count++; });
    Object.entries(selection.tasks).forEach(([key, v]) => { if (v && !lockedItems.tasks[key]) count++; });
    Object.entries(selection.checklists).forEach(([key, v]) => {
      if (v) {
        const parts = key.split('-');
        const taskKey = `${parts[0]}-${parts[1]}`;
        if (!lockedItems.tasks[taskKey]) count++;
      }
    });
    return count;
  }, [selection, lockedItems]);

  const handleApply = async () => {
    if (!suggestions) return;
    setApplying(true);
    setApplyError(null);
    try {
      const request: AIApplyRequest = {
        features: suggestions.features
          .map((feature, fi) => {
            if (!selection.features[fi]) return null;
            const tasks = feature.tasks
              .map((task, ti) => {
                if (!selection.tasks[`${fi}-${ti}`]) return null;
                if (lockedItems.tasks[`${fi}-${ti}`]) return null;
                const checklists = task.checklists
                  .filter((_, ci) => selection.checklists[`${fi}-${ti}-${ci}`])
                  .map(cl => ({ title: cl.title }));
                return { title: task.title, description: task.description ?? undefined, checklists };
              })
              .filter((t): t is NonNullable<typeof t> => t !== null);
            if (tasks.length === 0) return null;
            return {
              type: feature.type,
              feature_id: feature.feature_id ?? undefined,
              title: feature.title ?? undefined,
              description: feature.description ?? undefined,
              color: feature.color ?? undefined,
              tasks,
            };
          })
          .filter((f): f is NonNullable<typeof f> => f !== null),
      };
      const applyResult = await noteAPI.aiApply(boardId, noteId, request);
      setResult(applyResult);
    } catch {
      setApplyError(t('notes.aiError'));
    } finally {
      setApplying(false);
    }
  };

  const renderCheckbox = (checked: boolean, locked: boolean = false) =>
    locked ? (
      <CheckSquare className="h-4 w-4 text-blue-400 flex-shrink-0 opacity-60" />
    ) : checked ? (
      <CheckSquare className="h-4 w-4 text-bridge-accent flex-shrink-0" />
    ) : (
      <SquareIcon className="h-4 w-4 text-slate-500 flex-shrink-0" />
    );

  const renderFeatureLabel = (feature: AIFeatureSuggestion) => {
    if (feature.type === 'EXISTING') {
      return (
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">
          {t('notes.aiExistingFeature')}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded">
        <Sparkles className="h-3 w-3" />
        {t('notes.aiNewFeature')}
      </span>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="mt-4 bg-white/[0.02] rounded-xl border border-white/5 p-6">
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="relative">
            <Sparkles className="h-8 w-8 text-bridge-accent animate-pulse" />
            <Loader2 className="h-5 w-5 text-bridge-accent animate-spin absolute -bottom-1 -right-1" />
          </div>
          <p className="text-sm text-slate-400">{t('notes.aiAnalyzing')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !suggestions) {
    return (
      <div className="mt-4 bg-white/[0.02] rounded-xl border border-white/5 p-6">
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <p className="text-sm text-red-400">{error}</p>
          <div className="flex gap-2">
            <button
              onClick={onRetry}
              className="px-4 py-2 text-sm font-medium text-white bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
            >
              {t('notes.aiRetry')}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              {t('notes.aiClose')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!suggestions) return null;

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-bridge-accent" />
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            {t('notes.aiOrganizeTitle')}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {t('notes.aiClose')}
        </button>
      </div>

      {/* Key Points */}
      {suggestions.key_points && suggestions.key_points.length > 0 && (
        <div className="bg-bridge-accent/5 rounded-xl border border-bridge-accent/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-bridge-accent" />
            <span className="text-xs font-bold text-bridge-accent uppercase tracking-widest">
              {t('notes.aiKeyPoints')}
            </span>
          </div>
          <ul className="space-y-1.5">
            {suggestions.key_points.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                <span className="text-bridge-accent mt-1 text-xs">●</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary Topics */}
      {suggestions.summary && suggestions.summary.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            {t('notes.aiSummaryTitle')}
          </span>
          <div className="space-y-2">
            {suggestions.summary.map((topic, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${
                  topic.important
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-white">{topic.topic}</span>
                  {topic.important && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      {t('notes.aiImportant')}
                    </span>
                  )}
                </div>
                <ul className="space-y-1">
                  {topic.points.map((point, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-slate-500 mt-1 text-xs">–</span>
                      <span className="font-light">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task Recommendations */}
      {suggestions.features.length > 0 && !result && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {t('notes.aiRecommendedTasks')}
            </span>
            <button
              onClick={toggleAll}
              className="text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors font-medium"
            >
              {isAllSelected ? t('notes.aiDeselectAll') : t('notes.aiSelectAll')}
            </button>
          </div>

          <div className="space-y-2">
            {suggestions.features.map((feature, fi) => (
              <div
                key={fi}
                className="bg-white/[0.03] rounded-xl border border-white/5 overflow-hidden"
              >
                {/* Feature row */}
                <div className="flex items-center gap-2 px-4 py-3">
                  {isFeatureAllLocked(fi) ? (
                    <span className="flex-shrink-0 cursor-not-allowed">
                      {renderCheckbox(true, true)}
                    </span>
                  ) : (
                    <button onClick={() => toggleFeature(fi)} className="flex-shrink-0">
                      {renderCheckbox(!!selection.features[fi])}
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedFeatures(prev => ({ ...prev, [fi]: !prev[fi] }))}
                    className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
                  >
                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${expandedFeatures[fi] ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {feature.type === 'NEW' && feature.color && (
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: feature.color }} />
                  )}
                  <span className="text-sm font-medium text-white truncate flex-1">{feature.title}</span>
                  {renderFeatureLabel(feature)}
                </div>

                {/* Tasks */}
                {expandedFeatures[fi] && (
                  <div className="border-t border-white/5">
                    {feature.tasks.map((task, ti) => (
                      <div key={ti}>
                        <div className={`flex items-center gap-2 px-4 py-2.5 pl-10 ${isTaskLocked(fi, ti) ? 'opacity-60' : ''}`}>
                          {isTaskLocked(fi, ti) ? (
                            <span className="flex-shrink-0 cursor-not-allowed">
                              {renderCheckbox(true, true)}
                            </span>
                          ) : (
                            <button onClick={() => toggleTask(fi, ti)} className="flex-shrink-0">
                              {renderCheckbox(!!selection.tasks[`${fi}-${ti}`])}
                            </button>
                          )}
                          <ArrowRight className="h-3 w-3 text-slate-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-slate-300 truncate block">{task.title}</span>
                            {task.description && (
                              <span className="text-xs text-slate-500 truncate block mt-0.5">{task.description}</span>
                            )}
                          </div>
                          {isTaskLocked(fi, ti) && (
                            <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded flex-shrink-0">
                              {t('notes.aiAlreadyExists')}
                            </span>
                          )}
                        </div>
                        {task.checklists.map((checklist, ci) => (
                          <div key={ci} className={`flex items-center gap-2 px-4 py-2 pl-16 ${isTaskLocked(fi, ti) ? 'opacity-60' : ''}`}>
                            {isTaskLocked(fi, ti) ? (
                              <span className="flex-shrink-0 cursor-not-allowed">
                                {renderCheckbox(true, true)}
                              </span>
                            ) : (
                              <button onClick={() => toggleChecklist(fi, ti, ci)} className="flex-shrink-0">
                                {renderCheckbox(!!selection.checklists[`${fi}-${ti}-${ci}`])}
                              </button>
                            )}
                            <span className="text-xs text-slate-400 truncate">{checklist.title}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Apply footer */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              {t('notes.aiSelectedCount', { count: selectedCount })}
            </span>
            <button
              onClick={handleApply}
              disabled={applying || selectedCount === 0}
              className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-bridge-accent to-purple-500 rounded-xl hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {applying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('notes.aiApplying')}
                </>
              ) : (
                t('notes.aiApply')
              )}
            </button>
          </div>
          {applyError && (
            <p className="text-xs text-red-400 text-center">{applyError}</p>
          )}
        </div>
      )}

      {/* Apply Success */}
      {result && (
        <div className="bg-green-500/5 rounded-xl border border-green-500/20 p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <CheckSquare className="h-4 w-4 text-green-400" />
            </div>
            <p className="text-sm text-slate-300">
              {t('notes.aiApplySuccess', {
                features: result.features_created,
                tasks: result.tasks_created,
                checklists: result.checklists_created,
              })}
            </p>
          </div>
        </div>
      )}

      {/* No suggestions */}
      {suggestions.features.length === 0 && (!suggestions.summary || suggestions.summary.length === 0) && (
        <div className="bg-white/[0.02] rounded-xl border border-white/5 p-6 text-center">
          <Sparkles className="h-6 w-6 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">{t('notes.aiNoSuggestions')}</p>
        </div>
      )}
    </div>
  );
}
