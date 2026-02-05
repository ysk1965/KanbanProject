import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { authService } from '../utils/services';

type ResetStatus = 'form' | 'loading' | 'success' | 'error';

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ResetStatus>('form');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');

  // 비밀번호 유효성 검사
  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return '비밀번호는 8자 이상이어야 합니다.';
    }
    if (!/[A-Za-z]/.test(password)) {
      return '비밀번호에 영문자를 포함해야 합니다.';
    }
    if (!/[0-9]/.test(password)) {
      return '비밀번호에 숫자를 포함해야 합니다.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError('유효하지 않은 재설정 링크입니다.');
      setStatus('error');
      return;
    }

    // 비밀번호 유효성 검사
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    // 비밀번호 일치 확인
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setStatus('loading');
    setError('');

    try {
      await authService.resetPassword(token, password);
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      if (err.code === 'A015') {
        setError('비밀번호 재설정 링크가 만료되었습니다. 다시 요청해주세요.');
      } else if (err.code === 'A016') {
        setError('유효하지 않은 재설정 링크입니다.');
      } else if (err.code === 'A017') {
        setError('이미 사용된 재설정 링크입니다. 다시 요청해주세요.');
      } else {
        setError(err.message || '비밀번호 재설정에 실패했습니다.');
      }
    }
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
        {/* Loading State */}
        {status === 'loading' && (
          <>
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-bridge-accent animate-spin" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white text-center mb-4">
              비밀번호 변경 중...
            </h1>
            <p className="text-slate-400 text-center">잠시만 기다려주세요.</p>
          </>
        )}

        {/* Form State */}
        {status === 'form' && (
          <>
            {/* Icon */}
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-[#6366F1] to-[#2DD4BF] rounded-full flex items-center justify-center">
                <Lock className="w-10 h-10 text-white" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-bold text-white text-center mb-4">
              새 비밀번호 설정
            </h1>

            {/* Description */}
            <p className="text-slate-400 text-center mb-8 leading-relaxed">
              새로운 비밀번호를 입력해주세요.
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* New Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  새 비밀번호
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8자 이상, 영문+숫자"
                    className="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 pr-12 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  비밀번호 확인
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="비밀번호를 다시 입력해주세요"
                    className="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 pr-12 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full h-14 bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]"
              >
                비밀번호 변경
              </button>
            </form>
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
            <h1 className="text-2xl md:text-3xl font-bold text-white text-center mb-4">
              비밀번호가 변경되었습니다
            </h1>
            <p className="text-slate-400 text-center mb-8">
              새 비밀번호로 로그인해주세요.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full h-14 bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]"
            >
              로그인하기
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
            <h1 className="text-2xl md:text-3xl font-bold text-white text-center mb-4">
              비밀번호 재설정 실패
            </h1>
            <p className="text-slate-400 text-center mb-8">
              {error}
            </p>
            <button
              onClick={() => navigate('/forgot-password')}
              className="w-full h-14 bg-white/5 border border-white/20 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:bg-white/10"
            >
              재설정 다시 요청하기
              <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/15">
          <Link to="/" className="block text-center text-sm text-slate-400 hover:text-white transition-colors">
            BRIDGE SPOTS 홈으로
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
