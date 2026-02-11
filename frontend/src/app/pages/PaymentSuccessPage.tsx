import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { subscriptionAPI } from '../utils/api';

type PaymentState = 'processing' | 'success' | 'error';

export function PaymentSuccessPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<PaymentState>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const confirmPayment = async () => {
      const paymentKey = searchParams.get('paymentKey');
      const orderId = searchParams.get('orderId');
      const amount = searchParams.get('amount');
      const type = searchParams.get('type'); // 'subscription' or 'seats'

      if (!paymentKey || !orderId || !amount) {
        setState('error');
        setErrorMessage('Missing payment parameters');
        return;
      }

      try {
        if (type === 'subscription') {
          // Parse orderId: BRIDGE_{boardId}_{MONTHLY|YEARLY}_{seatCount}_{timestamp}
          const parts = orderId.split('_');
          const boardId = parts[1];
          const billingCycle = parts[2] as 'MONTHLY' | 'YEARLY';
          const seatCount = parseInt(parts[3], 10);

          await subscriptionAPI.confirmSubscriptionPayment({
            payment_key: paymentKey,
            order_id: orderId,
            amount: parseInt(amount, 10),
            board_id: boardId,
            billing_cycle: billingCycle,
            seat_count: seatCount,
          });

          setState('success');
          localStorage.removeItem('pending_payment_action');
          setTimeout(() => navigate(`/boards/${boardId}`), 2000);

        } else if (type === 'seats') {
          // Parse orderId: SEATS_{boardId}_{additionalSeats}_{timestamp}
          const parts = orderId.split('_');
          const boardId = parts[1];
          const additionalSeats = parseInt(parts[2], 10);

          await subscriptionAPI.confirmSeatPurchasePayment({
            payment_key: paymentKey,
            order_id: orderId,
            amount: parseInt(amount, 10),
            board_id: boardId,
            additional_seats: additionalSeats,
          });

          setState('success');

          // Restore pending action (invite retry, role change)
          const pendingAction = localStorage.getItem('pending_payment_action');
          if (pendingAction) {
            localStorage.removeItem('pending_payment_action');
            localStorage.setItem('pending_seat_action', pendingAction);
          }

          setTimeout(() => navigate(`/boards/${boardId}`), 2000);

        } else {
          setState('error');
          setErrorMessage('Unknown payment type');
        }
      } catch (error: any) {
        setState('error');
        setErrorMessage(error?.response?.data?.error?.message || error?.message || 'Payment confirmation failed');
      }
    };

    confirmPayment();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
      <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-8 max-w-md w-full text-center">
        {state === 'processing' && (
          <>
            <Loader2 className="h-12 w-12 text-bridge-accent animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              {t('payment.processing', 'Processing payment...')}
            </h2>
            <p className="text-slate-400">
              {t('payment.pleaseWait', 'Please wait while we confirm your payment.')}
            </p>
          </>
        )}
        {state === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-bridge-secondary mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              {t('payment.success', 'Payment Successful!')}
            </h2>
            <p className="text-slate-400">
              {t('payment.redirecting', 'Redirecting to your board...')}
            </p>
          </>
        )}
        {state === 'error' && (
          <>
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              {t('payment.error', 'Payment Error')}
            </h2>
            <p className="text-slate-400 mb-4">{errorMessage}</p>
            <button
              onClick={() => navigate('/boards')}
              className="px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
            >
              {t('payment.goBack', 'Go Back')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
