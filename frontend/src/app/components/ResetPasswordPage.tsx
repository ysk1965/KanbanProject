import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { authService } from "../utils/services";

type ResetStatus = "form" | "loading" | "success" | "error";

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [status, setStatus] = useState<ResetStatus>("form");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");

  // 비밀번호 유효성 검사
  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return t("resetPassword.pwMinLength");
    }
    if (!/[A-Za-z]/.test(password)) {
      return t("resetPassword.pwNeedLetter");
    }
    if (!/[0-9]/.test(password)) {
      return t("resetPassword.pwNeedNumber");
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setError(t("resetPassword.invalidLink"));
      setStatus("error");
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
      setError(t("resetPassword.passwordMismatch"));
      return;
    }

    setStatus("loading");
    setError("");

    try {
      await authService.resetPassword(token, password);
      setStatus("success");
    } catch (err: any) {
      setStatus("error");
      if (err.code === "A015") {
        setError(t("resetPassword.linkExpired"));
      } else if (err.code === "A016") {
        setError(t("resetPassword.invalidLink"));
      } else if (err.code === "A017") {
        setError(t("resetPassword.linkAlreadyUsed"));
      } else {
        setError(err.message || t("resetPassword.resetFailed"));
      }
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 md:p-8 overflow-hidden bg-bridge-dark text-foreground">
      {/* Background Gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-[0.07] bg-gradient-to-r from-bridge-accent to-bridge-secondary"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[500px] bg-bridge-obsidian rounded-[32px] p-8 md:p-12 border border-bridge-border shadow-2xl"
      >
        {/* Loading State */}
        {status === "loading" && (
          <>
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-foreground/5 rounded-full flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-bridge-accent animate-spin" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground text-center mb-4">
              {t("resetPassword.changing")}
            </h1>
            <p className="text-slate-400 text-center">
              {t("common.pleaseWait")}
            </p>
          </>
        )}

        {/* Form State */}
        {status === "form" && (
          <>
            {/* Icon */}
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-bridge-accent to-bridge-secondary rounded-full flex items-center justify-center">
                <Lock className="w-10 h-10 text-white" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-4">
              {t("resetPassword.title")}
            </h1>

            {/* Description */}
            <p className="text-slate-400 text-center mb-8 leading-relaxed">
              {t("resetPassword.description")}
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {t("resetPassword.newPassword")}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("resetPassword.passwordPlaceholder")}
                    className="w-full bg-foreground/5 border border-bridge-border rounded-xl py-3 px-4 pr-12 text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  {t("resetPassword.confirmPassword")}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("resetPassword.confirmPlaceholder")}
                    className="w-full bg-foreground/5 border border-bridge-border rounded-xl py-3 px-4 pr-12 text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-slate-400 hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
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
                className="w-full h-14 bg-gradient-to-r from-bridge-accent to-indigo-600 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]"
              >
                {t("resetPassword.changePassword")}
              </button>
            </form>
          </>
        )}

        {/* Success State */}
        {status === "success" && (
          <>
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-4">
              {t("resetPassword.successTitle")}
            </h1>
            <p className="text-slate-400 text-center mb-8">
              {t("resetPassword.successDesc")}
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full h-14 bg-gradient-to-r from-bridge-accent to-indigo-600 text-white rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)]"
            >
              {t("resetPassword.goToLogin")}
              <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Error State */}
        {status === "error" && (
          <>
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-500 rounded-full flex items-center justify-center">
                <XCircle className="w-10 h-10 text-white" />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-4">
              {t("resetPassword.errorTitle")}
            </h1>
            <p className="text-slate-400 text-center mb-8">{error}</p>
            <button
              onClick={() => navigate("/forgot-password")}
              className="w-full h-14 bg-foreground/5 border border-bridge-border text-foreground rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 hover:bg-foreground/10"
            >
              {t("resetPassword.requestAgain")}
              <ArrowRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-bridge-border">
          <Link
            to="/"
            className="block text-center text-sm text-slate-400 hover:text-foreground transition-colors"
          >
            {t("resetPassword.backToHome")}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
