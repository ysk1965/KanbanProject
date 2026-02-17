import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, RefreshCw, LogOut, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

export function EmailVerificationPendingPage() {
  const { currentUser, logout, resendVerificationEmail } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;

    setIsResending(true);
    setError('');
    setResendSuccess(false);

    try {
      await resendVerificationEmail();
      setResendSuccess(true);
      setCooldown(60); // 60초 쿨다운
    } catch (err: any) {
      if (err.message?.includes('잠시 후')) {
        setError(t('emailVerification.tryAgainLater'));
        setCooldown(60);
      } else {
        setError(err.message || t('emailVerification.sendFailed'));
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 md:p-8 overflow-hidden bg-bridge-dark text-white">
      {/* Background Gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.07] bg-gradient-to-r from-bridge-accent to-bridge-secondary"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[500px] bg-bridge-obsidian rounded-[32px] p-8 md:p-12 border border-white/20 shadow-2xl"
      >
        {/* Icon */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-bridge-accent to-bridge-secondary rounded-full flex items-center justify-center">
            <Mail className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold text-white text-center mb-4">
          {t('emailVerification.title')}
        </h1>

        {/* Description */}
        <p className="text-slate-400 text-center mb-8 leading-relaxed">
          <span className="text-white font-medium">{currentUser?.email}</span>
          <br />
          {t('emailVerification.sentTo')}
          <br />
          {t('emailVerification.checkMailbox')}
        </p>

        {/* Info Box */}
        <div className="bg-white/5 border border-white/20 rounded-2xl p-4 mb-8">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-bridge-accent/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm">&#x23F0;</span>
            </div>
            <div>
              <p className="text-sm text-slate-300 font-medium mb-1">{t('emailVerification.linkValidity')}</p>
              <p className="text-xs text-slate-400">
                {t('emailVerification.linkValidityDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {resendSuccess && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-green-400 text-sm">{t('emailVerification.resendSuccess')}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleResend}
            disabled={isResending || cooldown > 0}
            className="w-full h-14 bg-white/5 border border-white/20 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResending ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5" />
            )}
            {cooldown > 0 ? t('emailVerification.resendCooldown', { seconds: cooldown }) : t('emailVerification.resendEmail')}
          </button>

          <button
            onClick={handleLogout}
            className="w-full h-12 text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            {t('emailVerification.loginOtherAccount')}
          </button>
        </div>

        {/* Footer Note */}
        <p className="text-center text-xs text-slate-400 mt-8">
          {t('emailVerification.checkSpam')}
        </p>
      </motion.div>
    </div>
  );
}
