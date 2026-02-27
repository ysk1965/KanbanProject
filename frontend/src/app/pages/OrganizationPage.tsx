import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Building2, Loader2, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { organizationService } from '../utils/services';
import { MotionModal } from '../components/ui/MotionModal';

export function OrganizationPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await organizationService.list();
      if (data.length > 0) {
        navigate(`/organizations/${data[0].id}`, { replace: true });
        return;
      }
    } catch (error) {
      console.warn('Failed to fetch organizations:', error);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-6 relative">
      {/* Back Button */}
      <button
        onClick={() => navigate('/dashboard')}
        className="absolute top-5 left-5 flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
      >
        <ArrowLeft size={18} />
        {t('common.back', 'Back')}
      </button>

      {/* Empty State */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center text-center max-w-sm w-full"
      >
        <div className="w-20 h-20 rounded-2xl bg-bridge-accent/10 flex items-center justify-center mb-6">
          <Building2 size={36} className="text-bridge-accent" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">
          {t('organization.list.emptyTitle', 'No organizations yet')}
        </h3>
        <p className="text-sm text-slate-500 mb-8 leading-relaxed">
          {t('organization.list.emptyDesc', 'Create your first organization to manage teams, boards, and leave requests in one place.')}
        </p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
        >
          <Plus size={16} />
          {t('organization.list.create', 'Create Organization')}
        </button>
      </motion.div>

      {/* Create Organization Modal */}
      <MotionModal open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="h-1 bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-t-2xl" />
        <div className="px-6 pt-5 pb-4 border-b border-foreground/[0.08]">
          <h2 className="text-lg font-bold text-foreground">
            {t('organization.create.title', 'Create Organization')}
          </h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.create.name', 'Organization Name')}
            </label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder={t('organization.create.namePlaceholder', 'e.g. CookApps')}
              className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              {t('organization.create.description', 'Description')}
            </label>
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder={t('organization.create.descriptionPlaceholder', 'Brief description of the organization')}
              rows={3}
              className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl py-3 px-4 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-foreground/[0.08] flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">ESC</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-foreground/[0.06] text-foreground hover:bg-foreground/10 transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!createForm.name.trim() || creating}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating
                ? t('common.creating', 'Creating...')
                : t('common.create', 'Create')}
            </button>
          </div>
        </div>
      </MotionModal>
    </div>
  );
}
