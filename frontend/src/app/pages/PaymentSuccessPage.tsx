import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { subscriptionAPI } from '../utils/api';

type PaymentState = 'processing' | 'success' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 30000;

export function PaymentSuccessPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<PaymentState>('processing');
  const [boardId, setBoardId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Extract board_id from URL query params or localStorage
    const queryBoardId = searchParams.get('board_id');
    const storedBoardId = localStorage.getItem('pending_checkout_board_id');
    const resolvedBoardId = queryBoardId || storedBoardId;

    if (!resolvedBoardId) {
      setState('error');
      return;
    }

    setBoardId(resolvedBoardId);

    // Clean up any pending payment data
    localStorage.removeItem('pending_checkout_board_id');
    localStorage.removeItem('pending_payment_action');

    // Poll subscription status every 2 seconds for up to 30 seconds
    const startTime = Date.now();

    const poll = async () => {
      try {
        const subscription = await subscriptionAPI.getSubscription(resolvedBoardId);
        if (subscription.status === 'ACTIVE') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
          setState('success');
          setTimeout(() => navigate(`/boards/${resolvedBoardId}`), 2000);
        }
      } catch {
        // Ignore poll errors; keep polling until timeout
      }
    };

    // Start polling immediately
    poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    // Timeout after 30 seconds
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
  }, [searchParams, navigate]);

  const handleManualRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 max-w-md w-full text-center">
        {state === 'processing' && (
          <>
            <Loader2 className="h-12 w-12 text-bridge-accent animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">
              {t('payment.processing', '결제 처리 중...')}
            </h2>
            <p className="text-slate-400">
              {t('payment.pleaseWait', '결제를 확인하는 동안 잠시 기다려 주세요.')}
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-bridge-secondary mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">
              {t('payment.success', '결제 완료!')}
            </h2>
            <p className="text-slate-400">
              {t('payment.redirecting', '보드로 이동합니다...')}
            </p>
          </>
        )}

        {state === 'timeout' && (
          <>
            <AlertCircle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">
              {t('payment.confirmingPayment', '결제 확인 중...')}
            </h2>
            <p className="text-slate-400 mb-6">
              {t('payment.timeoutMessage', '결제가 처리 중입니다. 잠시 후 다시 확인해 주세요.')}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleManualRefresh}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
              >
                <RefreshCw className="h-4 w-4" />
                {t('payment.refresh', '새로고침')}
              </button>
              {boardId && (
                <button
                  onClick={() => navigate(`/boards/${boardId}`)}
                  className="px-6 py-3 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl font-medium hover:bg-foreground/10 transition-all"
                >
                  {t('payment.goToBoard', '보드로 이동')}
                </button>
              )}
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">
              {t('payment.error', '오류가 발생했습니다')}
            </h2>
            <p className="text-slate-400 mb-4">
              {t('payment.missingParams', '결제 정보를 확인할 수 없습니다.')}
            </p>
            <button
              onClick={() => navigate('/boards')}
              className="px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
            >
              {t('payment.goBack', '돌아가기')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
