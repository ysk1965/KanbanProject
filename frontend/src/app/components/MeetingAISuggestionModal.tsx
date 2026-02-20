import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Sparkles, X, Loader2, Check, ChevronRight, ArrowRight, CheckSquare, Square } from 'lucide-react';
import {
  meetingAPI,
  featureAPI,
  taskAPI,
  AISuggestionResponse,
  AIFeatureSuggestion,
  AIApplyRequest,
  AIApplyResult,
} from '../utils/api';
import { MotionModal } from './ui/MotionModal';

interface MeetingAISuggestionModalProps {
  boardId: string;
  meetingId: string;
  meetingTitle: string;
  onClose: () => void;
  onApplied: () => void;
}

interface SelectionState {
  features: Record<number, boolean>;
  tasks: Record<string, boolean>; // "featureIdx-taskIdx"
  checklists: Record<string, boolean>; // "featureIdx-taskIdx-checklistIdx"
}

export default function MeetingAISuggestionModal({
  boardId,
  meetingId,
  meetingTitle,
  onClose,
  onApplied,
}: MeetingAISuggestionModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestionResponse | null>(null);
  const [selection, setSelection] = useState<SelectionState>({
    features: {},
    tasks: {},
    checklists: {},
  });
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<AIApplyResult | null>(null);
  const [expandedFeatures, setExpandedFeatures] = useState<Record<number, boolean>>({});
  const [lockedItems, setLockedItems] = useState<{ tasks: Record<string, boolean> }>({ tasks: {} });

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await meetingAPI.aiOrganize(boardId, meetingId, i18n.language);
      setSuggestions(data);
      // Initialize all items as selected
      const featureSel: Record<number, boolean> = {};
      const taskSel: Record<string, boolean> = {};
      const checklistSel: Record<string, boolean> = {};
      const expanded: Record<number, boolean> = {};

      data.features.forEach((feature, fi) => {
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
        data.features.forEach((feature, fi) => {
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
    } catch {
      setError(t('meeting.aiError'));
    } finally {
      setLoading(false);
    }
  }, [boardId, meetingId, t]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const isTaskLocked = useCallback((fi: number, ti: number) => !!lockedItems.tasks[`${fi}-${ti}`], [lockedItems]);
  const isFeatureAllLocked = useCallback((fi: number) => {
    if (!suggestions) return false;
    return suggestions.features[fi].tasks.every((_, ti) => isTaskLocked(fi, ti));
  }, [suggestions, isTaskLocked]);

  const toggleFeature = (fi: number) => {
    if (isFeatureAllLocked(fi)) return;
    const newVal = !selection.features[fi];
    setSelection(prev => {
      const next = { ...prev };
      next.features = { ...prev.features, [fi]: newVal };
      next.tasks = { ...prev.tasks };
      next.checklists = { ...prev.checklists };

      const feature = suggestions!.features[fi];
      feature.tasks.forEach((task, ti) => {
        if (!isTaskLocked(fi, ti)) {
          next.tasks[`${fi}-${ti}`] = newVal;
          task.checklists.forEach((_, ci) => {
            next.checklists[`${fi}-${ti}-${ci}`] = newVal;
          });
        }
      });

      // Feature is checked if any task is checked (including locked)
      const anyChecked = feature.tasks.some((_, idx) => next.tasks[`${fi}-${idx}`]);
      next.features[fi] = anyChecked;
      return next;
    });
  };

  const toggleTask = (fi: number, ti: number) => {
    if (isTaskLocked(fi, ti)) return;
    const key = `${fi}-${ti}`;
    const newVal = !selection.tasks[key];
    setSelection(prev => {
      const next = { ...prev };
      next.tasks = { ...prev.tasks, [key]: newVal };
      next.checklists = { ...prev.checklists };

      const task = suggestions!.features[fi].tasks[ti];
      task.checklists.forEach((_, ci) => {
        next.checklists[`${fi}-${ti}-${ci}`] = newVal;
      });

      const feature = suggestions!.features[fi];
      const anyTaskChecked = feature.tasks.some((_, idx) => {
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
      const next = { ...prev };
      next.checklists = { ...prev.checklists, [key]: newVal };

      const task = suggestions!.features[fi].tasks[ti];
      const taskKey = `${fi}-${ti}`;
      const anyChecklistChecked = task.checklists.some((_, idx) => {
        const cKey = `${fi}-${ti}-${idx}`;
        return cKey === key ? newVal : next.checklists[cKey];
      });
      next.tasks = { ...prev.tasks, [taskKey]: anyChecklistChecked };

      const feature = suggestions!.features[fi];
      const anyTaskChecked = feature.tasks.some((_, idx) => {
        const tKey = `${fi}-${idx}`;
        return tKey === taskKey ? anyChecklistChecked : next.tasks[tKey];
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
        task.checklists.forEach((_, ci) => {
          checklistSel[`${fi}-${ti}-${ci}`] = locked ? true : newVal;
        });
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
    setError(null);

    try {
      const request: AIApplyRequest = {
        features: suggestions.features
          .map((feature, fi) => {
            if (!selection.features[fi]) return null;

            const tasks = feature.tasks
              .map((task, ti) => {
                if (!selection.tasks[`${fi}-${ti}`]) return null;
                if (lockedItems.tasks[`${fi}-${ti}`]) return null; // Skip already existing

                const checklists = task.checklists
                  .filter((_, ci) => selection.checklists[`${fi}-${ti}-${ci}`])
                  .map(cl => ({ title: cl.title }));

                return {
                  title: task.title,
                  description: task.description ?? undefined,
                  checklists,
                };
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

      const applyResult = await meetingAPI.aiApply(boardId, meetingId, request);
      setResult(applyResult);
    } catch {
      setError(t('meeting.aiError'));
    } finally {
      setApplying(false);
    }
  };

  const toggleFeatureExpand = (fi: number) => {
    setExpandedFeatures(prev => ({ ...prev, [fi]: !prev[fi] }));
  };

  const renderCheckbox = (checked: boolean, locked: boolean = false) =>
    locked ? (
      <CheckSquare className="h-4 w-4 text-blue-400 flex-shrink-0 opacity-60" />
    ) : checked ? (
      <CheckSquare className="h-4 w-4 text-bridge-accent flex-shrink-0" />
    ) : (
      <Square className="h-4 w-4 text-slate-500 flex-shrink-0" />
    );

  const renderFeatureLabel = (feature: AIFeatureSuggestion) => {
    if (feature.type === 'EXISTING') {
      return (
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-foreground/5 px-1.5 py-0.5 rounded">
          {t('meeting.aiExistingFeature')}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded">
        <Sparkles className="h-3 w-3" />
        {t('meeting.aiNewFeature')}
      </span>
    );
  };

  return (
    <MotionModal open onClose={onClose} className="sm:w-[600px] sm:max-w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-bridge-accent" />
            <h2 className="text-base font-bold text-foreground">{t('meeting.aiOrganizeTitle')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1.5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="relative">
                <Sparkles className="h-8 w-8 text-bridge-accent animate-pulse" />
                <Loader2 className="h-5 w-5 text-bridge-accent animate-spin absolute -bottom-1 -right-1" />
              </div>
              <p className="text-sm text-slate-400">{t('meeting.aiAnalyzing')}</p>
            </div>
          ) : error && !suggestions ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchSuggestions}
                className="px-4 py-2 text-sm font-medium text-foreground bg-foreground/5 border border-foreground/10 rounded-xl hover:bg-foreground/10 transition-all"
              >
                {t('meeting.aiRetry')}
              </button>
            </div>
          ) : result ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-400" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {t('meeting.aiApplySuccess', {
                  features: result.features_created,
                  tasks: result.tasks_created,
                  checklists: result.checklists_created,
                })}
              </p>
              <button
                onClick={onApplied}
                className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-bridge-accent to-purple-500 rounded-xl hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
              >
                {t('meeting.aiApplyDone')}
              </button>
            </div>
          ) : suggestions && suggestions.features.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Sparkles className="h-8 w-8 text-slate-500" />
              <p className="text-sm text-slate-400">{t('meeting.aiNoSuggestions')}</p>
            </div>
          ) : suggestions ? (
            <div className="space-y-3">
              {/* Select All / Deselect All */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  {t('meeting.aiOrganizeTitle')}
                </span>
                <button
                  onClick={toggleAll}
                  className="text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors font-medium"
                >
                  {isAllSelected ? t('meeting.aiDeselectAll') : t('meeting.aiSelectAll')}
                </button>
              </div>

              {suggestions.features.map((feature, fi) => (
                <div
                  key={fi}
                  className="bg-white/[0.03] rounded-xl border border-foreground/5 overflow-hidden"
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
                      onClick={() => toggleFeatureExpand(fi)}
                      className="flex-shrink-0 text-slate-400 hover:text-foreground transition-colors"
                    >
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${
                          expandedFeatures[fi] ? 'rotate-90' : ''
                        }`}
                      />
                    </button>
                    {feature.type === 'NEW' && feature.color && (
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: feature.color }}
                      />
                    )}
                    <span className="text-sm font-medium text-foreground truncate flex-1">
                      {feature.title}
                    </span>
                    {renderFeatureLabel(feature)}
                  </div>

                  {/* Tasks */}
                  {expandedFeatures[fi] && (
                    <div className="border-t border-foreground/5">
                      {feature.tasks.map((task, ti) => (
                        <div key={ti}>
                          {/* Task row */}
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
                              <span className="text-sm text-muted-foreground truncate block">
                                {task.title}
                              </span>
                              {task.description && (
                                <span className="text-xs text-slate-500 truncate block mt-0.5">
                                  {task.description}
                                </span>
                              )}
                            </div>
                            {isTaskLocked(fi, ti) && (
                              <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded flex-shrink-0">
                                {t('meeting.aiAlreadyExists')}
                              </span>
                            )}
                          </div>

                          {/* Checklists */}
                          {task.checklists.map((checklist, ci) => (
                            <div
                              key={ci}
                              className={`flex items-center gap-2 px-4 py-2 pl-16 ${isTaskLocked(fi, ti) ? 'opacity-60' : ''}`}
                            >
                              {isTaskLocked(fi, ti) ? (
                                <span className="flex-shrink-0 cursor-not-allowed">
                                  {renderCheckbox(true, true)}
                                </span>
                              ) : (
                                <button
                                  onClick={() => toggleChecklist(fi, ti, ci)}
                                  className="flex-shrink-0"
                                >
                                  {renderCheckbox(!!selection.checklists[`${fi}-${ti}-${ci}`])}
                                </button>
                              )}
                              <span className="text-xs text-slate-400 truncate">
                                {checklist.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {suggestions && suggestions.features.length > 0 && !result && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-foreground/10">
            <span className="text-xs text-slate-400">
              {t('meeting.aiSelectedCount', { count: selectedCount })}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-foreground/5 border border-foreground/10 rounded-xl hover:bg-foreground/10 transition-all"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleApply}
                disabled={applying || selectedCount === 0}
                className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-bridge-accent to-purple-500 rounded-xl hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {applying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('meeting.aiApplying')}
                  </>
                ) : (
                  t('meeting.aiApply')
                )}
              </button>
            </div>
          </div>
        )}

        {/* Footer for error during apply */}
        {error && suggestions && !result && suggestions.features.length > 0 && (
          <div className="px-6 pb-3">
            <p className="text-xs text-red-400 text-center">{error}</p>
          </div>
        )}
    </MotionModal>
  );
}
