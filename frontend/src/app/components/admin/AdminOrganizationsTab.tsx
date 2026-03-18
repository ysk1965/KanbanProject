import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronLeft, ChevronRight, Building2, Users, Folder, Calendar, Filter, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { adminService } from '../../utils/services';
import { OrgListResponse } from '../../utils/api';
import { AdminOrgDetailModal } from './AdminOrgDetailModal';
import { formatDate as dateUtilsFormatDate, formatRelativeTime } from '../../utils/dateUtils';

export function AdminOrganizationsTab() {
  const { t } = useTranslation();

  const PLAN_OPTIONS = [
    { value: '', label: t('admin.organizations.filter.all') },
    { value: 'FREE', label: t('admin.organizations.filter.free') },
    { value: 'TEAM', label: t('admin.organizations.filter.team') },
    { value: 'TRIAL', label: t('admin.organizations.filter.trial') },
  ];

  const [orgs, setOrgs] = useState<OrgListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      let data: OrgListResponse;
      if (showDeleted) {
        data = await adminService.getDeletedOrganizations({
          page,
          size: 20,
          search: search || undefined,
        });
      } else {
        data = await adminService.getOrganizations({
          page,
          size: 20,
          search: search || undefined,
        });
      }
      setOrgs(data);
    } catch (err) {
      console.error('Failed to load organizations:', err);
      setError(t('admin.organizations.loadFailed', 'Failed to load organizations'));
    } finally {
      setIsLoading(false);
    }
  }, [page, search, showDeleted]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    loadOrgs();
  };

  const handleOrgUpdate = () => {
    loadOrgs();
  };

  const handleRestore = async (e: React.MouseEvent, orgId: string) => {
    e.stopPropagation();
    try {
      setIsRestoring(orgId);
      await adminService.restoreOrganization(orgId);
      loadOrgs();
    } catch (err) {
      console.error('Failed to restore organization:', err);
    } finally {
      setIsRestoring(null);
    }
  };

  const formatDate = (dateString: string) => {
    return dateUtilsFormatDate(dateString, t('admin.common.dateFormat'));
  };

  const getPlanStyle = (plan: string) => {
    switch (plan) {
      case 'FREE':
        return 'bg-slate-500/15 text-slate-400';
      case 'TEAM':
        return 'bg-bridge-accent/15 text-bridge-accent';
      default:
        return 'bg-slate-500/15 text-slate-400';
    }
  };

  const getStatusStyle = (status: string | null) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'TRIAL':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'SUSPENDED':
        return 'bg-red-500/15 text-red-600 dark:text-red-400';
      case 'CANCELED':
        return 'bg-slate-500/15 text-slate-400';
      case 'PAST_DUE':
        return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
      default:
        return 'bg-slate-500/15 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{t('admin.organizations.title')}</h2>
          <p className="text-slate-400">{t('admin.organizations.subtitle', 'Manage all organizations')}</p>
        </div>
      </div>

      {/* Tab Toggle: Active / Deleted */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setShowDeleted(false); setPage(0); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            !showDeleted
              ? 'bg-bridge-accent text-white'
              : 'bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10'
          }`}
        >
          <Building2 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          {t('admin.organizations.activeOrgs', 'Active Organizations')}
        </button>
        <button
          onClick={() => { setShowDeleted(true); setPage(0); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showDeleted
              ? 'bg-red-500/20 text-red-400'
              : 'bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10'
          }`}
        >
          <Trash2 className="h-4 w-4 inline mr-1.5 -mt-0.5" />
          {t('admin.organizations.deleted.title')}
        </button>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex gap-3 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('admin.organizations.search')}
              className="w-full bg-bridge-obsidian border border-foreground/[0.08] rounded-xl py-3 pl-12 pr-4
                text-foreground placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
                transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-bridge-accent text-white rounded-xl font-medium
              hover:bg-bridge-accent/90 transition-colors"
          >
            {t('common.search')}
          </button>
        </form>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={loadOrgs}
            className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <div className="flex items-center justify-center h-64" role="status" aria-label="로딩 중">
          <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
        </div>
      )}

      {/* Organizations Table */}
      {!isLoading && !error && orgs && (
        <>
          {orgs.organizations.length === 0 ? (
            <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-12 text-center">
              {showDeleted ? (
                <>
                  <Trash2 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg">{t('admin.organizations.deleted.empty')}</p>
                </>
              ) : (
                <>
                  <Building2 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg">{t('admin.organizations.empty')}</p>
                </>
              )}
            </div>
          ) : (
            <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-foreground/[0.08]">
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.organizations.table.name')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.organizations.table.owner')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.organizations.table.plan')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.organizations.table.status')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.organizations.table.members')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.organizations.table.boards')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {showDeleted ? t('admin.organizations.deleted.deletedAt') : t('admin.organizations.table.created')}
                    </th>
                    <th className="text-right px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.organizations.map((org) => (
                    <tr
                      key={org.id}
                      onClick={() => setSelectedOrgId(org.id)}
                      className={`border-b border-foreground/[0.08] last:border-0 hover:bg-foreground/5 cursor-pointer transition-colors ${
                        showDeleted ? 'opacity-75' : ''
                      }`}
                    >
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            showDeleted ? 'bg-red-500/20' : 'bg-bridge-accent/20'
                          }`}>
                            {showDeleted ? (
                              <Trash2 className="h-5 w-5 text-red-400" />
                            ) : org.logo_url ? (
                              <img src={org.logo_url} alt={org.name || '조직 로고'} className="w-10 h-10 rounded-lg object-cover" />
                            ) : (
                              <Building2 className="h-5 w-5 text-bridge-accent" />
                            )}
                          </div>
                          <div>
                            <p className="text-foreground font-medium">{org.name}</p>
                            {org.description && (
                              <p className="text-slate-400 text-sm truncate max-w-[200px]">
                                {org.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div>
                          <p className="text-foreground">{org.owner.name}</p>
                          <p className="text-slate-400 text-sm">{org.owner.email}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getPlanStyle(org.plan)}`}>
                          {org.plan}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getStatusStyle(org.subscription_status)}`}>
                          {org.subscription_status || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className="text-foreground flex items-center gap-1">
                          <Users className="h-4 w-4 text-slate-400" />
                          {org.member_count}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className="text-foreground flex items-center gap-1">
                          <Folder className="h-4 w-4 text-slate-400" />
                          {org.board_count}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        {showDeleted && org.deleted_at ? (
                          <span className="text-red-400 text-sm">
                            {formatRelativeTime(org.deleted_at)}
                          </span>
                        ) : (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(org.created_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                        {showDeleted && (
                          <button
                            onClick={(e) => handleRestore(e, org.id)}
                            disabled={isRestoring === org.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                              text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg
                              hover:bg-emerald-500/20 hover:border-emerald-500/30
                              disabled:opacity-50 disabled:cursor-not-allowed
                              transition-all"
                          >
                            <RotateCcw className={`h-3.5 w-3.5 ${isRestoring === org.id ? 'animate-spin' : ''}`} />
                            {t('admin.organizations.actions.restore')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {orgs.organizations.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-sm">
                {t('admin.common.totalItems', { count: orgs.total.toLocaleString() })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-2 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg
                    text-slate-400 hover:text-foreground hover:bg-foreground/5
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-slate-400 px-4">
                  {page + 1} / {Math.ceil(orgs.total / orgs.size) || 1}
                </span>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(orgs.total / orgs.size) - 1, page + 1))}
                  disabled={page >= Math.ceil(orgs.total / orgs.size) - 1}
                  className="p-2 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg
                    text-slate-400 hover:text-foreground hover:bg-foreground/5
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Org Detail Modal */}
      {selectedOrgId && (
        <AdminOrgDetailModal
          orgId={selectedOrgId}
          onClose={() => setSelectedOrgId(null)}
          onUpdate={handleOrgUpdate}
        />
      )}
    </div>
  );
}
