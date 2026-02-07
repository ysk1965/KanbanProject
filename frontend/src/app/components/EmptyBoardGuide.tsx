import { motion } from 'framer-motion';
import { Layers, ListTodo, CheckSquare, Plus, ArrowRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface EmptyBoardGuideProps {
  onCreateFeature: () => void;
}

const steps = [
  {
    number: 1,
    icon: Layers,
    titleKey: 'emptyBoard.step1Title',
    descriptionKey: 'emptyBoard.step1Desc',
    iconBg: 'bg-indigo-500/10',
    iconColor: 'text-indigo-400',
    borderHover: 'hover:border-indigo-500/30',
  },
  {
    number: 2,
    icon: ListTodo,
    titleKey: 'emptyBoard.step2Title',
    descriptionKey: 'emptyBoard.step2Desc',
    iconBg: 'bg-teal-500/10',
    iconColor: 'text-teal-400',
    borderHover: 'hover:border-teal-500/30',
  },
  {
    number: 3,
    icon: CheckSquare,
    titleKey: 'emptyBoard.step3Title',
    descriptionKey: 'emptyBoard.step3Desc',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
    borderHover: 'hover:border-purple-500/30',
  },
];

export function EmptyBoardGuide({ onCreateFeature }: EmptyBoardGuideProps) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      {/* 헤딩 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-bridge-accent/10 border border-bridge-accent/20 flex items-center justify-center mb-6">
          <Sparkles className="h-7 w-7 text-bridge-accent" />
        </div>
        <h2 className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-3">
          {t('emptyBoard.heading')}
        </h2>
        <p className="text-slate-400 font-light text-sm md:text-base max-w-md text-center leading-relaxed">
          {t('emptyBoard.subheading')}
        </p>
      </motion.div>

      {/* 스텝 카드 */}
      <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 mt-12">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center gap-4 md:gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + index * 0.15, duration: 0.5 }}
              className={`w-64 bg-kanban-card rounded-2xl border border-kanban-border p-6 transition-all ${step.borderHover}`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${step.iconBg}`}>
                  <step.icon className={`h-5 w-5 ${step.iconColor}`} />
                </div>
                <span className="text-[10px] tracking-[0.3em] uppercase text-zinc-600 font-bold">
                  Step {step.number}
                </span>
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">{t(step.titleKey)}</h3>
              <p className="text-xs text-slate-400 font-light leading-relaxed">{t(step.descriptionKey)}</p>
            </motion.div>

            {index < steps.length - 1 && (
              <ArrowRight className="hidden md:block h-5 w-5 text-zinc-600 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* CTA 버튼 */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        onClick={onCreateFeature}
        className="mt-10 px-8 py-3.5 bg-bridge-accent text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
      >
        <Plus className="h-4 w-4" />
        {t('emptyBoard.createFirstFeature')}
      </motion.button>
    </div>
  );
}
