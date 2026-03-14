import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Trash2, ClipboardCheck, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { organizationService } from '../../utils/services';
import type { OnboardingTemplateSummary, OnboardingTemplateDetail, OrgDepartment, OrgJobGroup } from '../../types';

interface OnboardingTemplatesSectionProps {
  orgId: string;
  departments: OrgDepartment[];
  jobGroups: OrgJobGroup[];
}

interface TemplateItemForm {
  title: string;
  description: string;
  due_day_offset: number | null;
  assignee_role: string | null;
}

export function OnboardingTemplatesSection({ orgId, departments, jobGroups }: OnboardingTemplatesSectionProps) {
  const { t } = useTranslation();

  const [templates, setTemplates] = useState<OnboardingTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<OnboardingTemplateDetail | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAutoAssign, setFormAutoAssign] = useState(true);
  const [formDeptId, setFormDeptId] = useState('');
  const [formJobGroupId, setFormJobGroupId] = useState('');
  const [formItems, setFormItems] = useState<TemplateItemForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await organizationService.getOnboardingTemplates(orgId);
      setTemplates(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const toggleExpand = async (templateId: string) => {
    if (expandedId === templateId) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(templateId);
    try {
      const detail = await organizationService.getOnboardingTemplate(orgId, templateId);
      setExpandedDetail(detail);
    } catch {
      toast.error(t('organization.onboarding.error.loadTemplate', 'Failed to load template'));
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormAutoAssign(true);
    setFormDeptId('');
    setFormJobGroupId('');
    setFormItems([]);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
    setFormItems([{ title: '', description: '', due_day_offset: 0, assignee_role: null }]);
  };

  const openEditForm = async (templateId: string) => {
    try {
      const detail = await organizationService.getOnboardingTemplate(orgId, templateId);
      setEditingId(templateId);
      setFormName(detail.name);
      setFormDescription(detail.description || '');
      setFormAutoAssign(detail.auto_assign);
      setFormDeptId(detail.target_department?.id || '');
      setFormJobGroupId(detail.target_job_group?.id || '');
      setFormItems(
        detail.items.map((item) => ({
          title: item.title,
          description: item.description || '',
          due_day_offset: item.due_day_offset,
          assignee_role: item.assignee_role,
        }))
      );
      setShowForm(true);
    } catch {
      toast.error(t('organization.onboarding.error.loadTemplate', 'Failed to load template'));
    }
  };

  const addItem = () => {
    setFormItems([...formItems, { title: '', description: '', due_day_offset: null, assignee_role: null }]);
  };

  const removeItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof TemplateItemForm, value: string | number | null) => {
    const updated = [...formItems];
    updated[index] = { ...updated[index], [field]: value };
    setFormItems(updated);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    const validItems = formItems.filter((item) => item.title.trim());
    if (validItems.length === 0) {
      toast.error(t('organization.onboarding.error.noItems', 'Add at least one item'));
      return;
    }

    const data = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      auto_assign: formAutoAssign,
      target_department_id: formDeptId || null,
      target_job_group_id: formJobGroupId || null,
      items: validItems.map((item, i) => ({
        title: item.title.trim(),
        description: item.description.trim() || null,
        due_day_offset: item.due_day_offset,
        assignee_role: item.assignee_role,
        display_order: i,
      })),
    };

    try {
      setSaving(true);
      if (editingId) {
        await organizationService.updateOnboardingTemplate(orgId, editingId, data);
        toast.success(t('organization.onboarding.templateUpdated', 'Template updated'));
      } else {
        await organizationService.createOnboardingTemplate(orgId, data);
        toast.success(t('organization.onboarding.templateCreated', 'Template created'));
      }
      resetForm();
      fetchTemplates();
      setExpandedId(null);
      setExpandedDetail(null);
    } catch {
      toast.error(t('organization.onboarding.error.save', 'Failed to save template'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      setDeleting(templateId);
      await organizationService.deleteOnboardingTemplate(orgId, templateId);
      toast.success(t('organization.onboarding.templateDeleted', 'Template deleted'));
      fetchTemplates();
      if (expandedId === templateId) {
        setExpandedId(null);
        setExpandedDetail(null);
      }
    } catch {
      toast.error(t('organization.onboarding.error.delete', 'Failed to delete template'));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <div className="h-20 animate-pulse bg-foreground/[0.03] rounded-xl" />
      </section>
    );
  }

  return (
    <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck size={16} className="text-emerald-500" />
          {t('organization.onboarding.templates', 'Onboarding Templates')}
        </h3>
        {!showForm && (
          <button
            onClick={openCreateForm}
            className="flex items-center gap-1.5 text-sm text-bridge-accent hover:text-bridge-accent/80 transition-colors"
          >
            <Plus size={14} />
            {t('organization.onboarding.addTemplate', 'Template')}
          </button>
        )}
      </div>

      {/* Template List */}
      {templates.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {t('organization.onboarding.noTemplates', 'No onboarding templates yet')}
        </p>
      )}

      <div className="space-y-2">
        {templates.map((tmpl) => (
          <div key={tmpl.id} className="bg-foreground/[0.02] rounded-xl border border-foreground/[0.08] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => toggleExpand(tmpl.id)} className="shrink-0 text-muted-foreground">
                {expandedId === tmpl.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{tmpl.name}</span>
                  <span className="text-xs text-muted-foreground">{tmpl.item_count} items</span>
                  {tmpl.auto_assign && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      Auto
                    </span>
                  )}
                  {tmpl.target_department && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                      {tmpl.target_department.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => openEditForm(tmpl.id)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors text-xs"
                >
                  {t('common.edit', 'Edit')}
                </button>
                <button
                  onClick={() => handleDelete(tmpl.id)}
                  disabled={deleting === tmpl.id}
                  className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Expanded items */}
            <AnimatePresence>
              {expandedId === tmpl.id && expandedDetail && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-3 space-y-1">
                    {expandedDetail.items.map((item, i) => (
                      <div key={item.id} className="flex items-center gap-2 text-xs py-1">
                        <span className="text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                        <span className="text-foreground flex-1 truncate">{item.title}</span>
                        {item.due_day_offset != null && (
                          <span className="text-xs text-muted-foreground shrink-0">D+{item.due_day_offset}</span>
                        )}
                        {item.assignee_role && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-500 shrink-0">
                            {item.assignee_role === 'MANAGER'
                              ? t('organization.onboarding.manager', 'Manager')
                              : t('organization.onboarding.self', 'Self')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Create/Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-3"
          >
            <div className="bg-foreground/[0.02] rounded-xl border border-foreground/[0.08] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  {editingId
                    ? t('organization.onboarding.editTemplate', 'Edit Template')
                    : t('organization.onboarding.newTemplate', 'New Template')}
                </span>
                <button onClick={resetForm} className="p-1 text-muted-foreground hover:text-foreground" aria-label="닫기">
                  <X size={14} />
                </button>
              </div>

              {/* Name */}
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('organization.onboarding.templateName', 'Template name')}
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              />

              {/* Description */}
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder={t('organization.onboarding.templateDesc', 'Description (optional)')}
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              />

              {/* Options row */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={formAutoAssign}
                    onChange={(e) => setFormAutoAssign(e.target.checked)}
                    className="rounded accent-bridge-accent"
                  />
                  {t('organization.onboarding.autoAssign', 'Auto-assign')}
                </label>
                <select
                  value={formDeptId}
                  onChange={(e) => setFormDeptId(e.target.value)}
                  className="bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground"
                >
                  <option value="">{t('organization.onboarding.allDepts', 'All departments')}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <select
                  value={formJobGroupId}
                  onChange={(e) => setFormJobGroupId(e.target.value)}
                  className="bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1.5 px-2 text-xs text-foreground"
                >
                  <option value="">{t('organization.onboarding.allJobGroups', 'All job groups')}</option>
                  {jobGroups.map((j) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                  ))}
                </select>
              </div>

              {/* Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t('organization.onboarding.items', 'Items')}
                  </span>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs text-bridge-accent hover:text-bridge-accent/80"
                  >
                    <Plus size={12} />
                    {t('organization.onboarding.addItem', 'Add')}
                  </button>
                </div>
                {formItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <GripVertical size={14} className="text-muted-foreground mt-2.5 shrink-0" />
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateItem(i, 'title', e.target.value)}
                        placeholder={`${i + 1}. ${t('organization.onboarding.itemTitle', 'Item title')}`}
                        className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-2 px-2.5 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                      />
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">D+</span>
                          <input
                            type="number"
                            min={0}
                            value={item.due_day_offset ?? ''}
                            onChange={(e) => updateItem(i, 'due_day_offset', e.target.value === '' ? null : parseInt(e.target.value))}
                            className="w-12 bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1 px-1.5 text-xs text-center text-foreground focus:outline-none"
                            placeholder="-"
                          />
                        </div>
                        <select
                          value={item.assignee_role || ''}
                          onChange={(e) => updateItem(i, 'assignee_role', e.target.value || null)}
                          className="bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1 px-1.5 text-xs text-foreground"
                        >
                          <option value="">{t('organization.onboarding.noAssignee', 'No assignee')}</option>
                          <option value="SELF">{t('organization.onboarding.self', 'Self')}</option>
                          <option value="MANAGER">{t('organization.onboarding.manager', 'Manager')}</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(i)}
                      className="p-1 text-red-400 hover:text-red-500 mt-2 shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={resetForm}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim()}
                  className="px-4 py-1.5 bg-bridge-accent text-white text-xs font-bold rounded-lg hover:bg-bridge-accent/90 disabled:opacity-50 transition-all"
                >
                  {saving ? '...' : editingId ? t('common.save', 'Save') : t('common.create', 'Create')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
