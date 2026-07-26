import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useGoogleLogin } from "@react-oauth/google";
import {
  Mail,
  Lock,
  User,
  Users,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
} from "lucide-react";
import { trackEvent } from "../contexts/AnalyticsContext";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { isGoogleOnlyLogin, isWhiteLabelDomain } from "../utils/domain";
import { isNative } from "../utils/platform";
import { nativeGoogleLogin } from "../utils/nativeAuth";

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
  onGoogleLoginWithIdToken?: (idToken: string) => Promise<void>;
  onBack?: () => void;
  inviteInfo?: InviteInfo | null;
}

function GoogleLoginButton({
  onGoogleLogin,
  onGoogleLoginWithIdToken,
  mode,
  setError,
}: {
  onGoogleLogin: (code: string) => Promise<void>;
  onGoogleLoginWithIdToken?: (idToken: string) => Promise<void>;
  mode: "login" | "signup";
  setError: (error: string) => void;
}) {
  const { t } = useTranslation();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Native: use Capacitor Google Auth plugin
  const handleNativeGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const { idToken } = await nativeGoogleLogin();
      if (onGoogleLoginWithIdToken) {
        await onGoogleLoginWithIdToken(idToken);
      }
      trackEvent(mode === "login" ? "login" : "sign_up", { method: "google" });
    } catch (err: any) {
      setError(err.message || t("auth.googleLoginFailed"));
      trackEvent("error", {
        error_type: "google_auth_failed",
        error_message: err.message || "Native Google login failed",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Web: use @react-oauth/google popup flow
  const googleLogin = useGoogleLogin({
    onSuccess: async (response: any) => {
      if (response.code) {
        setIsGoogleLoading(true);
        setError("");
        try {
          await onGoogleLogin(response.code);
          trackEvent(mode === "login" ? "login" : "sign_up", {
            method: "google",
          });
        } catch (err: any) {
          setError(err.message || t("auth.googleLoginFailed"));
          trackEvent("error", {
            error_type: "google_auth_failed",
            error_message: err.message || "Google login failed",
          });
        } finally {
          setIsGoogleLoading(false);
        }
      }
    },
    onError: () => {
      setError(t("auth.googleLoginFailed"));
      trackEvent("error", {
        error_type: "google_auth_error",
        error_message: "Google OAuth error",
      });
    },
    flow: "auth-code",
  });

  return (
    <button
      type="button"
      onClick={() => (isNative() ? handleNativeGoogleLogin() : googleLogin())}
      disabled={isGoogleLoading}
      className="flex items-center justify-center gap-3 bg-slate-100 border border-slate-200 text-slate-700 h-[44px] rounded-xl font-bold w-full transition-all hover:bg-slate-200 hover:border-slate-300 cursor-pointer active:scale-[0.98]"
    >
      {isGoogleLoading ? (
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
      ) : (
        <>
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg"
            className="w-5 h-5"
            alt="google"
          />
          <span className="text-sm font-bold">
            {t("auth.continueWithGoogle")}
          </span>
        </>
      )}
    </button>
  );
}

export function LoginPage({
  onLogin,
  onSignup,
  onGoogleLogin,
  onGoogleLoginWithIdToken,
  onBack,
  inviteInfo,
}: LoginPageProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "signup">(
    inviteInfo ? "signup" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const showBackButton =
    location.state?.from === "landing" || location.state?.from === "compare";

  const [beCommit, setBeCommit] = useState<string>("");
  useEffect(() => {
    const apiBase =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";
    const origin = (() => {
      try {
        return new URL(apiBase).origin;
      } catch {
        return "http://localhost:8080";
      }
    })();
    fetch(`${origin}/health`)
      .then((r) => r.json())
      .then((d) => setBeCommit(d.commit || ""))
      .catch(() => {});
  }, []);

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
    setError("");
    setIsLoading(true);

    try {
      if (mode === "login") {
        await onLogin(email, password);
        trackEvent("login", { method: "email" });
      } else {
        await onSignup(email, password, name);
        trackEvent("sign_up", { method: "email" });
      }
    } catch (err: any) {
      setError(err.message || t("auth.genericError"));
      trackEvent("error", {
        error_type: mode === "login" ? "login_failed" : "signup_failed",
        error_message: err.message || "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleDisplay = (role: string) => {
    const roleMap: Record<string, string> = {
      ADMIN: t("auth.roleAdmin"),
      MEMBER: t("auth.roleMember"),
      VIEWER: t("auth.roleViewer"),
    };
    return roleMap[role] || role;
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div
      className="w-full relative flex items-center justify-center p-4 md:p-8 overflow-hidden select-none text-slate-900"
      style={{
        minHeight: "var(--visual-viewport-height, 100vh)",
        background:
          "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)",
      }}
    >
      {/* Soft decorative blobs */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[10%] left-[15%] w-64 h-64 bg-bridge-accent/[0.07] rounded-full blur-[100px]" />
        <div className="absolute bottom-[15%] right-[10%] w-80 h-80 bg-bridge-secondary/[0.07] rounded-full blur-[120px]" />
        <div className="absolute top-[50%] left-[60%] w-48 h-48 bg-purple-400/[0.05] rounded-full blur-[80px]" />
      </div>

      {/* Back Button - only shown when navigated from landing or compare page */}
      {showBackButton && (
        <button
          onClick={handleBack}
          className="absolute top-4 left-4 md:top-8 md:left-8 flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium z-10"
          aria-label="뒤로"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">{t("auth.backToHome")}</span>
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
        className="w-full max-w-[440px] rounded-3xl sm:rounded-[36px] p-6 sm:p-8 md:p-10 relative overflow-hidden z-10 bg-white/80 backdrop-blur-xl border border-white/60"
        style={{
          boxShadow: "0 8px 40px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Icon */}
        <div className="mb-8 sm:mb-10 flex justify-center">
          <img
            src={isWhiteLabelDomain ? "/MilkyWay.png" : "/BridgeSpotsIcon.png"}
            alt={isWhiteLabelDomain ? "Milkyway" : "BRIDGE SPOTS"}
            className="h-16 sm:h-20 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
          />
        </div>

        {/* Invite Banner */}
        {inviteInfo && (
          <div className="bg-gradient-to-r from-bridge-accent/10 to-bridge-secondary/10 border border-bridge-accent/20 rounded-2xl p-4 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-bridge-accent/15 rounded-full flex items-center justify-center">
                <Users className="h-5 w-5 text-bridge-accent" />
              </div>
              <div>
                <p className="text-sm text-bridge-accent">
                  {t("auth.boardInvite")}
                </p>
                <p className="text-slate-800 font-bold">
                  {inviteInfo.boardName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">
                {t("auth.participateRole")}
              </span>
              <span className="px-2 py-0.5 bg-bridge-accent/15 text-bridge-accent rounded text-xs font-medium">
                {getRoleDisplay(inviteInfo.role)}
              </span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 sm:mb-8 text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
            {mode === "login" ? t("auth.welcomeBack") : t("auth.createAccount")}
          </h2>
          <p className="text-slate-400 text-sm">
            {inviteInfo
              ? t("auth.inviteSubtitle")
              : mode === "login"
                ? t("auth.signInSubtitle")
                : t("auth.signUpSubtitle")}
          </p>
        </div>

        {/* Social Auth Section */}
        {(onGoogleLogin || onGoogleLoginWithIdToken) && (
          <div className="mb-6 sm:mb-8">
            <GoogleLoginButton
              onGoogleLogin={onGoogleLogin!}
              onGoogleLoginWithIdToken={onGoogleLoginWithIdToken}
              mode={mode}
              setError={setError}
            />
          </div>
        )}

        {/* Divider */}
        {!isGoogleOnlyLogin && (
          <div className="relative mb-5 sm:mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase font-bold tracking-[0.2em] text-slate-400">
              <span className="bg-white/80 px-4 py-1 rounded-full border border-slate-200">
                {mode === "login"
                  ? t("auth.secureLogin")
                  : t("auth.createAccount")}
              </span>
            </div>
          </div>
        )}

        {/* Auth Form */}
        {!isGoogleOnlyLogin && (
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            {mode === "signup" && (
              <div className="space-y-2">
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-bridge-accent transition-colors" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("auth.namePlaceholder")}
                    className="w-full bg-white border border-slate-200 text-slate-800 pl-12 pr-4 h-13 py-3 rounded-xl focus:outline-none focus:border-bridge-accent/40 focus:ring-2 focus:ring-bridge-accent/50 transition-all placeholder:text-slate-400"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-bridge-accent transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="w-full bg-white border border-slate-200 text-slate-800 pl-12 pr-4 h-13 py-3 rounded-xl focus:outline-none focus:border-bridge-accent/40 focus:ring-2 focus:ring-bridge-accent/50 transition-all placeholder:text-slate-400"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-bridge-accent transition-colors" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  placeholder={t("auth.passwordPlaceholder")}
                  className="w-full bg-white border border-slate-200 text-slate-800 pl-12 pr-4 h-13 py-3 rounded-xl focus:outline-none focus:border-bridge-accent/40 focus:ring-2 focus:ring-bridge-accent/50 transition-all placeholder:text-slate-400"
                  required
                  minLength={8}
                />
              </div>
              {/* 비밀번호 요구사항 (회원가입 모드에서만 표시) */}
              {mode === "signup" &&
                (passwordFocused || password.length > 0) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 animate-fade-in">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      {t("auth.passwordRequirements")}
                    </p>
                    {[
                      {
                        key: "minLength",
                        label: t("auth.pwMinLength"),
                        valid: passwordValidation.minLength,
                      },
                      {
                        key: "hasUppercase",
                        label: t("auth.pwUppercase"),
                        valid: passwordValidation.hasUppercase,
                      },
                      {
                        key: "hasLowercase",
                        label: t("auth.pwLowercase"),
                        valid: passwordValidation.hasLowercase,
                      },
                      {
                        key: "hasNumber",
                        label: t("auth.pwNumber"),
                        valid: passwordValidation.hasNumber,
                      },
                      {
                        key: "hasSpecialChar",
                        label: t("auth.pwSpecialChar"),
                        valid: passwordValidation.hasSpecialChar,
                      },
                    ].map(({ key, label, valid }) => (
                      <div key={key} className="flex items-center gap-2">
                        {valid ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <X className="w-4 h-4 text-slate-300" />
                        )}
                        <span
                          className={`text-sm ${valid ? "text-emerald-600" : "text-slate-400"}`}
                        >
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              {mode === "login" && (
                <div className="text-right">
                  <Link
                    to="/forgot-password"
                    className="text-sm text-slate-400 hover:text-bridge-accent transition-colors"
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
              )}
            </div>

            {/* Terms Agreement Checkbox (Signup only) */}
            {mode === "signup" && (
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${
                      agreeToTerms
                        ? "bg-bridge-accent border-bridge-accent"
                        : "border-slate-300 group-hover:border-slate-400"
                    }`}
                  >
                    {agreeToTerms && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-slate-500 leading-relaxed">
                  <Link
                    to="/terms"
                    className="text-bridge-accent hover:text-bridge-accent/80 transition-colors"
                    target="_blank"
                  >
                    {t("auth.termsOfService")}
                  </Link>{" "}
                  {t("common.and")}{" "}
                  <Link
                    to="/privacy"
                    className="text-bridge-accent hover:text-bridge-accent/80 transition-colors"
                    target="_blank"
                  >
                    {t("auth.privacyPolicy")}
                  </Link>
                  {t("auth.agreeToTerms")}
                </span>
              </label>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                isLoading ||
                (mode === "signup" && (!agreeToTerms || !isPasswordValid))
              }
              className="w-full h-13 text-white rounded-xl font-bold transition-all duration-300 flex items-center justify-center space-x-3 transform active:scale-[0.98] mt-6 group overflow-hidden relative disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-bridge-accent to-bridge-secondary hover:shadow-lg hover:shadow-bridge-accent/20"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="tracking-tight">
                    {mode === "login"
                      ? inviteInfo
                        ? t("auth.signInWithInvite")
                        : t("auth.signInToWorkspace")
                      : inviteInfo
                        ? t("auth.signUpWithInvite")
                        : t("auth.getStarted")}
                  </span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Mode Toggle */}
        {!isGoogleOnlyLogin && (
          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-100 text-center">
            <p className="text-slate-400 text-sm">
              {mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}
              <button
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="ml-2 text-bridge-accent font-medium hover:text-bridge-accent/80 transition-colors"
              >
                {mode === "login" ? t("auth.signUp") : t("auth.signIn")}
              </button>
            </p>
          </div>
        )}

        {/* Footer Note */}
        {inviteInfo && (
          <p className="text-center text-xs text-slate-400 tracking-wide mt-6">
            {t("auth.inviteFooter")}
          </p>
        )}
      </motion.div>

      {/* Version Info */}
      <div className="absolute bottom-3 right-4 text-xs text-slate-400 select-none">
        FE:{" "}
        {typeof __FE_COMMIT_HASH__ !== "undefined" ? __FE_COMMIT_HASH__ : "dev"}
        {beCommit && <> · BE: {beCommit}</>}
      </div>
    </div>
  );
}
