import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CheckCircle, X } from "lucide-react";
import { motion } from "framer-motion";

interface PricingCardsProps {
  isYearly: boolean;
}

export const PricingCards: React.FC<PricingCardsProps> = ({ isYearly }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate("/login", { state: { from: "landing" } });
  };

  const basicFeatures = [
    { key: "landing.pricing.basic.feature1", included: true },
    { key: "landing.pricing.basic.feature2", included: true },
    { key: "landing.pricing.basic.feature3", included: true },
    { key: "landing.pricing.basic.feature4", included: true },
    { key: "landing.pricing.basic.feature5", included: true },
    { key: "landing.pricing.basic.feature6", included: true },
    { key: "landing.pricing.basic.noFeature1", included: false },
    { key: "landing.pricing.basic.noFeature2", included: false },
    { key: "landing.pricing.basic.noFeature3", included: false },
    { key: "landing.pricing.basic.noFeature4", included: false },
  ];

  const premiumFeatures = [
    "landing.pricing.premium.feature1",
    "landing.pricing.premium.feature2",
    "landing.pricing.premium.feature3",
    "landing.pricing.premium.feature4",
    "landing.pricing.premium.feature5",
    "landing.pricing.premium.feature6",
    "landing.pricing.premium.feature7",
  ];

  const orgFeatures = [
    "landing.pricing.organization.feature1",
    "landing.pricing.organization.feature2",
    "landing.pricing.organization.feature3",
    "landing.pricing.organization.feature4",
    "landing.pricing.organization.feature5",
    "landing.pricing.organization.feature6",
    "landing.pricing.organization.feature7",
    "landing.pricing.organization.feature8",
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto items-stretch">
      {/* Basic - Free */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="p-12 bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/20 flex flex-col items-center text-center hover:bg-white/10 transition-all duration-700"
      >
        <span className="text-[12px] font-black text-slate-400 uppercase tracking-[0.6em] mb-10 font-jakarta">
          {t("landing.pricing.basic.name")}
        </span>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-7xl font-jakarta font-extrabold text-white">
            {t("landing.pricing.basic.price")}
          </span>
        </div>
        <p className="text-sm text-slate-500 mb-10 font-inter">
          {t("landing.pricing.basic.tagline")}
        </p>
        <ul className="text-sm space-y-5 text-slate-400 mb-16 text-left w-full border-t border-white/15 pt-10 font-light font-inter">
          {basicFeatures.map((f, i) => (
            <li key={i} className="flex items-center gap-4">
              {f.included ? (
                <CheckCircle
                  size={20}
                  className="text-bridge-secondary/50 shrink-0"
                />
              ) : (
                <X size={20} className="text-slate-600 shrink-0" />
              )}
              <span className={f.included ? "" : "text-slate-600"}>
                {t(f.key)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-auto w-full">
          <button
            onClick={handleGetStarted}
            className="w-full py-7 bg-white/10 border border-white/20 rounded-full text-[12px] font-black uppercase tracking-widest text-white hover:bg-white hover:text-bridge-dark transition-all font-jakarta"
          >
            {t("landing.pricing.basic.cta")}
          </button>
        </div>
      </motion.div>

      {/* Premium - $5 (Highlighted) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="p-12 pt-14 pb-14 bg-bridge-obsidian rounded-[3rem] border-2 border-bridge-secondary/60 shadow-[0_0_160px_rgba(45,212,191,0.25),0_0_60px_rgba(45,212,191,0.15)] flex flex-col items-center text-center transform md:scale-[1.07] relative z-20 transition-all duration-700"
      >
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-bridge-secondary to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bridge-secondary text-bridge-dark px-10 py-3.5 rounded-full text-[11px] font-black tracking-[0.4em] uppercase shadow-[0_0_40px_rgba(45,212,191,0.5)] font-jakarta">
          {t("landing.pricing.premium.recommended")}
        </div>
        <div className="flex items-baseline gap-2 mb-2 mt-2">
          <span className="text-3xl text-bridge-secondary font-jakarta font-bold">
            $
          </span>
          <span className="text-8xl font-jakarta font-extrabold text-white">
            {isYearly ? "4" : "5"}
          </span>
          {isYearly && (
            <span className="text-4xl font-jakarta font-extrabold text-white/60">
              .17
            </span>
          )}
        </div>
        <p className="text-sm text-slate-400 mb-2 font-inter">
          {t("landing.pricing.premium.perUnit")}
        </p>
        {isYearly && (
          <p className="text-[11px] text-bridge-secondary font-bold mb-8 font-jakarta">
            {t("landing.pricing.premium.yearlyNote")}
          </p>
        )}
        {!isYearly && <div className="mb-8" />}
        <p className="text-[11px] font-bold uppercase tracking-widest text-bridge-secondary mb-6 font-jakarta">
          {t("landing.pricing.premium.tagline")}
        </p>
        <ul className="text-sm space-y-5 text-slate-100 mb-16 text-left w-full border-t border-white/20 pt-10 font-medium font-inter">
          {premiumFeatures.map((key, i) => (
            <li
              key={i}
              className={`flex items-center gap-4 ${i === 0 ? "text-bridge-secondary font-bold" : ""}`}
            >
              <CheckCircle
                size={22}
                className={`shrink-0 ${i === 0 ? "" : "text-bridge-secondary"}`}
              />
              {t(key)}
            </li>
          ))}
        </ul>
        <div className="mt-auto w-full space-y-3">
          <button
            onClick={handleGetStarted}
            className="w-full py-8 bg-bridge-secondary text-bridge-dark rounded-full text-[12px] font-black uppercase tracking-widest shadow-[0_0_40px_rgba(45,212,191,0.4)] hover:shadow-[0_0_80px_rgba(45,212,191,0.7)] transition-all transform hover:scale-[1.03] font-jakarta"
          >
            {t("landing.pricing.premium.cta")}
          </button>
          <p className="text-[10px] text-slate-500 font-inter">
            {t("landing.pricing.premium.trialNote")}
          </p>
        </div>
      </motion.div>

      {/* Organization - $15 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="p-12 bg-bridge-obsidian rounded-[3rem] border-2 border-bridge-accent/40 shadow-[0_0_120px_rgba(99,102,241,0.15)] flex flex-col items-center text-center relative z-10 transition-all duration-700"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bridge-accent text-white px-10 py-3.5 rounded-full text-[11px] font-black tracking-[0.4em] uppercase shadow-2xl font-jakarta">
          {t("landing.pricing.organization.name")}
        </div>
        <div className="flex items-baseline gap-2 mb-2 mt-2">
          <span className="text-3xl text-bridge-accent font-jakarta font-bold">
            $
          </span>
          <span className="text-8xl font-jakarta font-extrabold text-white">
            {isYearly ? "12" : "15"}
          </span>
          {isYearly && (
            <span className="text-4xl font-jakarta font-extrabold text-white/60">
              .50
            </span>
          )}
        </div>
        <p className="text-sm text-slate-400 mb-2 font-inter">
          {t("landing.pricing.organization.perUnit")}
        </p>
        {isYearly && (
          <p className="text-[11px] text-bridge-accent font-bold mb-8 font-jakarta">
            {t("landing.pricing.organization.yearlyNote")}
          </p>
        )}
        {!isYearly && <div className="mb-8" />}
        <p className="text-[11px] font-bold uppercase tracking-widest text-bridge-accent mb-6 font-jakarta">
          {t("landing.pricing.organization.includes")}
        </p>
        <ul className="text-sm space-y-5 text-slate-100 mb-16 text-left w-full border-t border-bridge-accent/20 pt-10 font-medium font-inter">
          {orgFeatures.map((key, i) => (
            <li
              key={i}
              className={`flex items-center gap-4 ${i === 0 ? "text-bridge-accent font-bold" : ""}`}
            >
              <CheckCircle
                size={22}
                className={`shrink-0 ${i === 0 ? "" : "text-bridge-accent"}`}
              />
              {t(key)}
            </li>
          ))}
        </ul>
        <div className="mt-auto w-full space-y-3">
          <button
            onClick={handleGetStarted}
            className="w-full py-8 bg-bridge-accent text-white rounded-full text-[12px] font-black uppercase tracking-widest shadow-2xl hover:shadow-[0_0_80px_rgba(99,102,241,0.7)] transition-all transform hover:scale-[1.03] font-jakarta"
          >
            {t("landing.pricing.organization.cta")}
          </button>
          <p className="text-[10px] text-slate-500 font-inter">
            {t("landing.pricing.organization.bestFor")}
          </p>
        </div>
      </motion.div>
    </div>
  );
};
