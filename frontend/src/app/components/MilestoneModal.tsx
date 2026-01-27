import { useState, useEffect } from 'react';
import { X, Flag, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Milestone, Feature } from '../types';

interface MilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone?: Milestone | null;
  features: Feature[];
  onSave: (data: {
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    feature_ids?: string[];
  }) => Promise<void>;
  onDelete?: (milestoneId: string) => Promise<void>;
}

export function MilestoneModal({
  isOpen,
  onClose,
  milestone,
  features,
  onSave,
  onDelete,
}: MilestoneModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const isEditMode = !!milestone;

  useEffect(() => {
    if (milestone) {
      setTitle(milestone.title);
      setDescription(milestone.description || '');
      setStartDate(new Date(milestone.start_date));
      setEndDate(new Date(milestone.end_date));
      setSelectedFeatureIds(new Set(milestone.features?.map((f) => f.id) || []));
    } else {
      setTitle('');
      setDescription('');
      setStartDate(undefined);
      setEndDate(undefined);
      setSelectedFeatureIds(new Set());
    }
  }, [milestone, isOpen]);

  const handleSave = async () => {
    if (!title.trim() || !startDate || !endDate) {
      alert('제목, 시작일, 종료일은 필수입니다.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        feature_ids: Array.from(selectedFeatureIds),
      });
      onClose();
    } catch (error) {
      console.error('Failed to save milestone:', error);
      alert('마일스톤 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!milestone || !onDelete) return;

    if (!confirm('정말 이 마일스톤을 삭제하시겠습니까?')) return;

    try {
      await onDelete(milestone.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete milestone:', error);
      alert('마일스톤 삭제에 실패했습니다.');
    }
  };

  const toggleFeature = (featureId: string) => {
    setSelectedFeatureIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(featureId)) {
        newSet.delete(featureId);
      } else {
        newSet.add(featureId);
      }
      return newSet;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50">
      <div className="bg-kanban-bg rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-kanban-border bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-foreground">
              {isEditMode ? '마일스톤 수정' : '새 마일스톤'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 제목 */}
          <div className="space-y-2">
            <label className="kanban-label block">제목 *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="마일스톤 제목"
              className="bg-kanban-input border-white/5 text-white placeholder-zinc-600 focus:border-indigo-500/50 rounded-xl"
            />
          </div>

          {/* 설명 */}
          <div className="space-y-2">
            <label className="kanban-label block">설명</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="마일스톤 설명"
              rows={3}
              className="bg-kanban-input border-white/5 text-white placeholder-zinc-600 resize-none focus:border-indigo-500/50 rounded-xl"
            />
          </div>

          {/* 기간 */}
          <div className="space-y-2">
            <label className="kanban-label block">기간 *</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-10 justify-start text-left font-normal bg-kanban-card-hover border-white/5 text-white hover:bg-kanban-surface hover:border-indigo-500/50 rounded-xl"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-zinc-500" />
                  {startDate && endDate ? (
                    <>
                      {format(startDate, 'yyyy. MM. dd.', { locale: ko })}
                      {' ~ '}
                      {format(endDate, 'yyyy. MM. dd.', { locale: ko })}
                    </>
                  ) : (
                    <span className="text-zinc-500">기간을 선택하세요</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-kanban-card border-kanban-border" align="start">
                <Calendar
                  mode="range"
                  selected={{
                    from: startDate,
                    to: endDate,
                  }}
                  onSelect={(range) => {
                    setStartDate(range?.from);
                    setEndDate(range?.to);
                  }}
                  numberOfMonths={2}
                  locale={ko}
                  className="text-white"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Feature 연결 */}
          <div className="space-y-2">
            <label className="kanban-label block">연결할 Feature</label>
            <div className="max-h-48 overflow-y-auto space-y-1 bg-kanban-card rounded-xl p-2 border border-white/5">
              {features.length > 0 ? (
                features.map((feature) => (
                  <label
                    key={feature.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-kanban-surface cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFeatureIds.has(feature.id)}
                      onChange={() => toggleFeature(feature.id)}
                      className="w-4 h-4 rounded border-white/10 bg-kanban-input text-indigo-500 focus:ring-indigo-500"
                    />
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: feature.color }}
                    />
                    <span className="text-sm text-zinc-300 truncate">
                      {feature.title}
                    </span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-zinc-500 text-center py-4">
                  연결할 Feature가 없습니다
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between p-5 border-t border-kanban-border bg-white/[0.02]">
          <div>
            {isEditMode && onDelete && (
              <Button
                variant="ghost"
                onClick={handleDelete}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                삭제
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="text-[11px] font-bold text-zinc-500 hover:text-foreground transition-all tracking-wider"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 bg-white text-black font-black text-[11px] rounded-lg tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? '저장 중...' : isEditMode ? '수정' : '생성'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
