import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X, Loader2, Check, ChevronRight, ArrowRight, CheckSquare, Square } from 'lucide-react';
import {
  meetingAPI,
  AISuggestionResponse,
  AIFeatureSuggestion,
  AIApplyRequest,
  AIApplyResult,
} from '../utils/api';

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

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await meetingAPI.aiOrganize(boardId, meetingId);
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
    } catch {
      setError(t('meeting.aiError'));
    } finally {
      setLoading(false);
    }
  }, [boardId, meetingId, t]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const toggleFeature = (fi: number) => {
    const newVal = !selection.features[fi];
    setSelection(prev => {
      const next = { ...prev };
      next.features = { ...prev.features, [fi]: newVal };
      next.tasks = { ...prev.tasks };
      next.checklists = { ...prev.checklists };

      const feature = suggestions!.features[fi];
      feature.tasks.forEach((task, ti) => {
        next.tasks[`${fi}-${ti}`] = newVal;
        task.checklists.forEach((_, ci) => {
          next.checklists[`${fi}-${ti}-${ci}`] = newVal;
        });
      });

      return next;
    });
  };

  const toggleTask = (fi: number, ti: number) => {
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

      // Check if all tasks in feature are unchecked → auto-uncheck feature
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
    const key = `${fi}-${ti}-${ci}`;
    const newVal = !selection.checklists[key];
    setSelection(prev => {
      const next = { ...prev };
      next.checklists = { ...prev.checklists, [key]: newVal };

      // Check if all checklists in task are unchecked → auto-uncheck task
      const task = suggestions!.features[fi].tasks[ti];
      const taskKey = `${fi}-${ti}`;
      const anyChecklistChecked = task.checklists.some((_, idx) => {
        const cKey = `${fi}-${ti}-${idx}`;
        return cKey === key ? newVal : next.checklists[cKey];
      });
      next.tasks = { ...prev.tasks, [taskKey]: anyChecklistChecked };

      // Check if any task in feature is checked
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
      featureSel[fi] = newVal;
      feature.tasks.forEach((task, ti) => {
        taskSel[`${fi}-${ti}`] = newVal;
        task.checklists.forEach((_, ci) => {
          checklistSel[`${fi}-${ti}-${ci}`] = newVal;
        });
      });
    });

    setSelection({ features: featureSel, tasks: taskSel, checklists: checklistSel });
  };

  const selectedCount = useMemo(() => {
    let count = 0;
    Object.values(selection.features).forEach(v => { if (v) count++; });
    Object.values(selection.tasks).forEach(v => { if (v) count++; });
    Object.values(selection.checklists).forEach(v => { if (v) count++; });
    return count;
  }, [selection]);

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

  const renderCheckbox = (checked: boolean) =>
    checked ? (
      <CheckSquare className="h-4 w-4 text-bridge-accent flex-shrink-0" />
    ) : (
      <Square className="h-4 w-4 text-slate-500 flex-shrink-0" />
    );

  const renderFeatureLabel = (feature: AIFeatureSuggestion) => {
    if (feature.type === 'EXISTING') {
      return (
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">
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
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-bridge-obsidian rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col overflow-hidden border border-white/10"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-bridge-accent" />
            <h2 className="text-base font-bold text-white">{t('meeting.aiOrganizeTitle')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-white/5 rounded-lg p-1.5 transition-colors"
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
                className="px-4 py-2 text-sm font-medium text-white bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
              >
                {t('meeting.aiRetry')}
              </button>
            </div>
          ) : result ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-400" />
              </div>
              <p className="text-sm text-slate-300 text-center">
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
                  className="bg-white/[0.03] rounded-xl border border-white/5 overflow-hidden"
                >
                  {/* Feature row */}
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button onClick={() => toggleFeature(fi)} className="flex-shrink-0">
                      {renderCheckbox(!!selection.features[fi])}
                    </button>
                    <button
                      onClick={() => toggleFeatureExpand(fi)}
                      className="flex-shrink-0 text-slate-400 hover:text-white transition-colors"
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
                    <span className="text-sm font-medium text-white truncate flex-1">
                      {feature.title}
                    </span>
                    {renderFeatureLabel(feature)}
                  </div>

                  {/* Tasks */}
                  {expandedFeatures[fi] && (
                    <div className="border-t border-white/5">
                      {feature.tasks.map((task, ti) => (
                        <div key={ti}>
                          {/* Task row */}
                          <div className="flex items-center gap-2 px-4 py-2.5 pl-10">
                            <button onClick={() => toggleTask(fi, ti)} className="flex-shrink-0">
                              {renderCheckbox(!!selection.tasks[`${fi}-${ti}`])}
                            </button>
                            <ArrowRight className="h-3 w-3 text-slate-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-slate-300 truncate block">
                                {task.title}
                              </span>
                              {task.description && (
                                <span className="text-xs text-slate-500 truncate block mt-0.5">
                                  {task.description}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Checklists */}
                          {task.checklists.map((checklist, ci) => (
                            <div
                              key={ci}
                              className="flex items-center gap-2 px-4 py-2 pl-16"
                            >
                              <button
                                onClick={() => toggleChecklist(fi, ti, ci)}
                                className="flex-shrink-0"
                              >
                                {renderCheckbox(!!selection.checklists[`${fi}-${ti}-${ci}`])}
                              </button>
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
            <span className="text-xs text-slate-400">
              {t('meeting.aiSelectedCount', { count: selectedCount })}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all"
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
      </div>
    </div>
  );
}
