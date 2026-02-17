import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, CalendarIcon, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import type { Milestone } from '../types';

interface AddFeatureModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (data: {
    title: string;
    description?: string;
    startDate?: string;
    dueDate?: string;
    milestoneId?: string;
  }) => void;
  milestones?: Milestone[];
  defaultMilestoneId?: string;
}

export function AddFeatureModal({ open, onClose, onAdd, milestones = [], defaultMilestoneId }: AddFeatureModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [milestoneId, setMilestoneId] = useState('');

  useEffect(() => {
    if (open) {
      setMilestoneId(defaultMilestoneId && defaultMilestoneId !== 'all' ? defaultMilestoneId : '');
    }
  }, [open, defaultMilestoneId]);

  const handleSubmit = () => {
    if (title.trim()) {
      onAdd({
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        dueDate: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
        milestoneId: milestoneId || undefined,
      });
      setTitle('');
      setDescription('');
      setDateRange(undefined);
      setMilestoneId('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-bridge-dark text-foreground border-white/10 max-w-lg p-0 gap-0 [&>button:last-child]:hidden overflow-hidden rounded-2xl">
        <DialogTitle className="sr-only">{t('feature.addTitle')}</DialogTitle>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.03]">
          <h2 className="text-lg font-bold text-foreground">{t('feature.addTitle')}</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="px-6 py-6 space-y-6">
          <div className="space-y-2">
            <label className="kanban-label block">{t('feature.titleLabel')} *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('feature.titlePlaceholder')}
              className="w-full bg-bridge-obsidian border border-white/10 rounded-xl p-3 text-foreground placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-all text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="kanban-label block">{t('feature.descriptionLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('feature.descriptionPlaceholder')}
              rows={3}
              className="w-full bg-bridge-obsidian border border-white/10 rounded-xl p-3 text-foreground placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-all resize-none text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="kanban-label block">{t('featureDetail.dateRange')}</label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center bg-bridge-surface-hover border border-white/10 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/50 text-xs font-bold text-foreground transition-all text-left"
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  {dateRange?.from ? (
                    <span>
                      {format(dateRange.from, 'yyyy. MM. dd.', { locale: ko })}
                      {' ~ '}
                      {dateRange.to
                        ? format(dateRange.to, 'yyyy. MM. dd.', { locale: ko })
                        : '?'}
                    </span>
                  ) : (
                    <span className="text-slate-500">{t('featureDetail.selectDateRange')}</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-bridge-obsidian border-white/10" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={ko}
                  className="bg-bridge-obsidian text-foreground"
                />
                {dateRange && (
                  <div className="p-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setDateRange(undefined)}
                      className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md py-1.5 transition-colors"
                    >
                      {t('featureDetail.removeDate')}
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {milestones.length > 0 && (
            <div className="space-y-2">
              <label className="kanban-label block">{t('milestone.titleLabel', '마일스톤')}</label>
              <div className="relative">
                <select
                  value={milestoneId}
                  onChange={(e) => setMilestoneId(e.target.value)}
                  className="w-full appearance-none bg-bridge-surface-hover border border-white/10 rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/50 text-xs font-bold text-foreground cursor-pointer"
                >
                  <option value="">{t('kanban.noMilestone', '없음')}</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-5 border-t border-white/10 bg-white/[0.03] flex justify-end items-center gap-4">
          <button
            onClick={onClose}
            className="text-[11px] font-bold text-slate-400 hover:text-foreground transition-all tracking-wider"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-6 py-2.5 bg-white text-black font-black text-[11px] rounded-lg tracking-widest hover:bg-zinc-200 transition-all flex items-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.add')}
            <CheckCircle2 size={14} className="text-indigo-600" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
