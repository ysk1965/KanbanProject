import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Bookmark, X, Plus, Trash2 } from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface SavedPreset {
  id: string;
  title: string;
  start: string;
  end: string;
}

interface InsightsPeriodFilterProps {
  orgId: string;
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}

type PresetKey = 'last7' | 'last30' | 'thisMonth' | 'custom';

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

const STORAGE_KEY_PREFIX = 'insights-custom-presets-';

function loadSavedPresets(orgId: string): SavedPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + orgId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSavedPresets(orgId: string, presets: SavedPreset[]) {
  localStorage.setItem(STORAGE_KEY_PREFIX + orgId, JSON.stringify(presets));
}

function getPresetDates(preset: PresetKey): { start: string; end: string } | null {
  const today = new Date();
  const end = fmt(today);

  switch (preset) {
    case 'last7':
      return { start: fmt(subDays(today, 7)), end };
    case 'last30':
      return { start: fmt(subDays(today, 30)), end };
    case 'thisMonth':
      return { start: fmt(startOfMonth(today)), end };
    case 'custom':
      return null;
  }
}

function detectPreset(startDate: string, endDate: string): PresetKey {
  const today = new Date();
  const todayStr = fmt(today);

  if (endDate !== todayStr) return 'custom';
  if (startDate === fmt(subDays(today, 7))) return 'last7';
  if (startDate === fmt(subDays(today, 30))) return 'last30';
  if (startDate === fmt(startOfMonth(today))) return 'thisMonth';

  return 'custom';
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}. ${m}. ${day}.`;
}

export function InsightsPeriodFilter({ orgId, startDate, endDate, onChange }: InsightsPeriodFilterProps) {
  const { t } = useTranslation();
  const [activePreset, setActivePreset] = useState<PresetKey>(() => detectPreset(startDate, endDate));
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => loadSavedPresets(orgId));
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [showManage, setShowManage] = useState(false);
  const saveFormRef = useRef<HTMLDivElement>(null);
  const manageRef = useRef<HTMLDivElement>(null);

  const todayStr = fmt(new Date());

  // Close popover on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (showSaveForm && saveFormRef.current && !saveFormRef.current.contains(e.target as Node)) {
        setShowSaveForm(false);
        setSaveTitle('');
      }
      if (showManage && manageRef.current && !manageRef.current.contains(e.target as Node)) {
        setShowManage(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSaveForm, showManage]);

  const presets: { key: PresetKey; label: string }[] = [
    { key: 'last7', label: t('organization.insights.period.last7', 'Last 7 days') },
    { key: 'last30', label: t('organization.insights.period.last30', 'Last 30 days') },
    { key: 'thisMonth', label: t('organization.insights.period.thisMonth', 'This month') },
    { key: 'custom', label: t('organization.insights.period.custom', 'Custom') },
  ];

  const handlePreset = (key: PresetKey) => {
    setActivePreset(key);
    setActiveSavedId(null);
    const dates = getPresetDates(key);
    if (dates) {
      onChange(dates.start, dates.end);
    }
  };

  const handleSavedPreset = (preset: SavedPreset) => {
    setActivePreset('custom');
    setActiveSavedId(preset.id);
    onChange(preset.start, preset.end);
  };

  const handleStartChange = (newStart: string) => {
    if (newStart > endDate) return;
    setActiveSavedId(null);
    onChange(newStart, endDate);
  };

  const handleEndChange = (newEnd: string) => {
    if (newEnd < startDate) return;
    setActiveSavedId(null);
    onChange(startDate, newEnd);
  };

  const handleSave = () => {
    if (!saveTitle.trim()) return;
    const newPreset: SavedPreset = {
      id: Date.now().toString(),
      title: saveTitle.trim(),
      start: startDate,
      end: endDate,
    };
    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);
    saveSavedPresets(orgId, updated);
    setActiveSavedId(newPreset.id);
    setShowSaveForm(false);
    setSaveTitle('');
  };

  const handleDelete = (id: string) => {
    const updated = savedPresets.filter((p) => p.id !== id);
    setSavedPresets(updated);
    saveSavedPresets(orgId, updated);
    if (activeSavedId === id) {
      setActiveSavedId(null);
    }
  };

  const isCustomActive = activePreset === 'custom' && !activeSavedId;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Built-in presets */}
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              (p.key === 'custom' ? isCustomActive : activePreset === p.key && !activeSavedId)
                ? 'bg-bridge-accent text-white'
                : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            {p.label}
          </button>
        ))}

        {/* Saved presets */}
        {savedPresets.map((sp) => (
          <div key={sp.id} className="relative group flex items-center">
            <button
              onClick={() => handleSavedPreset(sp)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSavedId === sp.id
                  ? 'bg-bridge-accent text-white'
                  : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Bookmark size={11} className="shrink-0" />
              {sp.title}
            </button>
            <button
              onClick={() => handleDelete(sp.id)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity hidden group-hover:flex"
            >
              <X size={8} />
            </button>
          </div>
        ))}

        {/* Custom date inputs */}
        {activePreset === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <Calendar size={14} className="text-slate-400" />
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => handleStartChange(e.target.value)}
              className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
            />
            <span className="text-xs text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayStr}
              onChange={(e) => handleEndChange(e.target.value)}
              className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
            />

            {/* Save button */}
            <div className="relative" ref={saveFormRef}>
              <button
                onClick={() => setShowSaveForm(!showSaveForm)}
                className={`p-1.5 rounded-lg transition-colors ${
                  showSaveForm
                    ? 'text-bridge-accent bg-bridge-accent/10'
                    : 'text-slate-400 hover:text-bridge-accent hover:bg-bridge-accent/5'
                }`}
                title={t('organization.insights.period.savePreset', 'Save as preset')}
              >
                <Plus size={14} />
              </button>

              <AnimatePresence>
                {showSaveForm && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full left-0 mt-2 z-50 bg-bridge-obsidian border border-black/10 dark:border-white/10 rounded-xl shadow-xl p-3 min-w-[240px]"
                  >
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t('organization.insights.period.savePreset', 'Save as preset')}
                    </p>
                    <div className="flex items-center gap-1.5 mb-2">
                      <input
                        type="text"
                        value={saveTitle}
                        onChange={(e) => setSaveTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSave();
                          if (e.key === 'Escape') {
                            setShowSaveForm(false);
                            setSaveTitle('');
                          }
                        }}
                        placeholder={t('organization.insights.period.presetTitlePlaceholder', 'e.g., Q1 2026')}
                        maxLength={20}
                        autoFocus
                        className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                      />
                      <button
                        onClick={handleSave}
                        disabled={!saveTitle.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        {t('common.save', 'Save')}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {formatDisplayDate(startDate)} ~ {formatDisplayDate(endDate)}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Show saved preset date range when selected */}
        {activeSavedId && (
          <div className="flex items-center gap-2 ml-2">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-xs text-slate-500">
              {formatDisplayDate(startDate)} ~ {formatDisplayDate(endDate)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
