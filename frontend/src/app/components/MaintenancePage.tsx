import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Clock, RefreshCw, Sparkles } from 'lucide-react';
import type { MaintenanceStatus } from '../utils/api';
import { formatDate } from '../utils/dateUtils';

interface MaintenancePageProps {
  status: MaintenanceStatus;
  onRetry: () => void;
}

export function MaintenancePage({ status, onRetry }: MaintenancePageProps) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [progress, setProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!status.estimated_end_at) return;

    const updateCountdown = () => {
      const start = status.started_at ? new Date(status.started_at).getTime() : Date.now();
      const end = new Date(status.estimated_end_at!).getTime();
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        setProgress(100);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ hours, minutes, seconds });

      // 진행률 계산: (현재 - 시작) / (종료 - 시작) * 100
      const totalDuration = end - start;
      const elapsed = now - start;
      if (totalDuration > 0) {
        setProgress(Math.min(Math.max((elapsed / totalDuration) * 100, 0), 99));
      } else {
        setProgress(0);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [status.started_at, status.estimated_end_at]);

  // 30초마다 자동 재시도
  useEffect(() => {
    const interval = setInterval(onRetry, 30000);
    return () => clearInterval(interval);
  }, [onRetry]);

  const handleRetry = () => {
    setIsRefreshing(true);
    onRetry();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const formatNumber = (num: number) => String(num).padStart(2, '0');

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient Orbs */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-bridge-accent/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/15 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-bridge-accent/5 rounded-full blur-[150px]" />

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      <div className="relative z-10 text-center max-w-lg">
        {/* Animated Icon Container */}
        <div className="relative inline-flex items-center justify-center mb-10">
          {/* Outer Ring - Progress */}
          <svg className="w-32 h-32 -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="58"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="4"
            />
            <circle
              cx="64"
              cy="64"
              r="58"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 58}`}
              strokeDashoffset={`${2 * Math.PI * 58 * (1 - progress / 100)}`}
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#A855F7" />
              </linearGradient>
            </defs>
          </svg>

          {/* Inner Icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-bridge-accent/20 to-purple-500/20 backdrop-blur-sm border border-foreground/10 flex items-center justify-center">
              <Settings className="h-9 w-9 text-bridge-accent animate-spin" style={{ animationDuration: '8s' }} />
            </div>
          </div>

          {/* Sparkle Effects */}
          <div className="absolute -top-2 -right-2">
            <Sparkles className="h-5 w-5 text-bridge-accent/60 animate-pulse" />
          </div>
          <div className="absolute -bottom-1 -left-3" style={{ animationDelay: '0.5s' }}>
            <Sparkles className="h-4 w-4 text-purple-400/60 animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <h1 className="font-jakarta text-4xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">
          {t('maintenance.title')}
        </h1>

        {/* Subtitle with gradient */}
        <p className="text-lg text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-slate-500 font-normal mb-8 max-w-md mx-auto">
          {status.message || t('maintenance.defaultMessage')}
        </p>

        {/* Countdown Timer */}
        {status.estimated_end_at && (
          <div className="bg-bridge-obsidian/80 backdrop-blur-xl rounded-3xl border border-foreground/10 p-8 mb-8 shadow-2xl shadow-black/20">
            {/* Timer Display */}
            <div className="flex items-center justify-center gap-3 mb-6">
              {countdown.hours > 0 && (
                <>
                  <div className="flex flex-col items-center">
                    <div className="bg-gradient-to-b from-white/10 to-white/5 rounded-xl px-4 py-3 min-w-[72px] border border-foreground/10">
                      <span className="text-3xl font-bold text-foreground font-mono">
                        {formatNumber(countdown.hours)}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 mt-2 uppercase tracking-wider">{t('maintenance.hours')}</span>
                  </div>
                  <span className="text-2xl text-slate-600 font-normal mb-5">:</span>
                </>
              )}
              <div className="flex flex-col items-center">
                <div className="bg-gradient-to-b from-white/10 to-white/5 rounded-xl px-4 py-3 min-w-[72px] border border-foreground/10">
                  <span className="text-3xl font-bold text-white font-mono">
                    {formatNumber(countdown.minutes)}
                  </span>
                </div>
                <span className="text-xs text-slate-500 mt-2 uppercase tracking-wider">{t('maintenance.minutes')}</span>
              </div>
              <span className="text-2xl text-slate-600 font-normal mb-5">:</span>
              <div className="flex flex-col items-center">
                <div className="bg-gradient-to-b from-white/10 to-white/5 rounded-xl px-4 py-3 min-w-[72px] border border-foreground/10">
                  <span className="text-3xl font-bold text-bridge-accent font-mono">
                    {formatNumber(countdown.seconds)}
                  </span>
                </div>
                <span className="text-xs text-slate-500 mt-2 uppercase tracking-wider">{t('maintenance.seconds')}</span>
              </div>
            </div>

            {/* Estimated End Time */}
            <div className="flex items-center justify-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-slate-500" />
              <span className="text-slate-400">
                {t('maintenance.estimatedEnd')}{' '}
                <span className="text-foreground font-medium">
                  {formatDate(status.estimated_end_at, t('maintenance.dateFormat'))}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Retry Button */}
        <button
          onClick={handleRetry}
          disabled={isRefreshing}
          className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-bridge-accent to-purple-500 text-white rounded-2xl font-bold text-lg
            hover:shadow-[0_0_40px_rgba(99,102,241,0.4)] hover:scale-105 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-5 w-5 transition-transform ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
          {isRefreshing ? t('maintenance.checking') : t('maintenance.checkNow')}
        </button>

        {/* Auto-refresh Notice */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500/60 animate-pulse" />
          <p className="text-slate-500 text-sm">{t('maintenance.autoRefresh')}</p>
        </div>

        {/* Progress Bar at Bottom */}
        <div className="mt-10 w-full max-w-xs mx-auto">
          <div className="h-1 bg-foreground/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-bridge-accent to-purple-500 rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-600 mt-2 uppercase tracking-widest">
            {t('maintenance.progress', { percent: Math.round(progress) })}
          </p>
        </div>
      </div>
    </div>
  );
}
