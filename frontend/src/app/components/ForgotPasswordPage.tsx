import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { authService } from '../utils/services';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await authService.forgotPassword(email);
      setIsSent(true);
    } catch (err: any) {
      if (err.code === 'A018') {
        setError('잠시 후 다시 시도해주세요.');
      } else {
        // 보안상 항상 성공 메시지 표시
        setIsSent(true);
      }
    } finally {
      setIsLoading(false);
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
        {!isSent ? (
          <>
            {/* Icon */}
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-[#6366F1] to-[#2DD4BF] rounded-full flex items-center justify-center">
                <Mail className="w-10 h-10 text-white" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-bold text-white text-center mb-4">
              비밀번호를 잊으셨나요?
            </h1>

            {/* Description */}
            <p className="text-slate-400 text-center mb-8 leading-relaxed">
              가입하신 이메일 주소를 입력해주세요.<br />
              비밀번호 재설정 링크를 보내드립니다.
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  이메일
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-white/5 border border-white/20 rounded-xl py-3 px-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                />
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
                disabled={isLoading}
                className="w-full h-14 bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  '재설정 링크 보내기'
                )}
              </button>
            </form>

            {/* Back to Login */}
            <div className="mt-8 text-center">
              <Link
                to="/login"
                className="text-slate-400 hover:text-white transition-colors inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                로그인으로 돌아가기
              </Link>
            </div>
          </>
        ) : (
          <>
            {/* Success State */}
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-white text-center mb-4">
              이메일을 확인해주세요
            </h1>

            <p className="text-slate-400 text-center mb-8 leading-relaxed">
              <span className="text-white font-medium">{email}</span>
              <br />
              위 주소로 비밀번호 재설정 링크를 발송했습니다.
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
                  <p className="text-sm text-slate-300 font-medium mb-1">링크 유효 시간</p>
                  <p className="text-xs text-slate-400">
                    재설정 링크는 1시간 동안 유효합니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Back to Login */}
            <button
              onClick={() => navigate('/login')}
              className="w-full h-14 bg-white/5 border border-white/20 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
              로그인으로 돌아가기
            </button>

            {/* Footer Note */}
            <p className="text-center text-xs text-slate-400 mt-8">
              이메일이 도착하지 않으면 스팸 메일함도 확인해주세요.
            </p>
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
