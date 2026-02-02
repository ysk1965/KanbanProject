import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GoogleLogin } from '@react-oauth/google';
import { Mail, Lock, User, Users, ArrowLeft, ArrowRight, Layout, Share2, Zap, BarChart3, Check, X } from 'lucide-react';

interface InviteInfo {
  boardName: string;
  role: string;
  inviterName?: string;
}

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, name: string) => Promise<void>;
  onGoogleLogin?: (idToken: string) => Promise<void>;
  onBack?: () => void;
  inviteInfo?: InviteInfo | null;
}

// Background Elements Component
const BackgroundElements = () => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Interactive Spotlight */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.07] bg-gradient-to-r from-[#6366F1] to-[#2DD4BF] transition-transform duration-300 ease-out"
        style={{
          transform: `translate(${mousePos.x - 300}px, ${mousePos.y - 300}px)`
        }}
      />

      {/* Mesh Gradients */}
      <div
        className="gradient-blur"
        style={{
          top: '-10%',
          left: '-5%',
          backgroundColor: '#6366F1',
          opacity: 0.12
        }}
      />
      <div
        className="gradient-blur"
        style={{
          bottom: '-10%',
          right: '-5%',
          backgroundColor: '#2DD4BF',
          opacity: 0.08
        }}
      />

      {/* Bridge Spots Nodes */}
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-white opacity-20 animate-spot"
          style={{
            top: `${15 + (i * 10)}%`,
            left: `${5 + (i * 12)}%`,
            animationDelay: `${i * 0.5}s`,
            boxShadow: `0 0 10px rgba(255,255,255,0.5)`
          }}
        />
      ))}

      {/* Floating Decorative Elements */}
      <div className="absolute top-[10%] left-[5%] w-64 h-64 border border-white/[0.03] rounded-full animate-float opacity-30"></div>
      <div className="absolute bottom-[5%] right-[10%] w-96 h-96 border border-white/[0.03] rounded-full animate-float opacity-20" style={{ animationDirection: 'reverse', animationDelay: '1s' }}></div>

      {/* Grid Pattern */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 0)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(circle at center, black, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 80%)'
        }}
      />
    </div>
  );
};

// Logo Component
const Logo = ({ className = '' }: { className?: string }) => {
  return (
    <div className={`flex items-center space-x-4 group cursor-default ${className}`}>
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 bg-[#6366F1] blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E293B] to-[#0F172A] rounded-2xl border border-white/10 shadow-2xl overflow-hidden transition-transform duration-500 group-hover:scale-110">
          <div className="absolute inset-0 bg-gradient-to-tr from-[#6366F1]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <svg viewBox="0 0 40 40" className="w-full h-full p-2.5" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M8 24C8 24 14 16 20 16C26 16 32 24 32 24"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="group-hover:stroke-[#2DD4BF] transition-colors duration-500"
            />
            <path d="M14 20V22" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
            <path d="M20 16V22" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
            <path d="M26 20V22" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
            <circle cx="8" cy="24" r="2.5" fill="#6366F1" className="animate-pulse" />
            <circle cx="20" cy="16" r="2.5" fill="#2DD4BF" style={{ animationDelay: '0.5s' }} className="animate-pulse" />
            <circle cx="32" cy="24" r="2.5" fill="#6366F1" style={{ animationDelay: '1s' }} className="animate-pulse" />
          </svg>
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-2xl font-black text-white tracking-tighter leading-none group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all duration-300">
          BRIDGE
        </span>
        <div className="flex items-center mt-1">
          <span className="text-[10px] font-bold text-[#2DD4BF] tracking-[0.3em] uppercase leading-none">
            SPOTS
          </span>
          <div className="w-1 h-1 rounded-full bg-[#2DD4BF] ml-1.5 animate-ping"></div>
        </div>
      </div>
    </div>
  );
};

export function LoginPage({ onLogin, onSignup, onGoogleLogin, onBack, inviteInfo }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>(inviteInfo ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const navigate = useNavigate();

  // 비밀번호 검증 규칙
  const passwordValidation = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[@$!%*?&]/.test(password),
  };

  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        await onSignup(email, password, name);
      }
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleDisplay = (role: string) => {
    const roleMap: Record<string, string> = {
      ADMIN: 'Admin (관리자)',
      MEMBER: 'Member (멤버)',
      VIEWER: 'Observer (읽기 전용)',
    };
    return roleMap[role] || role;
  };

  const handleBack = () => {
    navigate('/');
  };

  const features = [
    { icon: Layout, label: 'Intelligent Kanban', desc: 'Flow naturally' },
    { icon: Share2, label: 'Seamless Bridge', desc: 'No more silos' },
    { icon: Zap, label: 'Real-time Spots', desc: 'Instant updates' },
    { icon: BarChart3, label: 'Advanced Metrics', desc: 'Growth oriented' }
  ];

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 md:p-8 overflow-hidden select-none bg-bridge-dark text-white">
      <BackgroundElements />

      {/* Back Button */}
      <button
        onClick={handleBack}
        className="absolute top-8 left-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium z-10"
      >
        <ArrowLeft size={18} />
        <span>Back to Home</span>
      </button>

      {/* Main Container */}
      <div
        className={`w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-2 gap-12 items-center transition-all duration-1000 transform ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'}`}
      >
        {/* Left Side: Branding */}
        <div className="hidden lg:flex flex-col justify-center space-y-12 pr-8">
          <Logo className="w-fit" />

          <div className="space-y-6">
            <h1 className="text-6xl font-black text-white leading-[1.1] tracking-tight">
              Connect Every <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6366F1] via-[#818CF8] to-[#2DD4BF]">
                Working Spot.
              </span>
            </h1>
            {/* <p className="text-xl text-slate-400 max-w-lg leading-relaxed font-medium">
              협업의 모든 순간을 연결하는 가장 완벽한 브릿지. <br/>
              <span className="text-white">BRIDGE SPOTS</span>는 단순한 도구를 넘어 팀의 리듬을 디자인합니다.
            </p> */}
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature, idx) => (
              <div key={idx} className="login-glass p-5 rounded-[24px] border border-white/5 hover:border-white/20 transition-all duration-500 group cursor-default">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-5 h-5 text-[#2DD4BF]" />
                </div>
                <h4 className="text-white font-bold text-sm mb-1">{feature.label}</h4>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">{feature.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-11 h-11 rounded-full border-2 border-[#0A0E17] bg-slate-800 flex items-center justify-center overflow-hidden ring-4 ring-white/5">
                  <img src={`https://picsum.photos/seed/user-${i+100}/80/80`} alt="Avatar" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            <div className="h-10 w-px bg-white/10"></div>
            <div>
              <p className="text-sm text-slate-400 font-medium">Trusted by leading teams</p>
              <p className="text-xs text-[#2DD4BF] font-bold uppercase tracking-widest mt-0.5">Global standard</p>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Form */}
        <div className="flex justify-center">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="login-glass w-full max-w-[460px] rounded-[40px] p-8 md:p-12 relative overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]"
          >
            {/* Dynamic Border Glow */}
            <div className="absolute inset-0 border border-white/10 rounded-[40px] pointer-events-none"></div>

            {/* Subtle Internal Glow */}
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-[#2DD4BF] opacity-[0.08] blur-[40px] rounded-full animate-pulse"></div>

            {/* Mobile Logo */}
            <div className="lg:hidden mb-10">
              <Logo />
            </div>

            {/* Invite Banner */}
            {inviteInfo && (
              <div className="bg-gradient-to-r from-bridge-accent/20 to-bridge-secondary/20 border border-bridge-accent/30 rounded-2xl p-4 mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-bridge-accent/20 rounded-full flex items-center justify-center">
                    <Users className="h-5 w-5 text-bridge-accent" />
                  </div>
                  <div>
                    <p className="text-sm text-bridge-secondary">보드 초대</p>
                    <p className="text-white font-semibold">{inviteInfo.boardName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-400">참여 역할:</span>
                  <span className="px-2 py-0.5 bg-bridge-accent/20 text-bridge-secondary rounded text-xs">
                    {getRoleDisplay(inviteInfo.role)}
                  </span>
                </div>
              </div>
            )}

            {/* Header */}
            <div className="mb-10 text-center md:text-left space-y-2">
              <div className="inline-flex items-center space-x-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full mb-2">
                <span className="flex h-2 w-2 rounded-full bg-[#2DD4BF]"></span>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Workspace Access</span>
              </div>
              <h2 className="text-4xl font-bold text-white tracking-tight">
                {mode === 'login' ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-slate-400 text-sm font-medium">
                {inviteInfo
                  ? '계정을 만들고 팀에 합류하세요'
                  : mode === 'login'
                  ? 'Access your team bridge and spots.'
                  : 'Start connecting your team today.'}
              </p>
            </div>

            {/* Social Auth Section */}
            <div className="flex justify-center mb-8">
              {onGoogleLogin ? (
                <GoogleLogin
                  onSuccess={async (response) => {
                    if (response.credential) {
                      setIsGoogleLoading(true);
                      setError('');
                      try {
                        await onGoogleLogin(response.credential);
                      } catch (err: any) {
                        setError(err.message || 'Google 로그인에 실패했습니다.');
                      } finally {
                        setIsGoogleLoading(false);
                      }
                    }
                  }}
                  onError={() => {
                    setError('Google 로그인에 실패했습니다.');
                  }}
                  theme="filled_black"
                  text="continue_with"
                  locale="ko"
                  width="400"
                />
              ) : (
                <button
                  type="button"
                  className="flex items-center justify-center space-x-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white h-12 rounded-2xl font-semibold transition-all duration-300 group w-full"
                  disabled
                >
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
                    className="w-5 h-5 group-hover:scale-110 transition-transform"
                    alt="google"
                  />
                  <span className="text-sm">Google 계정으로 계속하기</span>
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="relative mb-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.06]"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">
                <span className="bg-[#0A0E17]/80 backdrop-blur-md px-4 py-1 rounded-full border border-white/5">
                  {mode === 'login' ? 'Secure Login' : 'Create Account'}
                </span>
              </div>
            </div>

            {/* Auth Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-[#2DD4BF] transition-colors" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="이름"
                      className="w-full bg-white/[0.02] border border-white/10 text-white pl-12 pr-4 h-13 py-3 rounded-2xl focus:outline-none focus:border-[#2DD4BF] focus:ring-4 focus:ring-[#2DD4BF]/10 transition-all placeholder:text-slate-600"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-[#6366F1] transition-colors" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full bg-white/[0.02] border border-white/10 text-white pl-12 pr-4 h-13 py-3 rounded-2xl focus:outline-none focus:border-[#6366F1] focus:ring-4 focus:ring-[#6366F1]/10 transition-all placeholder:text-slate-600"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-[#6366F1] transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    placeholder="Password"
                    className="w-full bg-white/[0.02] border border-white/10 text-white pl-12 pr-4 h-13 py-3 rounded-2xl focus:outline-none focus:border-[#6366F1] focus:ring-4 focus:ring-[#6366F1]/10 transition-all placeholder:text-slate-600"
                    required
                    minLength={8}
                  />
                </div>
                {/* 비밀번호 요구사항 (회원가입 모드에서만 표시) */}
                {mode === 'signup' && (passwordFocused || password.length > 0) && (
                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3 space-y-1.5 animate-fade-in">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">비밀번호 요구사항</p>
                    {[
                      { key: 'minLength', label: '8자 이상', valid: passwordValidation.minLength },
                      { key: 'hasUppercase', label: '대문자 포함 (A-Z)', valid: passwordValidation.hasUppercase },
                      { key: 'hasLowercase', label: '소문자 포함 (a-z)', valid: passwordValidation.hasLowercase },
                      { key: 'hasNumber', label: '숫자 포함 (0-9)', valid: passwordValidation.hasNumber },
                      { key: 'hasSpecialChar', label: '특수문자 포함 (@$!%*?&)', valid: passwordValidation.hasSpecialChar },
                    ].map(({ key, label, valid }) => (
                      <div key={key} className="flex items-center gap-2">
                        {valid ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <X className="w-4 h-4 text-slate-500" />
                        )}
                        <span className={`text-sm ${valid ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {mode === 'login' && (
                  <div className="text-right">
                    <Link
                      to="/forgot-password"
                      className="text-sm text-slate-400 hover:text-bridge-accent transition-colors"
                    >
                      비밀번호를 잊으셨나요?
                    </Link>
                  </div>
                )}
              </div>

              {/* Terms Agreement Checkbox (Signup only) */}
              {mode === 'signup' && (
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative mt-0.5">
                    <input
                      type="checkbox"
                      checked={agreeToTerms}
                      onChange={(e) => setAgreeToTerms(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${
                      agreeToTerms
                        ? 'bg-bridge-accent border-bridge-accent'
                        : 'border-white/20 group-hover:border-white/40'
                    }`}>
                      {agreeToTerms && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-slate-400 leading-relaxed">
                    <Link to="/terms" className="text-bridge-accent hover:text-bridge-secondary transition-colors" target="_blank">
                      이용약관
                    </Link>
                    {' '}및{' '}
                    <Link to="/privacy" className="text-bridge-accent hover:text-bridge-secondary transition-colors" target="_blank">
                      개인정보처리방침
                    </Link>
                    에 동의합니다
                  </span>
                </label>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || isGoogleLoading || (mode === 'signup' && (!agreeToTerms || !isPasswordValid))}
                className={`w-full h-14 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center space-x-3 transform active:scale-[0.98] mt-6 group overflow-hidden relative disabled:opacity-50 disabled:cursor-not-allowed ${
                  inviteInfo && mode === 'signup'
                    ? 'bg-gradient-to-r from-[#6366F1] to-[#2DD4BF] shadow-[0_8px_24px_rgba(99,102,241,0.4)]'
                    : 'bg-gradient-to-r from-[#6366F1] to-[#4F46E5] hover:from-[#4F46E5] hover:to-[#4338CA] shadow-[0_8px_24px_rgba(99,102,241,0.4)]'
                }`}
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                {isLoading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="tracking-tight">
                      {mode === 'login'
                        ? inviteInfo
                          ? '로그인하고 보드 참여하기'
                          : 'Sign In to Workspace'
                        : inviteInfo
                        ? '가입하고 보드 참여하기'
                        : 'Get Started for Free'}
                    </span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Mode Toggle */}
            <div className="mt-10 pt-6 border-t border-white/[0.05] text-center">
              <p className="text-slate-500 text-sm font-medium">
                {mode === 'login' ? "Don't have an account?" : 'Already using BRIDGE SPOTS?'}
                <button
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="ml-2 text-white font-bold hover:text-[#2DD4BF] transition-colors"
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>

            {/* Footer Note */}
            <p className="text-center text-[11px] text-slate-600 tracking-wide mt-6">
              {inviteInfo
                ? '초대받은 보드에서 바로 협업을 시작하세요!'
                : ''}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Bottom Decoration */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 hidden md:flex items-center space-x-12 opacity-30">
        <span className="text-[10px] font-black tracking-[0.5em] text-white uppercase">Enterprise Ready</span>
        <span className="text-[10px] font-black tracking-[0.5em] text-white uppercase">ISO Certified</span>
        <span className="text-[10px] font-black tracking-[0.5em] text-white uppercase">GDPR Compliant</span>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-6 right-8 text-right pointer-events-none opacity-40 hidden md:block">
        <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
          BRIDGE SPOTS &copy; 2026 / Version 7.2.4
        </p>
      </footer>
    </div>
  );
}
