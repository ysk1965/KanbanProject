import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { XCircle, ArrowRight, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const ERROR_MESSAGE_MAP: Record<string, string> = {
  card_declined: 'failedCardDeclined',
  insufficient_funds: 'failedInsufficientFunds',
  expired_card: 'failedCardDeclined',
  processing_error: 'failedDefault',
};

export function PaymentFailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const errorCode = searchParams.get('code') || 'UNKNOWN';
  const errorMessageKey = ERROR_MESSAGE_MAP[errorCode] || 'failedDefault';

  useEffect(() => {
    localStorage.removeItem('pending_checkout_board_id');
  }, []);

  return (
    <div className="min-h-screen bg-bridge-dark flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 max-w-md w-full text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4"
        >
          <XCircle className="w-8 h-8 text-red-400" />
        </motion.div>

        <h2 className="text-xl font-bold text-foreground mb-2">
          {t('payment.failed')}
        </h2>
        <p className="text-slate-400 mb-1">
          {t(`payment.${errorMessageKey}`)}
        </p>
        <p className="text-xs text-slate-600 mb-6">
          {t('payment.errorCode')}: {errorCode}
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
          >
            {t('payment.tryAgain')}
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() =>
              window.open('mailto:support@bridgespots.com', '_blank')
            }
            className="flex items-center justify-center gap-2 px-6 py-3 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            {t('payment.contactSupport')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
