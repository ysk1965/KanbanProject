import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Briefcase,
  Clock,
  Pencil,
  Trash2,
  X,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { organizationService } from '../../../utils/services';
import type {
  OrgMemberDetail,
  OrgMemberHistoryItem,
  OrgDepartment,
  OrgJobGroup,
  OrgPosition,
  OrgTitle,
  OrgGrade,
  OrgStructureSettings,
} from '../../../types';

interface MemberHistoryTabProps {
  orgId: string;
  memberId: string;
  member: OrgMemberDetail;
  isAdmin: boolean;
  isSelf: boolean;
  departments: OrgDepartment[];
  jobGroups: OrgJobGroup[];
  positions: OrgPosition[];
  titles: OrgTitle[];
  grades: OrgGrade[];
  structureSettings?: OrgStructureSettings;
}

function formatHistoryDate(dateStr: string): string {
  const [y, m] = dateStr.split('-');
  return `${y}.${m.padStart(2, '0')}`;
}

function formatDuration(
  months: number | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (months === null || months === undefined) return '';
  if (months < 1) {
    return t('organization.members.detail.history.durationLessThanMonth', '1개월 미만');
  }
  if (months < 12) {
    return t('organization.members.detail.history.duration', { months });
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (m > 0) {
    return t('organization.members.detail.history.durationYears', { years: y, months: m });
  }
  return t('organization.members.detail.history.durationYearsOnly', { years: y });
}

export function MemberHistoryTab({
  orgId,
  memberId,
  member,
  isAdmin,
  isSelf,
  departments,
  jobGroups,
  positions,
  titles,
  grades,
  structureSettings: ss,
}: MemberHistoryTabProps) {
  const { t } = useTranslation();
  const deptOn = ss?.departments_enabled !== false;
  const jgOn = ss?.job_groups_enabled !== false;
  const posOn = ss?.positions_enabled !== false;
  const titleOn = ss?.titles_enabled !== false;
  const gradeOn = ss?.grades_enabled !== false;

  const [history, setHistory] = useState<OrgMemberHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDescId, setEditingDescId] = useState<string | null>(null);
  const [editingDescText, setEditingDescText] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Add form state
  const [addForm, setAddForm] = useState({
    effective_start_date: new Date().toISOString().split('T')[0],
    department_id: '',
    position_id: '',
    title_id: '',
    grade_id: '',
    job_group_id: '',
    job_title: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await organizationService.getMemberHistory(orgId, memberId);
      setHistory(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [orgId, memberId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleAddHistory = async () => {
    if (!addForm.effective_start_date) return;
    try {
      setSaving(true);
      await organizationService.createMemberHistory(orgId, memberId, {
        effective_start_date: addForm.effective_start_date,
        department_id: addForm.department_id || null,
        position_id: addForm.position_id || null,
        title_id: addForm.title_id || null,
        grade_id: addForm.grade_id || null,
        job_group_id: addForm.job_group_id || null,
        job_title: addForm.job_title || null,
        description: addForm.description || null,
      });
      setShowAddForm(false);
      setAddForm({
        effective_start_date: new Date().toISOString().split('T')[0],
        department_id: '',
        position_id: '',
        title_id: '',
        grade_id: '',
        job_group_id: '',
        job_title: '',
        description: '',
      });
      fetchHistory();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDescription = async (historyId: string) => {
    try {
      setSavingDesc(true);
      await organizationService.updateMemberHistoryDescription(
        orgId,
        memberId,
        historyId,
        editingDescText,
      );
      setEditingDescId(null);
      fetchHistory();
    } catch {
      // silently fail
    } finally {
      setSavingDesc(false);
    }
  };

  const handleDelete = async (historyId: string) => {
    try {
      await organizationService.deleteMemberHistory(orgId, memberId, historyId);
      setDeleteConfirmId(null);
      fetchHistory();
    } catch {
      // silently fail
    }
  };

  const canEditDescription = isAdmin || isSelf;

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-5 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {t('organization.members.detail.history.title', '인사 이력')}
        </h3>
        {isAdmin && (
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-bridge-accent
              bg-bridge-accent/10 rounded-lg hover:bg-bridge-accent/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('organization.members.detail.history.addEntry', '이력 추가')}
          </button>
        )}
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-5"
          >
            <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-xl border border-black/5 dark:border-white/5 p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                {t('organization.members.detail.history.addTitle', '이력 추가')}
              </h4>

              {/* Start Date */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-500 w-16 shrink-0">
                  {t('organization.members.detail.history.startDate', '시작일')}
                </label>
                <input
                  type="date"
                  value={addForm.effective_start_date}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, effective_start_date: e.target.value }))
                  }
                  className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
                    rounded-lg py-1.5 px-3 text-xs text-slate-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
              </div>

              {/* Department */}
              {deptOn && (
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-500 w-16 shrink-0">
                  {t('organization.members.detail.history.department', '부서')}
                </label>
                <select
                  value={addForm.department_id}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, department_id: e.target.value }))
                  }
                  className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
                    rounded-lg py-1.5 px-3 text-xs text-slate-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                >
                  <option value="">-</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              )}

              {/* Position + Title row */}
              {(posOn || titleOn) && (
              <div className="grid grid-cols-2 gap-3">
                {posOn && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500 w-16 shrink-0">
                    {t('organization.members.detail.history.position', '직책')}
                  </label>
                  <select
                    value={addForm.position_id}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, position_id: e.target.value }))
                    }
                    className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
                      rounded-lg py-1.5 px-3 text-xs text-slate-900 dark:text-white
                      focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  >
                    <option value="">-</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                )}
                {titleOn && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500 w-16 shrink-0">
                    {t('organization.members.detail.history.titleLabel', '직위')}
                  </label>
                  <select
                    value={addForm.title_id}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, title_id: e.target.value }))
                    }
                    className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
                      rounded-lg py-1.5 px-3 text-xs text-slate-900 dark:text-white
                      focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  >
                    <option value="">-</option>
                    {titles.map((t2) => (
                      <option key={t2.id} value={t2.id}>
                        {t2.name}
                      </option>
                    ))}
                  </select>
                </div>
                )}
              </div>
              )}

              {/* Grade + JobGroup row */}
              {(gradeOn || jgOn) && (
              <div className="grid grid-cols-2 gap-3">
                {gradeOn && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500 w-16 shrink-0">
                    {t('organization.members.detail.history.grade', '직급')}
                  </label>
                  <select
                    value={addForm.grade_id}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, grade_id: e.target.value }))
                    }
                    className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
                      rounded-lg py-1.5 px-3 text-xs text-slate-900 dark:text-white
                      focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  >
                    <option value="">-</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                )}
                {jgOn && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500 w-16 shrink-0">
                    {t('organization.members.detail.history.jobGroup', '직군')}
                  </label>
                  <select
                    value={addForm.job_group_id}
                    onChange={(e) =>
                      setAddForm((f) => ({ ...f, job_group_id: e.target.value }))
                    }
                    className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
                      rounded-lg py-1.5 px-3 text-xs text-slate-900 dark:text-white
                      focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  >
                    <option value="">-</option>
                    {jobGroups.map((jg) => (
                      <option key={jg.id} value={jg.id}>
                        {jg.name}
                      </option>
                    ))}
                  </select>
                </div>
                )}
              </div>
              )}

              {/* Job Title */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-500 w-16 shrink-0">
                  {t('organization.members.detail.history.jobTitle', '직무명')}
                </label>
                <input
                  type="text"
                  value={addForm.job_title}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, job_title: e.target.value }))
                  }
                  placeholder={t(
                    'organization.members.detail.history.jobTitlePlaceholder',
                    '예: Senior Engineer',
                  )}
                  className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
                    rounded-lg py-1.5 px-3 text-xs text-slate-900 dark:text-white
                    placeholder-slate-400 dark:placeholder-slate-600
                    focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">
                  {t('organization.members.detail.history.descriptionLabel', '직무 경험')}
                </label>
                <textarea
                  value={addForm.description}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder={t(
                    'organization.members.detail.history.descriptionPlaceholder',
                    '직무 경험을 기록해보세요',
                  )}
                  rows={3}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
                    rounded-lg p-3 text-xs text-slate-900 dark:text-white
                    placeholder-slate-400 dark:placeholder-slate-600 resize-none
                    focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white
                    transition-colors"
                >
                  {t('common.cancel', '취소')}
                </button>
                <button
                  onClick={handleAddHistory}
                  disabled={saving || !addForm.effective_start_date}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg
                    hover:bg-bridge-accent/90 disabled:opacity-50 transition-all"
                >
                  {saving
                    ? t('common.saving', '저장 중...')
                    : t('common.save', '저장')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {history.length === 0 && !showAddForm && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-bridge-accent/10 flex items-center justify-center mb-3">
            <Clock className="w-6 h-6 text-bridge-accent" />
          </div>
          <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
            {t('organization.members.detail.history.noHistory', '인사 이력이 없습니다')}
          </p>
          <p className="text-xs text-slate-500">
            {t(
              'organization.members.detail.history.noHistoryDesc',
              '인사 정보가 변경될 때 자동으로 기록됩니다',
            )}
          </p>
        </div>
      )}

      {/* Timeline */}
      {history.length > 0 && (
        <div className="space-y-0">
          {history.map((item, index) => {
            const isLast = index === history.length - 1;
            const orgName = member.user?.name
              ? t('organization.members.detail.history.orgLabel', '조직')
              : '';

            // Build subtitle parts
            const subtitleParts: string[] = [];
            if (posOn && item.position_name) subtitleParts.push(item.position_name);
            if (titleOn && item.title_name) subtitleParts.push(item.title_name);
            if (item.job_title) subtitleParts.push(item.job_title);
            if (jgOn && item.job_group_name) subtitleParts.push(item.job_group_name);

            const rangeLabel = item.effective_end_date
              ? `${formatHistoryDate(item.effective_start_date)} ~ ${formatHistoryDate(item.effective_end_date)}`
              : `${formatHistoryDate(item.effective_start_date)} ~ ${t('organization.members.detail.history.current', '현재')}`;

            const durationLabel = formatDuration(item.duration_months, t);

            return (
              <div key={item.id} className="relative flex gap-4">
                {/* Timeline line + dot */}
                <div className="flex flex-col items-center shrink-0 pt-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                      ${!item.effective_end_date
                        ? 'bg-bridge-accent/20'
                        : 'bg-black/[0.04] dark:bg-white/[0.06]'}`}
                  >
                    <Briefcase
                      className={`w-4 h-4 ${!item.effective_end_date ? 'text-bridge-accent' : 'text-slate-400'}`}
                    />
                  </div>
                  {!isLast && (
                    <div className="w-[1.5px] flex-1 bg-black/[0.06] dark:bg-white/[0.06] my-1" />
                  )}
                </div>

                {/* Content */}
                <div
                  className={`flex-1 pb-5 ${!isLast ? 'border-b border-black/[0.04] dark:border-white/[0.04] mb-5' : ''}`}
                >
                  {/* Department + Grade badge */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {deptOn && item.department_name && (
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {item.department_name}
                      </span>
                    )}
                    {gradeOn && item.grade_name && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-bridge-accent/20 text-bridge-accent">
                        {item.grade_name}
                      </span>
                    )}
                    {!item.effective_end_date && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        {t('organization.members.detail.history.current', '현재')}
                      </span>
                    )}
                    {item.source === 'MANUAL' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        {t('organization.members.detail.history.sourceManual', '수동 입력')}
                      </span>
                    )}
                  </div>

                  {/* Subtitle: position / title / job_title / job_group */}
                  {subtitleParts.length > 0 && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                      {subtitleParts.join(' · ')}
                    </p>
                  )}

                  {/* Date range + duration */}
                  <p className="text-xs text-slate-500 mb-3">
                    {rangeLabel}
                    {durationLabel && (
                      <span className="ml-1.5 text-slate-400">
                        ({durationLabel})
                      </span>
                    )}
                  </p>

                  {/* Description */}
                  {editingDescId === item.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingDescText}
                        onChange={(e) => setEditingDescText(e.target.value)}
                        placeholder={t(
                          'organization.members.detail.history.descriptionPlaceholder',
                          '직무 경험을 기록해보세요',
                        )}
                        rows={3}
                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10
                          rounded-lg p-3 text-xs text-slate-900 dark:text-white
                          placeholder-slate-400 dark:placeholder-slate-600 resize-none
                          focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveDescription(item.id)}
                          disabled={savingDesc}
                          className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white
                            bg-bridge-accent rounded-lg hover:bg-bridge-accent/90
                            disabled:opacity-50 transition-all"
                        >
                          <Check className="w-3 h-3" />
                          {t('organization.members.detail.history.saveDescription', '저장')}
                        </button>
                        <button
                          onClick={() => setEditingDescId(null)}
                          className="flex items-center gap-1 px-3 py-1 text-xs text-slate-500
                            hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" />
                          {t('common.cancel', '취소')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {item.description ? (
                        <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                          {item.description}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 dark:text-slate-600 italic">
                          - {t(
                            'organization.members.detail.history.noDescription',
                            '직무 경험을 작성해 주세요.',
                          )}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {canEditDescription && (
                          <button
                            onClick={() => {
                              setEditingDescId(item.id);
                              setEditingDescText(item.description || '');
                            }}
                            className="flex items-center gap-1 text-xs text-bridge-accent
                              hover:text-bridge-accent/80 transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            {item.description
                              ? t('organization.members.detail.history.editDescription', '수정')
                              : t('organization.members.detail.history.addDescription', '작성하기')}
                          </button>
                        )}
                        {isAdmin && (
                          <>
                            {deleteConfirmId === item.id ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-red-500">
                                  {t('organization.members.detail.history.deleteConfirm', '삭제하시겠습니까?')}
                                </span>
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="text-xs font-bold text-red-500 hover:text-red-600 transition-colors"
                                >
                                  {t('common.confirm', '확인')}
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                                >
                                  {t('common.cancel', '취소')}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(item.id)}
                                className="flex items-center gap-1 text-xs text-slate-400
                                  hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                                {t('organization.members.detail.history.deleteEntry', '삭제')}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
