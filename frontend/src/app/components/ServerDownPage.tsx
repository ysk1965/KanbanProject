import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerCrash, WifiOff, RefreshCw, Activity } from 'lucide-react';

interface ServerDownPageProps {
  /** 서버 생존 재확인 (성공하면 가드가 이 페이지를 걷어낸다) */
  onRetry: () => void;
  /** 브라우저가 오프라인이면 서버 장애가 아니라 네트워크 문제로 안내한다 */
  isOffline?: boolean;
  /** 장애 감지 시각 (경과 시간 표시용) */
  since?: number;
}

/** 자동 재시도 주기 — 배포는 보통 1~3분이라 짧게 잡는다 */
const RETRY_INTERVAL_MS = 5000;

export function ServerDownPage({ onRetry, isOffline = false, since }: ServerDownPageProps) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startedAtRef = useRef(since ?? Date.now());

  // 경과 시간
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // 5초마다 자동 재연결 시도
  useEffect(() => {
    const interval = setInterval(onRetry, RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [onRetry]);

  // 네트워크가 돌아오면 즉시 재확인
  useEffect(() => {
    const handleOnline = () => onRetry();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [onRetry]);

  const handleRetry = () => {
    setIsRefreshing(true);
    onRetry();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const elapsedLabel = `${pad(Math.floor(elapsed / 60))}:${pad(elapsed % 60)}`;

  const Icon = isOffline ? WifiOff : ServerCrash;
  const title = isOffline ? t('serverDown.offlineTitle') : t('serverDown.title');
  const subtitle = isOffline ? t('serverDown.offlineSubtitle') : t('serverDown.subtitle');

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] animate-pulse" />
        <div
          className="absolute bottom-1/4 -right-32 w-96 h-96 bg-bridge-accent/15 rounded-full blur-[120px] animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-bridge-accent/5 rounded-full blur-[150px]" />

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
        {/* Icon */}
        <div className="relative inline-flex items-center justify-center mb-10">
          <svg className="w-32 h-32 -rotate-90">
            <circle cx="64" cy="64" r="58" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
            <circle
              cx="64"
              cy="64"
              r="58"
              fill="none"
              stroke="url(#serverDownGradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 58}`}
              /* 재시도 주기에 맞춰 링이 한 바퀴 채워졌다 리셋된다 */
              strokeDashoffset={`${
                2 * Math.PI * 58 * (1 - ((elapsed * 1000) % RETRY_INTERVAL_MS) / RETRY_INTERVAL_MS)
              }`}
              className="transition-all duration-1000 ease-linear"
            />
            <defs>
              <linearGradient id="serverDownGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#6366F1" />
              </linearGradient>
            </defs>
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-bridge-accent/20 backdrop-blur-sm border border-foreground/10 flex items-center justify-center">
              <Icon className="h-9 w-9 text-amber-400" />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">{title}</h1>

        {/* Subtitle */}
        <p className="text-lg text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-slate-500 font-normal mb-8 max-w-md mx-auto">
          {subtitle}
        </p>

        {/* Status Card */}
        <div className="bg-bridge-obsidian/80 backdrop-blur-xl rounded-3xl border border-foreground/10 p-8 mb-8 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex flex-col items-center">
              <div className="bg-gradient-to-b from-white/10 to-white/5 rounded-xl px-6 py-3 border border-foreground/10">
                <span className="text-3xl font-bold text-foreground font-mono">{elapsedLabel}</span>
              </div>
              <span className="text-xs text-slate-500 mt-2 uppercase tracking-wider">
                {t('serverDown.elapsed')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-amber-400/80" />
            <span className="text-slate-400">
              {t('serverDown.statusLabel')}{' '}
              <span className="text-amber-400 font-medium">
                {isOffline ? t('serverDown.statusOffline') : t('serverDown.statusUnreachable')}
              </span>
            </span>
          </div>

          <div className="mt-6 pt-5 border-t border-foreground/[0.08]">
            <p className="text-xs text-slate-500 leading-relaxed">{t('serverDown.hint')}</p>
          </div>
        </div>

        {/* Retry Button */}
        <button
          onClick={handleRetry}
          disabled={isRefreshing}
          className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-amber-500 to-bridge-accent text-white rounded-2xl font-bold text-lg
            hover:shadow-[0_0_40px_rgba(245,158,11,0.3)] hover:scale-105 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <RefreshCw
            className={`h-5 w-5 transition-transform ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`}
          />
          {isRefreshing ? t('serverDown.checking') : t('serverDown.checkNow')}
        </button>

        {/* Auto-retry Notice */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400/60 animate-pulse" />
          <p className="text-slate-500 text-sm">{t('serverDown.autoRefresh')}</p>
        </div>
      </div>
    </div>
  );
}
