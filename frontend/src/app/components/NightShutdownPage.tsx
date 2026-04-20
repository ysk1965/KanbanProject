import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Clock, RefreshCw, Star } from 'lucide-react';

interface NightShutdownPageProps {
  onRetry: () => void;
}

/** 다음 KST 08:00 시각을 계산 */
const getNextStartupTime = (): Date => {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const kstHour = kstNow.getUTCHours();

  const target = new Date(kstNow);
  target.setUTCHours(8, 0, 0, 0);
  if (kstHour >= 8) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return new Date(target.getTime() - kstOffset);
};

/** KST 23:00 시작 시각 계산 */
const getShutdownStartTime = (): Date => {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const kstHour = kstNow.getUTCHours();

  const target = new Date(kstNow);
  target.setUTCHours(23, 0, 0, 0);
  if (kstHour < 23) {
    target.setUTCDate(target.getUTCDate() - 1);
  }
  return new Date(target.getTime() - kstOffset);
};

export function NightShutdownPage({ onRetry }: NightShutdownPageProps) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [progress, setProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const startTime = getShutdownStartTime();
    const endTime = getNextStartupTime();

    const updateCountdown = () => {
      const now = Date.now();
      const diff = endTime.getTime() - now;

      if (diff <= 0) {
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        setProgress(100);
        onRetry();
        return;
      }

      setCountdown({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });

      const totalDuration = endTime.getTime() - startTime.getTime();
      const elapsed = now - startTime.getTime();
      setProgress(Math.min(Math.max((elapsed / totalDuration) * 100, 0), 99));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [onRetry]);

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

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Night Sky Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-900/30 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-bridge-secondary/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[150px]" />

        {/* Stars */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full animate-pulse"
            style={{
              top: `${15 + i * 13}%`,
              left: `${10 + ((i * 17) % 80)}%`,
              animationDelay: `${i * 0.7}s`,
              animationDuration: `${2 + i * 0.5}s`,
            }}
          />
        ))}

        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      <div className="relative z-10 text-center max-w-lg">
        {/* Moon Icon */}
        <div className="relative inline-flex items-center justify-center mb-10">
          <svg className="w-32 h-32 -rotate-90">
            <circle cx="64" cy="64" r="58" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
            <circle
              cx="64" cy="64" r="58" fill="none"
              stroke="url(#nightGradient)" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 58}`}
              strokeDashoffset={`${2 * Math.PI * 58 * (1 - progress / 100)}`}
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="nightGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#2DD4BF" />
              </linearGradient>
            </defs>
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-bridge-secondary/20 backdrop-blur-sm border border-foreground/10 flex items-center justify-center">
              <Moon className="h-9 w-9 text-bridge-secondary" />
            </div>
          </div>

          <div className="absolute -top-2 -right-2">
            <Star className="h-5 w-5 text-bridge-secondary/60 animate-pulse" />
          </div>
          <div className="absolute -bottom-1 -left-3" style={{ animationDelay: '0.5s' }}>
            <Star className="h-4 w-4 text-indigo-400/60 animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">
          {t('nightShutdown.title')}
        </h1>

        {/* Subtitle */}
        <p className="text-lg text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-slate-500 font-normal mb-8 max-w-md mx-auto">
          {t('nightShutdown.subtitle')}
        </p>

        {/* Countdown */}
        <div className="bg-bridge-obsidian/80 backdrop-blur-xl rounded-3xl border border-foreground/10 p-8 mb-8 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-center gap-3 mb-6">
            {countdown.hours > 0 && (
              <>
                <div className="flex flex-col items-center">
                  <div className="bg-gradient-to-b from-white/10 to-white/5 rounded-xl px-4 py-3 min-w-[72px] border border-foreground/10">
                    <span className="text-3xl font-bold text-foreground font-mono">{pad(countdown.hours)}</span>
                  </div>
                  <span className="text-xs text-slate-500 mt-2 uppercase tracking-wider">{t('nightShutdown.hours')}</span>
                </div>
                <span className="text-2xl text-slate-600 font-normal mb-5">:</span>
              </>
            )}
            <div className="flex flex-col items-center">
              <div className="bg-gradient-to-b from-white/10 to-white/5 rounded-xl px-4 py-3 min-w-[72px] border border-foreground/10">
                <span className="text-3xl font-bold text-white font-mono">{pad(countdown.minutes)}</span>
              </div>
              <span className="text-xs text-slate-500 mt-2 uppercase tracking-wider">{t('nightShutdown.minutes')}</span>
            </div>
            <span className="text-2xl text-slate-600 font-normal mb-5">:</span>
            <div className="flex flex-col items-center">
              <div className="bg-gradient-to-b from-white/10 to-white/5 rounded-xl px-4 py-3 min-w-[72px] border border-foreground/10">
                <span className="text-3xl font-bold text-bridge-secondary font-mono">{pad(countdown.seconds)}</span>
              </div>
              <span className="text-xs text-slate-500 mt-2 uppercase tracking-wider">{t('nightShutdown.seconds')}</span>
            </div>
          </div>

          {/* Resume Time */}
          <div className="flex items-center justify-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-slate-500" />
            <span className="text-slate-400">
              {t('nightShutdown.resumeAt')}{' '}
              <span className="text-foreground font-medium">08:00 KST</span>
            </span>
          </div>

          {/* Schedule Bar */}
          <div className="mt-6 pt-5 border-t border-foreground/[0.08]">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">{t('nightShutdown.schedule')}</p>
            <div className="relative h-6 bg-foreground/5 rounded-full overflow-hidden">
              {/* Active period: 08:00~23:00 = 33.3%~95.8% of day */}
              <div
                className="absolute h-full bg-gradient-to-r from-bridge-accent/30 to-bridge-secondary/30 rounded-full"
                style={{ left: '33.3%', width: '62.5%' }}
              />
              {/* Labels */}
              <span className="absolute left-[33.3%] -translate-x-1/2 top-full mt-1 text-xs text-slate-500">08:00</span>
              <span className="absolute left-[95.8%] -translate-x-1/2 top-full mt-1 text-xs text-slate-500">23:00</span>
              {/* Current time marker */}
              <div
                className="absolute top-0 h-full w-0.5 bg-red-400/80"
                style={{
                  left: `${(() => {
                    const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
                    const kstMin = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCMinutes();
                    return ((kstHour + kstMin / 60) / 24) * 100;
                  })()}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Retry Button */}
        <button
          onClick={handleRetry}
          disabled={isRefreshing}
          className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-bridge-accent to-bridge-secondary text-white rounded-2xl font-bold text-lg
            hover:shadow-[0_0_40px_rgba(45,212,191,0.3)] hover:scale-105 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-5 w-5 transition-transform ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
          {isRefreshing ? t('nightShutdown.checking') : t('nightShutdown.checkNow')}
        </button>

        {/* Auto-refresh */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-bridge-secondary/60 animate-pulse" />
          <p className="text-slate-500 text-sm">{t('nightShutdown.autoRefresh')}</p>
        </div>

        {/* Progress Bar */}
        <div className="mt-10 w-full max-w-xs mx-auto">
          <div className="h-1 bg-foreground/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
