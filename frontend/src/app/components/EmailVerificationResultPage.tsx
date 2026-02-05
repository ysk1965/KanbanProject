import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { authService } from '../utils/services';
import { useAuth } from '../contexts/AuthContext';

type VerificationStatus = 'loading' | 'success' | 'error';

export function EmailVerificationResultPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, updateCurrentUser } = useAuth();
  const [status, setStatus] = useState<VerificationStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setStatus('error');
        setErrorMessage('유효하지 않은 인증 링크입니다.');
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
          setErrorMessage('인증 링크가 만료되었습니다. 다시 로그인하여 인증 메일을 재발송해주세요.');
        } else if (err.message?.includes('이미 사용')) {
          setErrorMessage('이미 사용된 인증 링크입니다.');
        } else if (err.message?.includes('이미 인증')) {
          setErrorMessage('이미 인증된 이메일입니다.');
        } else {
          setErrorMessage(err.message || '이메일 인증에 실패했습니다.');
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
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.07] bg-gradient-to-r from-[#6366F1] to-[#2DD4BF]"
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
              이메일 인증 중...
            </h1>
            <p className="text-slate-400">잠시만 기다려주세요.</p>
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
              이메일 인증 완료!
            </h1>
            <p className="text-slate-400 mb-8">
              이제 BRIDGE SPOTS의 모든 기능을 사용할 수 있습니다.
            </p>
            <button
              onClick={handleNavigate}
              className="w-full h-14 bg-gradient-to-r from-[#6366F1] to-[#4F46E5] text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]"
            >
              {isAuthenticated ? '보드 목록으로 이동' : '로그인하기'}
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
              인증 실패
            </h1>
            <p className="text-slate-400 mb-8">
              {errorMessage}
            </p>
            <button
              onClick={handleNavigate}
              className="w-full h-14 bg-white/5 border border-white/20 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:bg-white/10"
            >
              로그인 페이지로 이동
              <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-white/15">
          <Link to="/" className="text-sm text-slate-400 hover:text-white transition-colors">
            BRIDGE SPOTS 홈으로
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
