import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqKeys = [
  { q: "landing.pricing.faq.q1", a: "landing.pricing.faq.a1" },
  { q: "landing.pricing.faq.q2", a: "landing.pricing.faq.a2" },
  { q: "landing.pricing.faq.q3", a: "landing.pricing.faq.a3" },
  { q: "landing.pricing.faq.q4", a: "landing.pricing.faq.a4" },
  { q: "landing.pricing.faq.q5", a: "landing.pricing.faq.a5" },
];

export const PricingFAQ: React.FC = () => {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="max-w-3xl mx-auto mt-32">
      <h3 className="text-2xl md:text-3xl font-jakarta font-bold text-white text-center mb-12">
        {t("landing.pricing.faq.title")}
      </h3>
      <div className="space-y-3">
        {faqKeys.map((faq, i) => (
          <div
            key={i}
            className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden"
          >
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between px-6 py-5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span className="text-sm font-medium text-white font-inter pr-4">
                {t(faq.q)}
              </span>
              <motion.div
                animate={{ rotate: openIndex === i ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={18} className="text-slate-400 shrink-0" />
              </motion.div>
            </button>
            <AnimatePresence>
              {openIndex === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="px-6 pb-5 text-sm text-slate-400 font-inter font-light leading-relaxed border-t border-white/[0.05] pt-4">
                    {t(faq.a)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
};
