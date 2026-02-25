import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Building2, Users, LayoutGrid, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { organizationService } from '../utils/services';
import type { OrganizationSimple, OrgRole } from '../types';

const ROLE_BADGE_STYLES: Record<OrgRole, string> = {
  OWNER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  ADMIN: 'bg-bridge-accent/20 text-bridge-accent border-bridge-accent/30',
  MEMBER: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export function OrganizationPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [organizations, setOrganizations] = useState<OrganizationSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await organizationService.list();
      setOrganizations(data);
    } catch (error) {
      console.warn('Failed to fetch organizations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    try {
      setCreating(true);
      const newOrg = await organizationService.create({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
      });
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '' });
      navigate(`/organizations/${newOrg.id}`);
    } catch (error) {
      console.warn('Failed to create organization:', error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-bridge-dark">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {t('organization.list.title', 'My Organizations')}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('organization.list.subtitle', 'You are part of {{count}} organizations', {
              count: organizations.length,
            })}
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 bg-bridge-obsidian rounded-2xl border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {organizations.map((org) => (
              <motion.div
                key={org.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
                onClick={() => navigate(`/organizations/${org.id}`)}
                className="cursor-pointer bg-bridge-obsidian rounded-2xl border border-white/5 p-6 hover:border-white/10 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {org.logo_url ? (
                      <img src={org.logo_url} alt={org.name} className="w-10 h-10 rounded-xl object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-bridge-accent/20 flex items-center justify-center">
                        <Building2 size={20} className="text-bridge-accent" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-white font-semibold text-base group-hover:text-bridge-accent transition-colors">
                        {org.name}
                      </h3>
                      {org.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{org.description}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors mt-1" />
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Users size={13} />
                    {org.member_count}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <LayoutGrid size={13} />
                    {org.board_count}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${ROLE_BADGE_STYLES[org.my_role]}`}>
                    {org.my_role}
                  </span>
                </div>
              </motion.div>
            ))}

            {/* Create Organization Card */}
            <motion.div
              whileHover={{ y: -2 }}
              onClick={() => setShowCreateModal(true)}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-white/10 p-6 flex flex-col items-center justify-center gap-3 hover:border-bridge-accent/30 hover:bg-bridge-accent/5 transition-all min-h-[176px]"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <Plus size={20} className="text-slate-400" />
              </div>
              <span className="text-sm text-slate-400 font-medium">
                {t('organization.list.create', 'Create Organization')}
              </span>
            </motion.div>
          </div>
        )}
      </div>

      {/* Create Organization Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 flex items-center justify-center z-50 p-4"
            >
              <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-bold text-white mb-4">
                  {t('organization.create.title', 'Create Organization')}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                      {t('organization.create.name', 'Organization Name')}
                    </label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder={t('organization.create.namePlaceholder', 'e.g. CookApps')}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                      {t('organization.create.description', 'Description')}
                    </label>
                    <textarea
                      value={createForm.description}
                      onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                      placeholder={t('organization.create.descriptionPlaceholder', 'Brief description of the organization')}
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-5 py-2.5 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all text-sm font-medium"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!createForm.name.trim() || creating}
                    className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating
                      ? t('common.creating', 'Creating...')
                      : t('common.create', 'Create')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
