import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, RefreshCw, LogOut, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function EmailVerificationPendingPage() {
  const { currentUser, logout, resendVerificationEmail } = useAuth();
  const navigate = useNavigate();
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
        setError('잠시 후 다시 시도해주세요.');
        setCooldown(60);
      } else {
        setError(err.message || '이메일 발송에 실패했습니다.');
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
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.07] bg-gradient-to-r from-[#6366F1] to-[#2DD4BF]"
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
          <div className="w-20 h-20 bg-gradient-to-br from-[#6366F1] to-[#2DD4BF] rounded-full flex items-center justify-center">
            <Mail className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl md:text-3xl font-bold text-white text-center mb-4">
          이메일 인증이 필요합니다
        </h1>

        {/* Description */}
        <p className="text-slate-400 text-center mb-8 leading-relaxed">
          <span className="text-white font-medium">{currentUser?.email}</span>
          <br />
          위 주소로 인증 메일을 발송했습니다.
          <br />
          메일함을 확인해주세요.
        </p>

        {/* Info Box */}
        <div className="bg-white/5 border border-white/20 rounded-2xl p-4 mb-8">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-bridge-accent/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm">&#x23F0;</span>
            </div>
            <div>
              <p className="text-sm text-slate-300 font-medium mb-1">인증 링크 유효 시간</p>
              <p className="text-xs text-slate-400">
                인증 링크는 24시간 동안 유효합니다. 시간이 지나면 재발송해주세요.
              </p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {resendSuccess && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-green-400 text-sm">인증 메일이 재발송되었습니다.</p>
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
            {cooldown > 0 ? `재발송 (${cooldown}초)` : '인증 메일 재발송'}
          </button>

          <button
            onClick={handleLogout}
            className="w-full h-12 text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            다른 계정으로 로그인
          </button>
        </div>

        {/* Footer Note */}
        <p className="text-center text-xs text-slate-400 mt-8">
          스팸 메일함도 확인해주세요.
        </p>
      </motion.div>
    </div>
  );
}
