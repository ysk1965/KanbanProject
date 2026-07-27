import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Eye,
  History,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { adminService } from '../../utils/services';
import type {
  AiKeyList,
  AiKeyStatus,
  AiKeyLogEntry,
  AiKeyProvider,
} from '../../utils/api';
import { formatDateTime, formatRelativeTime } from '../../utils/dateUtils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface AdminAiKeysCardProps {
  onToast: (message: string, type: 'success' | 'error') => void;
}

/**
 * AI API 키 관리 카드.
 *
 * 서버는 키 원문을 절대 내려주지 않는다. 여기서 볼 수 있는 것은 마스킹된 표기,
 * 출처(DB/환경변수), 마지막 변경자·시각, 마지막 검증 시각이다.
 * 입력한 키는 저장 후 다시 읽을 수 없다.
 */
export function AdminAiKeysCard({ onToast }: AdminAiKeysCardProps) {
  const reduceMotion = useReducedMotion();

  const [data, setData] = useState<AiKeyList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<AiKeyLogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isLogsLoading, setIsLogsLoading] = useState(false);

  // 프로바이더별 입력값 / 진행 상태
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [verifyingProvider, setVerifyingProvider] = useState<string | null>(null);

  /**
   * apiClient는 Error 인스턴스가 아니라 ApiError 객체를 그대로 throw한다.
   * `err instanceof Error`로 분기하면 서버가 내려준 메시지를 놓친다.
   */
  const errorMessage = (err: unknown, fallback: string): string => {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    return fallback;
  };

  const loadKeys = useCallback(async () => {
    try {
      setIsLoading(true);
      setData(await adminService.getAiKeys());
    } catch (err) {
      console.error('Failed to load AI keys:', err);
      onToast('AI 키 상태를 불러오지 못했습니다', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [onToast]);

  const loadLogs = useCallback(async () => {
    try {
      setIsLogsLoading(true);
      const result = await adminService.getAiKeyLogs({ page: 0, size: 20 });
      setLogs(result.logs);
    } catch (err) {
      console.error('Failed to load AI key logs:', err);
      onToast('변경 이력을 불러오지 못했습니다', 'error');
    } finally {
      setIsLogsLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleToggleLogs = async () => {
    const next = !showLogs;
    setShowLogs(next);
    if (next && logs.length === 0) {
      await loadLogs();
    }
  };

  const handleRotate = async (provider: AiKeyProvider) => {
    const draft = (drafts[provider] || '').trim();
    if (!draft) {
      onToast('교체할 API 키를 입력해주세요', 'error');
      return;
    }
    try {
      setSavingProvider(provider);
      await adminService.rotateAiKey(provider, draft);
      setDrafts((prev) => ({ ...prev, [provider]: '' }));
      onToast('API 키를 교체했습니다', 'success');
      await Promise.all([loadKeys(), showLogs ? loadLogs() : Promise.resolve()]);
    } catch (err) {
      onToast(errorMessage(err, 'API 키 교체에 실패했습니다'), 'error');
      if (showLogs) await loadLogs();
    } finally {
      setSavingProvider(null);
    }
  };

  const handleVerify = async (provider: AiKeyProvider) => {
    try {
      setVerifyingProvider(provider);
      await adminService.verifyAiKey(provider);
      onToast('키가 정상 동작합니다', 'success');
      await Promise.all([loadKeys(), showLogs ? loadLogs() : Promise.resolve()]);
    } catch (err) {
      onToast(errorMessage(err, '키 검증에 실패했습니다'), 'error');
      if (showLogs) await loadLogs();
    } finally {
      setVerifyingProvider(null);
    }
  };

  const sourceBadge = (key: AiKeyStatus) => {
    if (!key.configured) {
      return (
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-500">
          미설정
        </span>
      );
    }
    if (key.source === 'DATABASE') {
      return (
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
          대시보드 설정
        </span>
      );
    }
    return (
      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
        환경변수
      </span>
    );
  };

  if (isLoading) {
    return (
      <div
        className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex items-center justify-center h-40"
        role="status"
        aria-label="AI 키 상태 로딩 중"
      >
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <KeyRound className="w-5 h-5 text-bridge-accent" />
          <div>
            <h3 className="text-xs md:text-sm font-bold text-foreground">
              AI API 키
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              키 원문은 저장 후 다시 볼 수 없습니다. 교체만 가능합니다.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleLogs}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
          >
            <History className="w-4 h-4" />
            변경 이력
          </button>
          <button
            onClick={loadKeys}
            aria-label="새로고침"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 암호화 키 미설정 경고 — 이게 없으면 저장 자체가 막힌다 */}
      {!data.encryption_configured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
            <span className="font-bold">CONFIG_ENCRYPTION_KEY가 설정되지 않았습니다.</span>{' '}
            키를 암호화해 저장할 수 없어 교체 기능이 비활성화됩니다. 배포 환경변수에
            base64 32바이트 키를 추가한 뒤 다시 시도해주세요.
          </p>
        </div>
      )}

      {/* 프로바이더별 카드 */}
      <div className="space-y-3">
        {data.keys.map((key, index) => {
          const isSaving = savingProvider === key.provider;
          const isVerifying = verifyingProvider === key.provider;
          const busy = isSaving || isVerifying;

          return (
            <motion.div
              key={key.provider}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : index * 0.04 }}
              className="rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] p-4 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs md:text-sm font-bold text-foreground">
                  {key.display_name}
                </span>
                {key.is_active_provider && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    사용 중
                  </span>
                )}
                {sourceBadge(key)}
              </div>

              {/* 현재 상태 */}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
                <div className="flex items-center gap-2">
                  <dt className="text-xs text-slate-500 shrink-0">현재 키</dt>
                  <dd className="text-xs font-medium text-foreground font-mono truncate">
                    {key.masked_key ?? '—'}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="text-xs text-slate-500 shrink-0">마지막 검증</dt>
                  <dd className="text-xs text-slate-400">
                    {key.last_verified_at
                      ? formatRelativeTime(key.last_verified_at)
                      : '없음'}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="text-xs text-slate-500 shrink-0">마지막 변경</dt>
                  <dd className="text-xs text-slate-400">
                    {key.updated_at ? formatDateTime(key.updated_at) : '—'}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="text-xs text-slate-500 shrink-0">변경자</dt>
                  <dd className="text-xs text-slate-400 truncate">
                    {key.updated_by ?? '—'}
                  </dd>
                </div>
              </dl>

              {/* 교체 폼 */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  value={drafts[key.provider] || ''}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [key.provider]: e.target.value }))
                  }
                  placeholder={`새 ${key.display_name} 키 입력`}
                  disabled={busy || !data.encryption_configured}
                  className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-sm text-foreground placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all disabled:opacity-50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRotate(key.provider)}
                    disabled={busy || !data.encryption_configured}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    교체
                  </button>
                  <button
                    onClick={() => handleVerify(key.provider)}
                    disabled={busy || !key.configured}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-medium hover:bg-foreground/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isVerifying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    검증
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-600 mt-2">
                교체 전 실제 프로바이더에 호출해 유효성을 확인합니다. 검증에 실패하면
                저장되지 않습니다.
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* 변경 이력 */}
      {showLogs && (
        <div className="border-t border-foreground/[0.08] pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              변경 이력
            </span>
          </div>

          {isLogsLoading ? (
            <div className="flex justify-center py-6" role="status" aria-label="이력 로딩 중">
              <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              아직 기록된 변경 이력이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    <th className="text-left pb-2 pr-3 font-bold">시각</th>
                    <th className="text-left pb-2 pr-3 font-bold">프로바이더</th>
                    <th className="text-left pb-2 pr-3 font-bold">작업</th>
                    <th className="text-left pb-2 pr-3 font-bold">수행자</th>
                    <th className="text-left pb-2 pr-3 font-bold">키</th>
                    <th className="text-left pb-2 font-bold">결과</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-foreground/[0.06]">
                      <td className="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-400">{log.provider}</td>
                      <td className="py-2 pr-3 text-xs text-slate-400">
                        {log.action === 'ROTATE' ? '교체' : '검증'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-400 truncate max-w-[180px]">
                        {log.actor_email ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-400 font-mono">
                        {log.masked_key ?? '—'}
                      </td>
                      <td className="py-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            log.success
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {log.success ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          {log.detail ?? (log.success ? '성공' : '실패')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
