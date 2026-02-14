import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useGoogleLogin } from '@react-oauth/google';
import { Mail, Lock, User, Users, ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { trackEvent } from '../contexts/AnalyticsContext';
const HeroScene = lazy(() => import('./landing/BridgeScene').then(m => ({ default: m.HeroScene })));
import { LanguageSwitcher } from './LanguageSwitcher';
import { isGoogleOnlyLogin, isWhiteLabelDomain } from '../utils/domain';

declare const __FE_COMMIT_HASH__: string;
declare const __FE_BUILD_TIME__: string;

interface InviteInfo {
  boardName: string;
  role: string;
  inviterName?: string;
}

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, name: string) => Promise<void>;
  onGoogleLogin?: (code: string) => Promise<void>;
  onBack?: () => void;
  inviteInfo?: InviteInfo | null;
}

export function LoginPage({ onLogin, onSignup, onGoogleLogin, onBack, inviteInfo }: LoginPageProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>(inviteInfo ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const showBackButton = location.state?.from === 'landing' || location.state?.from === 'compare';

  const [beCommit, setBeCommit] = useState<string>('');
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
    const origin = (() => { try { return new URL(apiBase).origin; } catch { return 'http://localhost:8080'; } })();
    fetch(`${origin}/health`).then(r => r.json()).then(d => setBeCommit(d.commit || '')).catch(() => {});
  }, []);

  const googleLogin = useGoogleLogin({
    onSuccess: async (response) => {
      if (response.code && onGoogleLogin) {
        setIsGoogleLoading(true);
        setError('');
        try {
          await onGoogleLogin(response.code);
          trackEvent(mode === 'login' ? 'login' : 'sign_up', { method: 'google' });
        } catch (err: any) {
          setError(err.message || t('auth.googleLoginFailed'));
          trackEvent('error', {
            error_type: 'google_auth_failed',
            error_message: err.message || 'Google login failed'
          });
        } finally {
          setIsGoogleLoading(false);
        }
      }
    },
    onError: () => {
      setError(t('auth.googleLoginFailed'));
      trackEvent('error', {
        error_type: 'google_auth_error',
        error_message: 'Google OAuth error'
      });
    },
    flow: 'auth-code',
  });

  // 비밀번호 검증 규칙
  const passwordValidation = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[@$!%*?&]/.test(password),
  };

  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await onLogin(email, password);
        trackEvent('login', { method: 'email' });
      } else {
        await onSignup(email, password, name);
        trackEvent('sign_up', { method: 'email' });
      }
    } catch (err: any) {
      setError(err.message || t('auth.genericError'));
      trackEvent('error', {
        error_type: mode === 'login' ? 'login_failed' : 'signup_failed',
        error_message: err.message || 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleDisplay = (role: string) => {
    const roleMap: Record<string, string> = {
      ADMIN: t('auth.roleAdmin'),
      MEMBER: t('auth.roleMember'),
      VIEWER: t('auth.roleViewer'),
    };
    return roleMap[role] || role;
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 md:p-8 overflow-hidden select-none text-white">
      {/* 3D Space Background */}
      <div className="absolute inset-0 z-0">
        <Suspense fallback={<div className="absolute inset-0 bg-bridge-dark" />}>
          <HeroScene />
        </Suspense>
        {/* Overlay gradient for form readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0E17]/40 via-[#0A0E17]/60 to-[#0A0E17]/80" />
      </div>

      {/* Back Button - only shown when navigated from landing or compare page */}
      {showBackButton && (
        <button
          onClick={handleBack}
          className="absolute top-4 left-4 md:top-8 md:left-8 flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors text-sm font-medium z-10"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">{t('auth.backToHome')}</span>
        </button>
      )}

      {/* Language Switcher - hidden on white-label domains */}
      {!isWhiteLabelDomain && (
        <div className="absolute top-4 right-4 md:top-8 md:right-8 z-10">
          <LanguageSwitcher variant="compact" />
        </div>
      )}

      {/* Center Auth Form */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[440px] rounded-3xl sm:rounded-[36px] p-6 sm:p-8 md:p-10 relative overflow-hidden z-10"
        style={{
          background: 'linear-gradient(135deg, rgba(13,21,37,0.85) 0%, rgba(6,10,18,0.92) 100%)',
          boxShadow: '0 0 80px rgba(45,212,191,0.06), 0 32px 64px -16px rgba(0,0,0,0.6)',
        }}
      >
        {/* Card border with teal accent */}
        <div
          className="absolute inset-0 rounded-3xl sm:rounded-[36px] pointer-events-none"
          style={{
            border: '1px solid rgba(45,212,191,0.12)',
            background: 'linear-gradient(135deg, rgba(45,212,191,0.03) 0%, transparent 50%, rgba(99,102,241,0.02) 100%)',
          }}
        />

        {/* Corner glow accents */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#2DD4BF] opacity-[0.04] blur-[60px] rounded-full"></div>
        <div className="absolute -bottom-16 -left-16 w-32 h-32 bg-[#6366F1] opacity-[0.05] blur-[50px] rounded-full"></div>

        {/* Invite Banner */}
        {inviteInfo && (
          <div className="bg-gradient-to-r from-bridge-accent/20 to-bridge-secondary/20 border border-bridge-accent/30 rounded-2xl p-4 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-bridge-accent/20 rounded-full flex items-center justify-center">
                <Users className="h-5 w-5 text-bridge-accent" />
              </div>
              <div>
                <p className="text-sm text-bridge-secondary">{t('auth.boardInvite')}</p>
                <p className="text-white font-semibold">{inviteInfo.boardName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">{t('auth.participateRole')}</span>
              <span className="px-2 py-0.5 bg-bridge-accent/20 text-bridge-secondary rounded text-xs">
                {getRoleDisplay(inviteInfo.role)}
              </span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 sm:mb-8 text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}
          </h2>
          <p className="text-slate-500 text-sm">
            {inviteInfo
              ? t('auth.inviteSubtitle')
              : mode === 'login'
              ? t('auth.signInSubtitle')
              : t('auth.signUpSubtitle')}
          </p>
        </div>

        {/* Social Auth Section */}
        <div className="mb-6 sm:mb-8">
          <button
            type="button"
            onClick={() => onGoogleLogin && googleLogin()}
            disabled={!onGoogleLogin || isGoogleLoading}
            className={`flex items-center justify-center gap-3 bg-white/[0.03] border border-white/[0.08] text-white h-[44px] rounded-xl font-semibold w-full transition-all ${
              onGoogleLogin
                ? 'hover:bg-white/[0.06] hover:border-white/[0.15] cursor-pointer active:scale-[0.98]'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            {isGoogleLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
                  className="w-5 h-5"
                  alt="google"
                />
                <span className="text-sm font-semibold">{t('auth.continueWithGoogle')}</span>
              </>
            )}
          </button>
        </div>

        {/* Divider */}
        {!isGoogleOnlyLogin && (
        <div className="relative mb-5 sm:mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/[0.06]"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-[0.2em] text-slate-500">
            <span className="bg-[#0a0f1a] px-4 py-1 rounded-full border border-white/[0.08]">
              {mode === 'login' ? t('auth.secureLogin') : t('auth.createAccount')}
            </span>
          </div>
        </div>
        )}

        {/* Auth Form */}
        {!isGoogleOnlyLogin && (
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {mode === 'signup' && (
            <div className="space-y-2">
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-[#2DD4BF]/80 transition-colors" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('auth.namePlaceholder')}
                  className="w-full bg-white/[0.03] border border-white/[0.08] text-white pl-12 pr-4 h-13 py-3 rounded-xl focus:outline-none focus:border-[#2DD4BF]/40 focus:ring-2 focus:ring-[#2DD4BF]/10 transition-all placeholder:text-slate-600"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-[#2DD4BF] transition-colors" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                className="w-full bg-white/[0.03] border border-white/[0.08] text-white pl-12 pr-4 h-13 py-3 rounded-xl focus:outline-none focus:border-[#2DD4BF]/40 focus:ring-2 focus:ring-[#2DD4BF]/10 transition-all placeholder:text-slate-600"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-[#2DD4BF] transition-colors" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                placeholder={t('auth.passwordPlaceholder')}
                className="w-full bg-white/[0.03] border border-white/[0.08] text-white pl-12 pr-4 h-13 py-3 rounded-xl focus:outline-none focus:border-[#2DD4BF]/40 focus:ring-2 focus:ring-[#2DD4BF]/10 transition-all placeholder:text-slate-600"
                required
                minLength={8}
              />
            </div>
            {/* 비밀번호 요구사항 (회원가입 모드에서만 표시) */}
            {mode === 'signup' && (passwordFocused || password.length > 0) && (
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 space-y-1.5 animate-fade-in">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">{t('auth.passwordRequirements')}</p>
                {[
                  { key: 'minLength', label: t('auth.pwMinLength'), valid: passwordValidation.minLength },
                  { key: 'hasUppercase', label: t('auth.pwUppercase'), valid: passwordValidation.hasUppercase },
                  { key: 'hasLowercase', label: t('auth.pwLowercase'), valid: passwordValidation.hasLowercase },
                  { key: 'hasNumber', label: t('auth.pwNumber'), valid: passwordValidation.hasNumber },
                  { key: 'hasSpecialChar', label: t('auth.pwSpecialChar'), valid: passwordValidation.hasSpecialChar },
                ].map(({ key, label, valid }) => (
                  <div key={key} className="flex items-center gap-2">
                    {valid ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <X className="w-4 h-4 text-slate-400" />
                    )}
                    <span className={`text-sm ${valid ? 'text-emerald-400' : 'text-slate-400'}`}>
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
                  className="text-sm text-slate-500 hover:text-[#2DD4BF]/80 transition-colors"
                >
                  {t('auth.forgotPassword')}
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
                    ? 'bg-[#2DD4BF] border-[#2DD4BF]'
                    : 'border-white/30 group-hover:border-white/50'
                }`}>
                  {agreeToTerms && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm text-slate-500 leading-relaxed">
                <Link to="/terms" className="text-[#2DD4BF]/80 hover:text-[#2DD4BF] transition-colors" target="_blank">
                  {t('auth.termsOfService')}
                </Link>
                {' '}{t('common.and')}{' '}
                <Link to="/privacy" className="text-[#2DD4BF]/80 hover:text-[#2DD4BF] transition-colors" target="_blank">
                  {t('auth.privacyPolicy')}
                </Link>
                {t('auth.agreeToTerms')}
              </span>
            </label>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || isGoogleLoading || (mode === 'signup' && (!agreeToTerms || !isPasswordValid))}
            className="w-full h-13 text-white rounded-xl font-semibold transition-all duration-300 flex items-center justify-center space-x-3 transform active:scale-[0.98] mt-6 group overflow-hidden relative disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-[#2DD4BF]/90 to-[#6366F1]/80 hover:from-[#2DD4BF] hover:to-[#6366F1] shadow-[0_4px_24px_rgba(45,212,191,0.2)]"
          >
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <span className="tracking-tight">
                  {mode === 'login'
                    ? inviteInfo
                      ? t('auth.signInWithInvite')
                      : t('auth.signInToWorkspace')
                    : inviteInfo
                    ? t('auth.signUpWithInvite')
                    : t('auth.getStarted')}
                </span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
        )}

        {/* Mode Toggle */}
        {!isGoogleOnlyLogin && (
        <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-white/[0.05] text-center">
          <p className="text-slate-500 text-sm">
            {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="ml-2 text-[#2DD4BF] font-semibold hover:text-[#2DD4BF]/80 transition-colors"
            >
              {mode === 'login' ? t('auth.signUp') : t('auth.signIn')}
            </button>
          </p>
        </div>
        )}

        {/* Footer Note */}
        {inviteInfo && (
          <p className="text-center text-[11px] text-slate-400 tracking-wide mt-6">
            {t('auth.inviteFooter')}
          </p>
        )}
      </motion.div>

      {/* Version Info */}
      <div className="absolute bottom-3 right-4 text-[10px] text-slate-600 select-none">
        FE: {typeof __FE_COMMIT_HASH__ !== 'undefined' ? __FE_COMMIT_HASH__ : 'dev'}
        {beCommit && <> · BE: {beCommit}</>}
      </div>
    </div>
  );
}
