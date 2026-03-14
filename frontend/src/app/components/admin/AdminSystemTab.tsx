import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, AlertTriangle, Clock, RefreshCw, Play, StopCircle, Timer, Loader2, CreditCard } from 'lucide-react';
import { adminService } from '../../utils/services';
import type { MaintenanceStatus } from '../../utils/api';
import { formatDateTime, toDateTimeLocalValue, fromDateTimeLocalValue } from '../../utils/dateUtils';
import { ConfirmModal, Toast } from './AdminConfirmModal';

export function AdminSystemTab() {
  const { t } = useTranslation();
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [message, setMessage] = useState('');
  const [estimatedEndAt, setEstimatedEndAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Monetization state
  const [monetizationEnabled, setMonetizationEnabled] = useState<boolean>(true);
  const [isMonetizationLoading, setIsMonetizationLoading] = useState(true);
  const [isMonetizationSaving, setIsMonetizationSaving] = useState(false);

  useEffect(() => {
    loadStatus();
    loadMonetizationStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const maintenanceData = await adminService.getMaintenanceStatus();
      setMaintenance(maintenanceData);
      setMessage(maintenanceData.message || '');
      setEstimatedEndAt(toDateTimeLocalValue(maintenanceData.estimated_end_at));
    } catch (err) {
      console.error('Failed to load system status:', err);
      setError(t('admin.system.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadMonetizationStatus = async () => {
    try {
      const data = await adminService.getMonetizationStatus();
      setMonetizationEnabled(data.monetization_enabled);
    } catch (err) {
      console.error('Failed to load monetization status:', err);
    } finally {
      setIsMonetizationLoading(false);
    }
  };

  const handleMonetizationToggle = async () => {
    try {
      setIsMonetizationSaving(true);
      const data = await adminService.setMonetizationEnabled(!monetizationEnabled);
      setMonetizationEnabled(data.monetization_enabled);
      setToast({ message: data.monetization_enabled ? 'Monetization enabled' : 'Monetization disabled — all plans upgraded', type: 'success' });
    } catch (err) {
      setToast({ message: 'Failed to update monetization setting', type: 'error' });
    } finally {
      setIsMonetizationSaving(false);
    }
  };

  // 점검 시작
  const handleStartMaintenance = async () => {
    if (!estimatedEndAt) {
      setToast({ message: t('admin.system.setEndTimeAlert'), type: 'error' });
      return;
    }
    try {
      setIsSaving(true);
      const result = await adminService.setMaintenanceMode({
        enabled: true,
        message: message.trim() || undefined,
        estimated_end_at: fromDateTimeLocalValue(estimatedEndAt),
      });
      setMaintenance(result);
      setToast({ message: t('admin.system.maintenanceStarted'), type: 'success' });
    } catch (err) {
      console.error('Failed to start maintenance:', err);
      setToast({ message: t('admin.system.maintenanceStartFailed'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // 점검 해제
  const handleStopConfirm = async () => {
    setShowStopConfirm(false);
    try {
      setIsSaving(true);
      const result = await adminService.setMaintenanceMode({
        enabled: false,
        message: '',
        estimated_end_at: null,
      });
      setMaintenance(result);
      setMessage('');
      setEstimatedEndAt('');
      setToast({ message: t('admin.system.maintenanceStopped'), type: 'success' });
    } catch (err) {
      console.error('Failed to stop maintenance:', err);
      setToast({ message: t('admin.system.maintenanceStopFailed'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // 점검 연장
  const handleExtendMaintenance = async () => {
    if (!estimatedEndAt) {
      setToast({ message: t('admin.system.setEndTimeAlert'), type: 'error' });
      return;
    }
    try {
      setIsSaving(true);
      const result = await adminService.setMaintenanceMode({
        enabled: true,
        message: message.trim() || undefined,
        estimated_end_at: fromDateTimeLocalValue(estimatedEndAt),
      });
      setMaintenance(result);
      setToast({ message: t('admin.system.timeChanged'), type: 'success' });
    } catch (err) {
      console.error('Failed to extend maintenance:', err);
      setToast({ message: t('admin.system.timeChangeFailed'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // 진행률 계산
  const getProgress = () => {
    if (!maintenance?.started_at || !maintenance?.estimated_end_at) return 0;
    const start = new Date(maintenance.started_at).getTime();
    const end = new Date(maintenance.estimated_end_at).getTime();
    const now = Date.now();
    const total = end - start;
    const elapsed = now - start;
    if (total <= 0) return 0;
    return Math.min(Math.max((elapsed / total) * 100, 0), 100);
  };

  // 남은 시간 계산
  const getRemainingTime = () => {
    if (!maintenance?.estimated_end_at) return '';
    const end = new Date(maintenance.estimated_end_at).getTime();
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) return t('admin.system.endTimePassed');
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return t('admin.system.remainingHoursMinutes', { hours, minutes });
    return t('admin.system.remainingMinutes', { minutes });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="로딩 중">
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={loadStatus} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const isActive = maintenance?.enabled;
  const progress = getProgress();

  // 변경사항 확인 (종료 시간 또는 메시지가 변경되었는지)
  const originalEndAt = toDateTimeLocalValue(maintenance?.estimated_end_at);
  const originalMessage = maintenance?.message || '';
  const hasChanges = estimatedEndAt !== originalEndAt || message !== originalMessage;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{t('admin.system.title')}</h2>
          <p className="text-slate-400">{t('admin.system.subtitle')}</p>
        </div>
        <button
          onClick={loadStatus}
          className="flex items-center gap-2 px-4 py-2 bg-foreground/5 border border-foreground/10 text-muted-foreground rounded-xl hover:bg-foreground/10 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          {t('admin.common.refresh')}
        </button>
      </div>

      {/* Current Status */}
      <div className={`rounded-2xl border p-4 md:p-6 ${
        isActive
          ? 'bg-red-500/10 border-red-500/20'
          : 'bg-emerald-500/10 border-emerald-500/20'
      }`}>
        <div className="flex items-center gap-3">
          {isActive ? (
            <AlertTriangle className="h-6 w-6 text-red-400" />
          ) : (
            <Shield className="h-6 w-6 text-emerald-400" />
          )}
          <div className="flex-1">
            <p className={`font-bold text-lg ${isActive ? 'text-red-400' : 'text-emerald-400'}`}>
              {isActive ? t('admin.system.maintenanceActive') : t('admin.system.normalOperation')}
            </p>
            {isActive && maintenance.started_at && (
              <p className="text-sm text-slate-400 mt-1">
                {t('admin.system.startedAt')}: {formatDateTime(maintenance.started_at)}
              </p>
            )}
          </div>
          {isActive && (
            <div className="text-right">
              <p className="text-sm text-red-400 font-medium">{getRemainingTime()}</p>
              <p className="text-xs text-slate-500 mt-1">{t('admin.system.progress')} {Math.round(progress)}%</p>
            </div>
          )}
        </div>

        {/* Progress Bar (점검 중일 때만) */}
        {isActive && (
          <div className="mt-4">
            <div className="h-2 bg-foreground/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 점검 중이 아닐 때: 점검 시작 폼 */}
      {!isActive && (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 md:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Play className="h-5 w-5 text-bridge-accent" />
            <h3 className="text-lg font-bold text-foreground">{t('admin.system.startMaintenance')}</h3>
          </div>

          <div className="space-y-5">
            {/* Message */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                {t('admin.system.maintenanceMessage')}
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all resize-none"
                placeholder={t('admin.system.maintenancePlaceholder')}
              />
            </div>

            {/* Estimated End Time */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                <Clock className="h-3 w-3 inline mr-1" />
                {t('admin.system.estimatedEndTime')}
              </label>
              <input
                type="datetime-local"
                value={estimatedEndAt}
                onChange={(e) => setEstimatedEndAt(e.target.value)}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartMaintenance}
              disabled={isSaving || !estimatedEndAt}
              className="w-full py-3 rounded-xl font-bold transition-all bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Play className="h-4 w-4" />
              {isSaving ? t('admin.system.starting') : t('admin.system.startMaintenance')}
            </button>
          </div>
        </div>
      )}

      {/* 점검 중일 때: 관리 패널 */}
      {isActive && (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 md:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Timer className="h-5 w-5 text-orange-400" />
            <h3 className="text-lg font-bold text-foreground">{t('admin.system.manageMaintenance')}</h3>
          </div>

          <div className="space-y-5">
            {/* Current Info */}
            <div className="p-4 bg-foreground/5 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">{t('admin.system.startTime')}</span>
                <span className="text-foreground">
                  {formatDateTime(maintenance.started_at)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">{t('admin.system.estimatedEnd')}</span>
                <span className="text-foreground">
                  {formatDateTime(maintenance.estimated_end_at)}
                </span>
              </div>
              {maintenance.message && (
                <div className="pt-2 border-t border-foreground/10">
                  <span className="text-slate-400 text-sm">{t('admin.system.messageLabel')}: </span>
                  <span className="text-foreground text-sm">{maintenance.message}</span>
                </div>
              )}
            </div>

            {/* Extend Time */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                <Clock className="h-3 w-3 inline mr-1" />
                {t('admin.system.changeEndTime')}
              </label>
              <input
                type="datetime-local"
                value={estimatedEndAt}
                onChange={(e) => setEstimatedEndAt(e.target.value)}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>

            {/* Message Update */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                {t('admin.system.editMessage')}
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all resize-none"
                placeholder={t('admin.system.maintenancePlaceholder')}
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleExtendMaintenance}
                disabled={isSaving || !hasChanges}
                className={`py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  hasChanges
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-foreground/5 text-slate-500 cursor-not-allowed'
                } disabled:opacity-50`}
              >
                <Timer className="h-4 w-4" />
                {isSaving ? t('admin.system.saving') : t('admin.system.saveChanges')}
              </button>
              <button
                onClick={() => setShowStopConfirm(true)}
                disabled={isSaving}
                className="py-3 rounded-xl font-bold transition-all bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <StopCircle className="h-4 w-4" />
                {isSaving ? t('admin.system.stopping') : t('admin.system.stopNow')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monetization Settings */}
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-bridge-accent/15">
            <CreditCard className="w-5 h-5 text-bridge-accent" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Monetization</h3>
            <p className="text-xs text-slate-500">Control billing and subscription features</p>
          </div>
        </div>

        {isMonetizationLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08]">
              <div>
                <p className="text-sm font-medium text-foreground">Monetization Mode</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {monetizationEnabled ? 'Billing and subscriptions are active' : 'All plans upgraded to premium — billing hidden'}
                </p>
              </div>
              <button
                onClick={handleMonetizationToggle}
                disabled={isMonetizationSaving}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  monetizationEnabled ? 'bg-bridge-accent' : 'bg-slate-600'
                } ${isMonetizationSaving ? 'opacity-50' : ''}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  monetizationEnabled ? 'left-[26px]' : 'left-0.5'
                }`} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08]">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">When OFF</p>
              <ul className="space-y-1.5 text-xs text-slate-500">
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-bridge-accent" />All boards & orgs → top-tier plans</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-bridge-accent" />Existing TRIAL/STANDARD → auto-upgraded</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-bridge-accent" />Billing UI hidden globally</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-bridge-accent" />AI credits unlimited</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">When turned back ON</p>
              <ul className="space-y-1.5 text-xs text-slate-500">
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-500" />Existing PREMIUM boards remain</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-amber-500" />Only new boards start as TRIAL</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showStopConfirm}
        title={t('admin.system.stopMaintenance')}
        message={t('admin.system.confirmStopMaintenance')}
        variant="danger"
        confirmLabel={t('admin.system.stopNow')}
        onConfirm={handleStopConfirm}
        onCancel={() => setShowStopConfirm(false)}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={!!toast}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
