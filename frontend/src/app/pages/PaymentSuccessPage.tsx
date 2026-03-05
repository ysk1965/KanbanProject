import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Calendar,
  BarChart3,
  MessageSquare,
  Zap,
  Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { subscriptionAPI, SubscriptionResponse } from '../utils/api';
import { formatDate } from '../utils/dateUtils';

type PaymentState = 'processing' | 'success' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 30000;
const REDIRECT_DELAY_S = 5;

const PROCESSING_STEPS = [
  { key: 'processingStep1', delay: 0 },
  { key: 'processingStep2', delay: 3000 },
  { key: 'processingStep3', delay: 8000 },
];

const PREMIUM_FEATURES = [
  { key: 'featureWeeklySchedule', icon: Calendar },
  { key: 'featureMilestone', icon: Sparkles },
  { key: 'featureSlack', icon: MessageSquare },
  { key: 'featureStatistics', icon: BarChart3 },
  { key: 'featureAiCredits', icon: Zap },
];

export function PaymentSuccessPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<PaymentState>('processing');
  const [boardId, setBoardId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [countdown, setCountdown] = useState(REDIRECT_DELAY_S);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const confettiFired = useRef(false);

  const fireConfetti = useCallback(() => {
    if (confettiFired.current) return;
    confettiFired.current = true;
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#6366F1', '#2DD4BF', '#F59E0B'],
    });
  }, []);

  // Step simulation for processing state
  useEffect(() => {
    if (state !== 'processing') return;
    const timers = PROCESSING_STEPS.map((_, i) =>
      setTimeout(() => setActiveStep(i), PROCESSING_STEPS[i].delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [state]);

  // Countdown + redirect for success state
  useEffect(() => {
    if (state !== 'success' || !boardId) return;

    fireConfetti();
    setCountdown(REDIRECT_DELAY_S);

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    redirectTimerRef.current = setTimeout(() => {
      navigate(`/boards/${boardId}`);
    }, REDIRECT_DELAY_S * 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [state, boardId, navigate, fireConfetti]);

  // Main polling logic
  useEffect(() => {
    const queryBoardId = searchParams.get('board_id');
    const storedBoardId = localStorage.getItem('pending_checkout_board_id');
    const resolvedBoardId = queryBoardId || storedBoardId;

    if (!resolvedBoardId) {
      setState('error');
      return;
    }

    setBoardId(resolvedBoardId);
    localStorage.removeItem('pending_checkout_board_id');
    localStorage.removeItem('pending_payment_action');

    const startTime = Date.now();

    const poll = async () => {
      try {
        const sub = await subscriptionAPI.getSubscription(resolvedBoardId);
        if (sub.status === 'ACTIVE') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
          setSubscription(sub);
          setState('success');
        }
      } catch {
        // Keep polling until timeout
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    timeoutTimerRef.current = setTimeout(() => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (Date.now() - startTime >= POLL_MAX_MS) {
        setState('timeout');
      }
    }, POLL_MAX_MS);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    };
  }, [searchParams]);

  const aiCredits = subscription?.seat_count
    ? 200 + subscription.seat_count * 50
    : 350;

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 max-w-md w-full"
      >
        <AnimatePresence mode="wait">
          {/* ── Processing State ── */}
          {state === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Loader2 className="h-12 w-12 text-bridge-accent animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                {t('payment.processing')}
              </h2>
              <p className="text-slate-400 mb-6">{t('payment.pleaseWait')}</p>

              {/* Step Progress */}
              <div className="space-y-3 text-left">
                {PROCESSING_STEPS.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-3">
                    {i < activeStep ? (
                      <CheckCircle className="w-5 h-5 text-bridge-secondary shrink-0" />
                    ) : i === activeStep ? (
                      <Loader2 className="w-5 h-5 text-bridge-accent animate-spin shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-foreground/20 shrink-0" />
                    )}
                    <span
                      className={`text-sm ${i <= activeStep ? 'text-foreground' : 'text-slate-500'}`}
                    >
                      {t(`payment.${step.key}`)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Success State ── */}
          {state === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              {/* Celebration Header */}
              <div className="text-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                  className="w-16 h-16 rounded-full bg-bridge-secondary/15 flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle className="w-8 h-8 text-bridge-secondary" />
                </motion.div>
                <h2 className="text-xl font-bold text-foreground">
                  {t('payment.successTitle')}
                </h2>
                <p className="text-slate-400 mt-1">{t('payment.successDesc')}</p>
              </div>

              {/* Activated Features */}
              <div className="bg-foreground/[0.03] rounded-xl border border-foreground/[0.08] p-4 mb-4 text-left">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                  {t('payment.activatedFeatures')}
                </h3>
                <div className="space-y-2">
                  {PREMIUM_FEATURES.map((feat, i) => (
                    <motion.div
                      key={feat.key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.08 }}
                      className="flex items-center gap-2.5"
                    >
                      <CheckCircle className="w-4 h-4 text-bridge-secondary shrink-0" />
                      <feat.icon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm text-foreground">
                        {t(`payment.${feat.key}`, { credits: aiCredits })}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Subscription Summary */}
              {subscription && (
                <div className="bg-foreground/[0.03] rounded-xl border border-foreground/[0.08] p-4 mb-6 text-left">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    {t('payment.subscriptionSummary')}
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('payment.plan')}</span>
                      <span className="text-foreground font-medium">
                        {subscription.plan || 'Premium'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('payment.seats')}</span>
                      <span className="text-foreground font-medium">
                        {subscription.seat_count}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{t('payment.billing')}</span>
                      <span className="text-foreground font-medium">
                        ${subscription.price}
                        {subscription.billing_cycle === 'YEARLY'
                          ? t('payment.yearly')
                          : t('payment.monthly')}
                      </span>
                    </div>
                    {subscription.next_payment_at && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          {t('payment.nextPayment')}
                        </span>
                        <span className="text-foreground font-medium">
                          {formatDate(subscription.next_payment_at)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CTA + Countdown */}
              <button
                onClick={() => boardId && navigate(`/boards/${boardId}`)}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all mb-3"
              >
                {t('payment.goToBoard')}
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-500 text-center">
                  {t('payment.autoRedirect', { seconds: countdown })}
                </p>
                <div className="h-1 bg-foreground/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-bridge-accent/60 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: REDIRECT_DELAY_S, ease: 'linear' }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Timeout State ── */}
          {state === 'timeout' && (
            <motion.div
              key="timeout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <Clock className="h-12 w-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                {t('payment.stillProcessing')}
              </h2>
              <p className="text-slate-400 mb-1">
                {t('payment.processingDelayDesc')}
              </p>
              <p className="text-slate-400 mb-6">
                {t('payment.willBeAvailable')}
              </p>
              <div className="flex flex-col gap-3">
                {boardId && (
                  <button
                    onClick={() => navigate(`/boards/${boardId}`)}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
                  >
                    {t('payment.goToBoard')}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => window.location.reload()}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl font-medium hover:bg-foreground/10 transition-all"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t('payment.checkStatus')}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Error State ── */}
          {state === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                {t('payment.error')}
              </h2>
              <p className="text-slate-400 mb-4">{t('payment.missingParams')}</p>
              <button
                onClick={() => navigate('/boards')}
                className="px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
              >
                {t('payment.goBack')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
