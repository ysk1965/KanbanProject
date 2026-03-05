import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, RefreshCcw } from "lucide-react";
import { PricingCards } from "./PricingCards";
import { PricingFAQ } from "./PricingFAQ";

export const PricingSection: React.FC = () => {
  const { t } = useTranslation();
  const [isYearly, setIsYearly] = useState(true);

  return (
    <section
      id="pricing"
      className="py-64 bg-bridge-obsidian border-y border-white/15 relative overflow-hidden"
    >
      <div className="container mx-auto px-8 text-center">
        <div className="max-w-5xl mx-auto mb-32">
          {/* Trial Badge */}
          <div className="flex justify-center mb-12">
            <div className="px-10 py-3.5 bg-bridge-secondary/10 border border-bridge-secondary/30 rounded-full flex items-center gap-4 text-bridge-secondary text-[12px] font-black shadow-2xl font-jakarta">
              <Sparkles size={20} />
              <span className="tracking-[0.4em]">
                {t("landing.pricing.trialBadge")}
              </span>
            </div>
          </div>

          {/* Title */}
          <h2 className="font-jakarta text-7xl md:text-[11rem] mb-16 text-white tracking-tighter leading-none font-extrabold">
            {t("landing.pricing.titleLine1")}
            <br />
            {t("landing.pricing.titleLine2")}
            <span className="spot-dot scale-150" />
          </h2>

          {/* Momentum Box */}
          <div className="bg-bridge-obsidian/60 backdrop-blur-3xl rounded-[3rem] p-12 border border-white/20 max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-12">
            <RefreshCcw
              size={48}
              className="text-bridge-secondary animate-spin-slow flex-shrink-0"
            />
            <p className="text-left text-xl leading-relaxed text-slate-300 font-inter font-light">
              <strong className="text-white block mb-3 font-jakarta text-2xl font-bold italic">
                {t("landing.pricing.momentum")}
              </strong>
              {t("landing.pricing.momentumDesc")}
            </p>
          </div>

          {/* Monthly/Yearly Toggle */}
          <div className="flex justify-center mt-16">
            <div className="flex items-center gap-1 bg-white/5 rounded-full p-1.5 border border-white/10">
              <button
                className={`px-8 py-3 rounded-full text-sm font-bold transition-all font-jakarta ${
                  !isYearly
                    ? "bg-bridge-accent text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-300"
                }`}
                onClick={() => setIsYearly(false)}
              >
                {t("landing.pricing.toggle.monthly")}
              </button>
              <button
                className={`px-8 py-3 rounded-full text-sm font-bold transition-all font-jakarta flex items-center gap-2 ${
                  isYearly
                    ? "bg-bridge-accent text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-300"
                }`}
                onClick={() => setIsYearly(true)}
              >
                {t("landing.pricing.toggle.yearly")}
                <span className="text-[10px] font-black text-bridge-secondary bg-bridge-secondary/15 px-2 py-0.5 rounded-full">
                  {t("landing.pricing.toggle.discount", { percent: 17 })}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Cards */}
        <PricingCards isYearly={isYearly} />

        {/* FAQ */}
        <PricingFAQ />
      </div>
    </section>
  );
};
