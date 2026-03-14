import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, CreditCard, Calendar, Folder, Loader2 } from 'lucide-react';
import { adminService } from '../../utils/services';
import { SubscriptionListResponse } from '../../utils/api';
import { formatDate as dateUtilsFormatDate } from '../../utils/dateUtils';

export function AdminSubscriptionsTab() {
  const { t } = useTranslation();
  const [subscriptions, setSubscriptions] = useState<SubscriptionListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const loadSubscriptions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getSubscriptions({ page, size: 20 });
      setSubscriptions(data);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
      setError(t('admin.subscriptions.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return dateUtilsFormatDate(dateString, t('admin.common.dateFormat'));
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-500/20 text-green-400';
      case 'CANCELLED':
        return 'bg-red-500/20 text-red-400';
      case 'EXPIRED':
        return 'bg-slate-500/20 text-slate-400';
      case 'PENDING':
        return 'bg-amber-500/20 text-amber-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getTierStyle = (tier: string) => {
    switch (tier) {
      case 'FREE':
        return 'bg-slate-500/20 text-slate-400';
      case 'STANDARD':
        return 'bg-blue-500/20 text-blue-400';
      case 'PREMIUM':
        return 'bg-purple-500/20 text-purple-400';
      case 'ENTERPRISE':
        return 'bg-amber-500/20 text-amber-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{t('admin.subscriptions.title')}</h2>
          <p className="text-slate-400">{t('admin.subscriptions.subtitle')}</p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={loadSubscriptions}
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

      {/* Subscriptions Table */}
      {!isLoading && !error && subscriptions && (
        <>
          {subscriptions.subscriptions.length === 0 ? (
            <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-12 text-center">
              <CreditCard className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-400">{t('admin.subscriptions.noSubscriptions')}</p>
            </div>
          ) : (
            <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-foreground/[0.08]">
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.subscriptions.board')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.subscriptions.owner')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.subscriptions.tier')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.subscriptions.status')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.subscriptions.startDate')}
                    </th>
                    <th className="text-left px-3 py-3 md:px-6 md:py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {t('admin.subscriptions.expiryDate')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.subscriptions.map((subscription) => (
                    <tr
                      key={subscription.id}
                      className="border-b border-foreground/[0.08] last:border-0 hover:bg-foreground/5 transition-colors"
                    >
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
                            <Folder className="h-5 w-5 text-bridge-accent" />
                          </div>
                          <span className="text-foreground font-medium">{subscription.board_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div>
                          <p className="text-foreground">{subscription.owner_name}</p>
                          <p className="text-slate-400 text-sm">{subscription.owner_email}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getTierStyle(
                            subscription.tier
                          )}`}
                        >
                          {subscription.tier}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusStyle(
                            subscription.status
                          )}`}
                        >
                          {subscription.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(subscription.started_at)}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(subscription.expires_at)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {subscriptions.subscriptions.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-sm">
                {t('admin.common.totalItems', { count: subscriptions.total.toLocaleString() })}
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
                  {page + 1} / {Math.ceil(subscriptions.total / subscriptions.size) || 1}
                </span>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(subscriptions.total / subscriptions.size) - 1, page + 1))}
                  disabled={page >= Math.ceil(subscriptions.total / subscriptions.size) - 1}
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
    </div>
  );
}
