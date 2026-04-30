'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X, GripVertical, Check } from 'lucide-react';
import { MotionModal } from './ui/MotionModal';
import { IconButton } from './ui/IconButton';
import { jobRoleService } from '../utils/services';
import type { JobRole } from '../types';
import { ASSIGNEE_COLOR_NAMES } from '../utils/assigneeColor';

const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'indigo', hex: '#6366F1' },
  { name: 'purple', hex: '#8B5CF6' },
  { name: 'teal', hex: '#14B8A6' },
  { name: 'rose', hex: '#F43F5E' },
  { name: 'amber', hex: '#F59E0B' },
  { name: 'emerald', hex: '#10B981' },
  { name: 'sky', hex: '#0EA5E9' },
  { name: 'pink', hex: '#EC4899' },
];

export interface JobRoleManageModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  canManage: boolean;
  onChanged?: (roles: JobRole[]) => void;
}

export function JobRoleManageModal({
  open,
  onClose,
  boardId,
  canManage,
  onChanged,
}: JobRoleManageModalProps) {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(COLOR_PRESETS[0].hex);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>('');

  const reload = async () => {
    setLoading(true);
    try {
      const list = await jobRoleService.list(boardId);
      setRoles(list);
      onChanged?.(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load job roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      reload();
    } else {
      setEditingId(null);
      setNewName('');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boardId]);

  const handleCreate = async () => {
    if (submitting) return;
    const name = newName.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      await jobRoleService.create(boardId, { name, color: newColor });
      setNewName('');
      setNewColor(COLOR_PRESETS[0].hex);
      await reload();
    } catch (e: any) {
      setError(e?.message || t('jobRole.duplicateName'));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (role: JobRole) => {
    setEditingId(role.id);
    setEditName(role.name);
    setEditColor(role.color || COLOR_PRESETS[0].hex);
  };

  const saveEdit = async () => {
    if (submitting) return;
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      await jobRoleService.update(boardId, editingId, { name, color: editColor });
      setEditingId(null);
      await reload();
    } catch (e: any) {
      setError(e?.message || t('jobRole.duplicateName'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (role: JobRole) => {
    const count = role.member_count || 0;
    const msg = count > 0
      ? t('jobRole.deleteConfirm', { count })
      : t('jobRole.deleteConfirmEmpty');
    if (!confirm(msg)) return;
    try {
      await jobRoleService.remove(boardId, role.id);
      await reload();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete');
    }
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label={t('jobRole.manage')}
      className="sm:max-w-lg"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div>
          <h2 className="text-sm md:text-base font-bold text-foreground tracking-tight">
            {t('jobRole.manage')}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('jobRole.manageDesc')}
          </p>
        </div>
        <IconButton aria-label={t('common.close')} onClick={onClose} size="sm">
          <X />
        </IconButton>
      </div>

      <div className="px-5 pb-5 pt-4">
        {canManage && (
          <div className="mb-4 p-3 rounded-xl bg-foreground/[0.03] border border-foreground/10">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('jobRole.namePlaceholder')}
                className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-2 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (e.nativeEvent.isComposing || e.repeat) return;
                  e.preventDefault();
                  handleCreate();
                }}
                maxLength={50}
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || submitting}
                className="px-3 py-2 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                {t('jobRole.add')}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">{t('jobRole.colorLabel')}:</span>
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setNewColor(c.hex)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c.hex ? 'border-foreground scale-110' : 'border-transparent hover:scale-110'}`}
                  style={{ backgroundColor: c.hex }}
                  aria-label={c.name}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {loading && roles.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            {t('common.loading')}
          </div>
        ) : roles.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            {t('jobRole.empty')}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {roles.map((role) => {
              const isEditing = editingId === role.id;
              return (
                <li
                  key={role.id}
                  className="group flex items-center gap-2 px-2 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors"
                >
                  <GripVertical className="w-4 h-4 text-slate-500 shrink-0" />
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: isEditing ? editColor : (role.color || '#6366F1') }}
                  />
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 bg-bridge-obsidian border border-foreground/10 rounded-lg py-1 px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          if (e.nativeEvent.isComposing || e.repeat) return;
                          e.preventDefault();
                          saveEdit();
                        }}
                        maxLength={50}
                        autoFocus
                      />
                      <div className="flex items-center gap-1">
                        {COLOR_PRESETS.slice(0, 6).map((c) => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => setEditColor(c.hex)}
                            className={`w-4 h-4 rounded-full border-2 ${editColor === c.hex ? 'border-foreground' : 'border-transparent'}`}
                            style={{ backgroundColor: c.hex }}
                            aria-label={c.name}
                          />
                        ))}
                      </div>
                      <IconButton aria-label={t('common.save')} onClick={saveEdit} size="sm">
                        <Check />
                      </IconButton>
                      <IconButton aria-label={t('common.cancel')} onClick={() => setEditingId(null)} size="sm">
                        <X />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => canManage && startEdit(role)}
                        disabled={!canManage}
                        className="flex-1 text-left text-sm text-foreground font-medium truncate disabled:cursor-default"
                      >
                        {role.name}
                      </button>
                      {(role.member_count ?? 0) > 0 && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                          {role.member_count}
                        </span>
                      )}
                      {canManage && (
                        <IconButton
                          aria-label={t('common.delete')}
                          onClick={() => handleDelete(role)}
                          size="sm"
                        >
                          <Trash2 />
                        </IconButton>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">{t('common.escToClose')}</span>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
        >
          {t('common.close')}
        </button>
      </div>
    </MotionModal>
  );
}

export default JobRoleManageModal;
// 사용 가능한 색상 (assigneeColor 팔레트와 호환)
export const JOB_ROLE_COLOR_PRESETS = COLOR_PRESETS;
export { ASSIGNEE_COLOR_NAMES };
