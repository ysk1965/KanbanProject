import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authService } from '../utils/services';
import { useAuth } from '../contexts/AuthContext';

type VerificationStatus = 'loading' | 'success' | 'error';

export function EmailVerificationResultPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, updateCurrentUser } = useAuth();
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setErrorMessage(t('emailVerificationResult.invalidLink'));
        return;
      }

      try {
        await authService.verifyEmail(token);
        // 로컬 상태의 emailVerified 업데이트
        updateCurrentUser({ email_verified: true });
        setStatus('success');
      } catch (err: any) {
        setStatus('error');
        // 에러 메시지 매핑
        if (err.message?.includes('만료')) {
          setErrorMessage(t('emailVerificationResult.linkExpired'));
        } else if (err.message?.includes('이미 사용')) {
          setErrorMessage(t('emailVerificationResult.linkAlreadyUsed'));
        } else if (err.message?.includes('이미 인증')) {
          setErrorMessage(t('emailVerificationResult.alreadyVerified'));
        } else {
          setErrorMessage(err.message || t('emailVerificationResult.verificationFailed'));
        }
      }
    };

    verifyEmail();
  }, [token, updateCurrentUser]);

  const handleNavigate = () => {
    if (status === 'success' && isAuthenticated) {
      // 이미 로그인된 상태면 바로 boards로
      navigate('/boards');
    } else {
      // 로그인 필요
      navigate('/login');
    }
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
        className="w-full max-w-[500px] bg-bridge-obsidian rounded-[32px] p-8 md:p-12 border border-white/20 shadow-2xl text-center"
      >
        {/* Loading State */}
        {status === 'loading' && (
          <>
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-bridge-accent animate-spin" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">
              {t('emailVerificationResult.verifying')}
            </h1>
            <p className="text-slate-400">{t('common.pleaseWait')}</p>
          </>
        )}

        {/* Success State */}
        {status === 'success' && (
          <>
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
              {t('emailVerificationResult.successTitle')}
            </h1>
            <p className="text-slate-400 mb-8">
              {t('emailVerificationResult.successDesc')}
            </p>
            <button
              onClick={handleNavigate}
              className="w-full h-14 bg-gradient-to-r from-bridge-accent to-indigo-600 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]"
            >
              {isAuthenticated ? t('emailVerificationResult.goToBoards') : t('emailVerificationResult.goToLogin')}
              <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Error State */}
        {status === 'error' && (
          <>
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-500 rounded-full flex items-center justify-center">
                <XCircle className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
              {t('emailVerificationResult.errorTitle')}
            </h1>
            <p className="text-slate-400 mb-8">
              {errorMessage}
            </p>
            <button
              onClick={handleNavigate}
              className="w-full h-14 bg-white/5 border border-white/20 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:bg-white/10"
            >
              {t('emailVerificationResult.goToLoginPage')}
              <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/15">
          <Link to="/" className="text-sm text-slate-400 hover:text-white transition-colors">
            {t('emailVerificationResult.backToHome')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
