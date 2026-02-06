import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Clock, RefreshCw, Play, StopCircle, Timer } from 'lucide-react';
import { adminService } from '../../utils/services';
import type { MaintenanceStatus } from '../../utils/api';
import { formatDateTime, toDateTimeLocalValue, fromDateTimeLocalValue } from '../../utils/dateUtils';

export function AdminSystemTab() {
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [message, setMessage] = useState('');
  const [estimatedEndAt, setEstimatedEndAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getMaintenanceStatus();
      console.log('🔧 [AdminSystemTab] Maintenance status loaded:', data);
      setMaintenance(data);
      setMessage(data.message || '');
      setEstimatedEndAt(toDateTimeLocalValue(data.estimated_end_at));
    } catch (err) {
      console.error('Failed to load maintenance status:', err);
      setError('점검 상태를 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  // 점검 시작
  const handleStartMaintenance = async () => {
    if (!estimatedEndAt) {
      alert('종료 예정 시간을 설정해주세요');
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
      alert('점검 모드가 시작되었습니다');
    } catch (err) {
      console.error('Failed to start maintenance:', err);
      alert('점검 모드 시작에 실패했습니다');
    } finally {
      setIsSaving(false);
    }
  };

  // 점검 해제
  const handleStopMaintenance = async () => {
    if (!confirm('점검 모드를 즉시 해제하시겠습니까?')) return;
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
      alert('점검 모드가 해제되었습니다');
    } catch (err) {
      console.error('Failed to stop maintenance:', err);
      alert('점검 모드 해제에 실패했습니다');
    } finally {
      setIsSaving(false);
    }
  };

  // 점검 연장
  const handleExtendMaintenance = async () => {
    if (!estimatedEndAt) {
      alert('종료 예정 시간을 설정해주세요');
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
      alert('점검 시간이 변경되었습니다');
    } catch (err) {
      console.error('Failed to extend maintenance:', err);
      alert('점검 시간 변경에 실패했습니다');
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
    if (diff <= 0) return '종료 예정 시간이 지났습니다';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `약 ${hours}시간 ${minutes}분 남음`;
    return `약 ${minutes}분 남음`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button onClick={loadStatus} className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors">
          다시 시도
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
          <h2 className="text-2xl font-bold text-white mb-2">시스템 관리</h2>
          <p className="text-slate-400">점검 모드 및 시스템 설정을 관리하세요</p>
        </div>
        <button
          onClick={loadStatus}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-xl hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          새로고침
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
              {isActive ? '점검 모드 활성' : '정상 운영 중'}
            </p>
            {isActive && maintenance.started_at && (
              <p className="text-sm text-slate-400 mt-1">
                시작: {formatDateTime(maintenance.started_at)}
              </p>
            )}
          </div>
          {isActive && (
            <div className="text-right">
              <p className="text-sm text-red-400 font-medium">{getRemainingTime()}</p>
              <p className="text-xs text-slate-500 mt-1">진행률 {Math.round(progress)}%</p>
            </div>
          )}
        </div>

        {/* Progress Bar (점검 중일 때만) */}
        {isActive && (
          <div className="mt-4">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
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
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-4 md:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Play className="h-5 w-5 text-bridge-accent" />
            <h3 className="text-lg font-bold text-white">점검 시작</h3>
          </div>

          <div className="space-y-5">
            {/* Message */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                점검 안내 메시지 (선택)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all resize-none"
                placeholder="시스템 점검 중입니다. 잠시 후 다시 시도해주세요."
              />
            </div>

            {/* Estimated End Time */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                <Clock className="h-3 w-3 inline mr-1" />
                종료 예정 시간 (필수)
              </label>
              <input
                type="datetime-local"
                value={estimatedEndAt}
                onChange={(e) => setEstimatedEndAt(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartMaintenance}
              disabled={isSaving || !estimatedEndAt}
              className="w-full py-3 rounded-xl font-bold transition-all bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Play className="h-4 w-4" />
              {isSaving ? '시작 중...' : '점검 시작'}
            </button>
          </div>
        </div>
      )}

      {/* 점검 중일 때: 관리 패널 */}
      {isActive && (
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-4 md:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Timer className="h-5 w-5 text-orange-400" />
            <h3 className="text-lg font-bold text-white">점검 관리</h3>
          </div>

          <div className="space-y-5">
            {/* Current Info */}
            <div className="p-4 bg-white/5 rounded-xl space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">시작 시간</span>
                <span className="text-white">
                  {formatDateTime(maintenance.started_at)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">종료 예정</span>
                <span className="text-white">
                  {formatDateTime(maintenance.estimated_end_at)}
                </span>
              </div>
              {maintenance.message && (
                <div className="pt-2 border-t border-white/10">
                  <span className="text-slate-400 text-sm">메시지: </span>
                  <span className="text-white text-sm">{maintenance.message}</span>
                </div>
              )}
            </div>

            {/* Extend Time */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                <Clock className="h-3 w-3 inline mr-1" />
                종료 시간 변경
              </label>
              <input
                type="datetime-local"
                value={estimatedEndAt}
                onChange={(e) => setEstimatedEndAt(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>

            {/* Message Update */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                메시지 수정
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all resize-none"
                placeholder="시스템 점검 중입니다. 잠시 후 다시 시도해주세요."
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
                    : 'bg-white/5 text-slate-500 cursor-not-allowed'
                } disabled:opacity-50`}
              >
                <Timer className="h-4 w-4" />
                {isSaving ? '저장 중...' : '변경 저장'}
              </button>
              <button
                onClick={handleStopMaintenance}
                disabled={isSaving}
                className="py-3 rounded-xl font-bold transition-all bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <StopCircle className="h-4 w-4" />
                {isSaving ? '해제 중...' : '즉시 해제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
