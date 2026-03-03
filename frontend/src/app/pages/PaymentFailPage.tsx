import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { XCircle } from 'lucide-react';

export function PaymentFailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const errorCode = searchParams.get('code') || 'UNKNOWN';
  const errorMessage = searchParams.get('message') || t('payment.unknownError', 'An unknown error occurred');

  // Clean up any pending checkout data
  useEffect(() => {
    localStorage.removeItem('pending_checkout_board_id');
  }, []);

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 max-w-md w-full text-center">
        <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">
          {t('payment.failed', 'Payment Failed')}
        </h2>
        <p className="text-slate-400 mb-2">{errorMessage}</p>
        <p className="text-slate-600 text-sm mb-6">
          {t('payment.errorCode', 'Error Code')}: {errorCode}
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
        >
          {t('payment.tryAgain', 'Try Again')}
        </button>
      </div>
    </div>
  );
}
