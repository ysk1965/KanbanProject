import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  CalendarDays,
  Video,
  FileText,
  BarChart3,
  MessageSquare,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  GripVertical,
  Users,
  Zap,
} from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FeatureItem {
  id: string;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
  color: string;
  bgColor: string;
}

const FEATURES: FeatureItem[] = [
  {
    id: 'kanban',
    icon: <LayoutDashboard size={20} />,
    labelKey: 'onboarding.features.kanban',
    descKey: 'onboarding.features.kanbanDesc',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/15',
  },
  {
    id: 'schedule',
    icon: <CalendarDays size={20} />,
    labelKey: 'onboarding.features.schedule',
    descKey: 'onboarding.features.scheduleDesc',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/15',
  },
  {
    id: 'meeting',
    icon: <Video size={20} />,
    labelKey: 'onboarding.features.meeting',
    descKey: 'onboarding.features.meetingDesc',
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/15',
  },
  {
    id: 'notes',
    icon: <FileText size={20} />,
    labelKey: 'onboarding.features.notes',
    descKey: 'onboarding.features.notesDesc',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
  },
  {
    id: 'ai',
    icon: <BarChart3 size={20} />,
    labelKey: 'onboarding.features.ai',
    descKey: 'onboarding.features.aiDesc',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/15',
  },
  {
    id: 'slack',
    icon: <MessageSquare size={20} />,
    labelKey: 'onboarding.features.slack',
    descKey: 'onboarding.features.slackDesc',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/15',
  },
];

// Mini kanban board illustration
function KanbanIllustration() {
  const columns = [
    { label: 'To Do', cards: ['bg-indigo-500/60', 'bg-teal-500/50'] },
    { label: 'In Progress', cards: ['bg-amber-500/50', 'bg-rose-500/50', 'bg-indigo-500/40'] },
    { label: 'Done', cards: ['bg-emerald-500/50'] },
  ];

  return (
    <div className="w-full max-w-[340px] mx-auto">
      <div className="bg-white/[0.04] rounded-2xl border border-white/[0.08] p-4 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-bridge-secondary/60" />
          <div className="h-2.5 w-24 bg-foreground/10 rounded-full" />
          <div className="ml-auto flex gap-1">
            <div className="w-2 h-2 rounded-full bg-foreground/10" />
            <div className="w-2 h-2 rounded-full bg-foreground/10" />
          </div>
        </div>
        {/* Columns */}
        <div className="flex gap-2.5">
          {columns.map((col, ci) => (
            <motion.div
              key={col.label}
              className="flex-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + ci * 0.12, duration: 0.5 }}
            >
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                {col.label}
              </div>
              <div className="space-y-1.5">
                {col.cards.map((color, i) => (
                  <motion.div
                    key={i}
                    className={`h-8 ${color} rounded-lg border border-white/[0.06]`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 + ci * 0.12 + i * 0.08, duration: 0.3 }}
                  >
                    <div className="flex items-center gap-1.5 h-full px-2">
                      <GripVertical size={8} className="text-white/30" />
                      <div className="h-1.5 w-full bg-white/20 rounded-full" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Schedule/Calendar illustration
function ScheduleIllustration() {
  const days = ['M', 'T', 'W', 'T', 'F'];
  const rows = [
    { name: '', bars: [{ col: 0, span: 2, color: 'bg-indigo-500/50' }] },
    { name: '', bars: [{ col: 1, span: 3, color: 'bg-teal-500/50' }] },
    { name: '', bars: [{ col: 0, span: 1, color: 'bg-rose-500/40' }, { col: 2, span: 2, color: 'bg-amber-500/40' }] },
  ];

  return (
    <div className="w-full max-w-[340px] mx-auto">
      <div className="bg-white/[0.04] rounded-2xl border border-white/[0.08] p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={14} className="text-teal-400/60" />
          <div className="h-2.5 w-20 bg-foreground/10 rounded-full" />
        </div>
        {/* Day headers */}
        <div className="flex gap-1 mb-3 pl-8">
          {days.map((d) => (
            <div key={d} className="flex-1 text-center text-xs font-bold text-slate-500">
              {d}
            </div>
          ))}
        </div>
        {/* Gantt rows */}
        <div className="space-y-2">
          {rows.map((row, ri) => (
            <motion.div
              key={ri}
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + ri * 0.15, duration: 0.4 }}
            >
              <div className="w-6 h-6 rounded-full bg-white/[0.06] border border-white/[0.08]" />
              <div className="flex-1 flex gap-1 relative h-6">
                {row.bars.map((bar, bi) => (
                  <motion.div
                    key={bi}
                    className={`absolute h-full ${bar.color} rounded-md`}
                    style={{
                      left: `${(bar.col / 5) * 100}%`,
                      width: `${(bar.span / 5) * 100}%`,
                    }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.6 + ri * 0.15 + bi * 0.1, duration: 0.4, ease: 'easeOut' }}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// AI Analysis illustration
function AIIllustration() {
  const bars = [65, 85, 45, 70, 90];

  return (
    <div className="w-full max-w-[340px] mx-auto">
      <div className="bg-white/[0.04] rounded-2xl border border-white/[0.08] p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} className="text-purple-400/60" />
          <div className="h-2.5 w-24 bg-foreground/10 rounded-full" />
        </div>
        {/* Chart area */}
        <div className="flex items-end gap-3 h-28 px-2">
          {bars.map((height, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-t-lg bg-gradient-to-t from-bridge-accent/40 to-bridge-secondary/30"
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.6, ease: 'easeOut' }}
            />
          ))}
        </div>
        {/* Summary line */}
        <div className="mt-3 flex items-center gap-2">
          <div className="h-2 flex-1 bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-bridge-secondary/60 to-bridge-accent/60 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: '72%' }}
              transition={{ delay: 1, duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <span className="text-xs text-slate-500 font-bold">72%</span>
        </div>
      </div>
    </div>
  );
}

const STEP_ILLUSTRATIONS = [
  <KanbanIllustration key="kanban" />,
  <ScheduleIllustration key="schedule" />,
  <AIIllustration key="ai" />,
];

export function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
  const totalSteps = 3;

  const handleNext = useCallback(() => {
    if (step < totalSteps - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      handleComplete();
    }
  }, [step]);

  const handleComplete = useCallback(() => {
    localStorage.removeItem('bridge_show_onboarding');
    onClose();
  }, [onClose]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  if (!isOpen) return null;

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -60 : 60,
      opacity: 0,
    }),
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleSkip}
        />

        {/* Modal Container */}
        <motion.div
          className="relative w-full max-w-[900px] h-[520px] md:h-[540px] rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: 'linear-gradient(135deg, rgba(15,20,25,0.98) 0%, rgba(10,14,23,0.99) 100%)',
          }}
        >
          {/* Background decoration */}
          <div className="absolute -top-32 -right-32 w-64 h-64 bg-bridge-secondary opacity-[0.04] blur-[100px] rounded-full pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-bridge-accent opacity-[0.05] blur-[80px] rounded-full pointer-events-none" />

          <div className="flex h-full">
            {/* Left Side - Illustration */}
            <div className="hidden md:flex w-[45%] relative items-center justify-center p-8 overflow-hidden">
              {/* Gradient background */}
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(160deg, rgba(45,212,191,0.04) 0%, rgba(99,102,241,0.06) 50%, rgba(45,212,191,0.03) 100%)',
                }}
              />
              <div className="absolute inset-0 border-r border-white/[0.04]" />

              {/* Floating dots */}
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-bridge-secondary/30"
                  style={{
                    top: `${20 + i * 12}%`,
                    left: `${10 + (i % 3) * 30}%`,
                  }}
                  animate={{
                    opacity: [0.2, 0.6, 0.2],
                    scale: [1, 1.5, 1],
                  }}
                  transition={{
                    duration: 3 + i * 0.5,
                    repeat: Infinity,
                    delay: i * 0.4,
                  }}
                />
              ))}

              {/* Illustration content */}
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.35, ease: 'easeInOut' }}
                  className="relative z-10 w-full"
                >
                  {step === 0 && (
                    <div className="flex flex-col items-center gap-6">
                      <motion.img
                        src="/banner.png"
                        alt="BRIDGE"
                        className="h-12 object-contain opacity-80 drop-shadow-[0_0_30px_rgba(45,212,191,0.15)]"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 0.8, y: 0 }}
                        transition={{ delay: 0.2 }}
                      />
                      <KanbanIllustration />
                    </div>
                  )}
                  {step === 1 && <ScheduleIllustration />}
                  {step === 2 && <AIIllustration />}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Right Side - Content */}
            <div className="flex-1 flex flex-col p-6 md:p-8 md:pl-10">
              {/* Step content */}
              <div className="flex-1 flex flex-col justify-center">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={step}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.35, ease: 'easeInOut' }}
                  >
                    {/* Step 0: Welcome */}
                    {step === 0 && (
                      <div>
                        <motion.div
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-bridge-secondary/10 border border-bridge-secondary/20 rounded-full mb-5"
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                        >
                          <Sparkles size={13} className="text-bridge-secondary" />
                          <span className="text-xs font-bold text-bridge-secondary tracking-wider uppercase">
                            {t('onboarding.welcome.badge')}
                          </span>
                        </motion.div>

                        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 tracking-tight">
                          {t('onboarding.welcome.title')}
                        </h2>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-sm">
                          {t('onboarding.welcome.subtitle')}
                        </p>

                        <div className="space-y-3">
                          {[
                            { icon: <LayoutDashboard size={16} />, text: t('onboarding.welcome.highlight1'), color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
                            { icon: <Sparkles size={16} />, text: t('onboarding.welcome.highlight2'), color: 'text-purple-400', bg: 'bg-purple-500/10' },
                            { icon: <Users size={16} />, text: t('onboarding.welcome.highlight3'), color: 'text-teal-400', bg: 'bg-teal-500/10' },
                          ].map((item, i) => (
                            <motion.div
                              key={i}
                              className="flex items-center gap-3"
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.25 + i * 0.1 }}
                            >
                              <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center ${item.color}`}>
                                {item.icon}
                              </div>
                              <span className="text-sm text-muted-foreground">{item.text}</span>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step 1: Features */}
                    {step === 1 && (
                      <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2 tracking-tight">
                          {t('onboarding.features.title')}
                        </h2>
                        <p className="text-slate-400 text-sm mb-6">
                          {t('onboarding.features.subtitle')}
                        </p>

                        <div className="grid grid-cols-2 gap-2.5">
                          {FEATURES.map((feature, i) => (
                            <motion.div
                              key={feature.id}
                              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all cursor-default group"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 + i * 0.06 }}
                            >
                              <div className={`w-9 h-9 rounded-lg ${feature.bgColor} flex items-center justify-center ${feature.color} shrink-0 group-hover:scale-110 transition-transform`}>
                                {feature.icon}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-foreground truncate">
                                  {t(feature.labelKey)}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {t(feature.descKey)}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Step 2: Quick Start */}
                    {step === 2 && (
                      <div>
                        <motion.div
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-5"
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                        >
                          <Zap size={13} className="text-emerald-400" />
                          <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">
                            {t('onboarding.quickstart.badge')}
                          </span>
                        </motion.div>

                        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 tracking-tight">
                          {t('onboarding.quickstart.title')}
                        </h2>
                        <p className="text-slate-400 text-sm leading-relaxed mb-7 max-w-sm">
                          {t('onboarding.quickstart.subtitle')}
                        </p>

                        <div className="space-y-3">
                          {[
                            t('onboarding.quickstart.tip1'),
                            t('onboarding.quickstart.tip2'),
                            t('onboarding.quickstart.tip3'),
                          ].map((tip, i) => (
                            <motion.div
                              key={i}
                              className="flex items-start gap-3"
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.2 + i * 0.12 }}
                            >
                              <div className="w-6 h-6 rounded-full bg-bridge-secondary/15 flex items-center justify-center shrink-0 mt-0.5">
                                <CheckCircle2 size={14} className="text-bridge-secondary" />
                              </div>
                              <span className="text-sm text-muted-foreground leading-relaxed">{tip}</span>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Bottom Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-white/[0.05]">
                {/* Pagination Dots */}
                <div className="flex items-center gap-2">
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setDirection(i > step ? 1 : -1);
                        setStep(i);
                      }}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        i === step
                          ? 'w-6 bg-bridge-secondary'
                          : 'w-2 bg-white/15 hover:bg-white/25'
                      }`}
                    />
                  ))}
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSkip}
                    className="px-4 py-2 text-sm text-slate-500 hover:text-muted-foreground transition-colors"
                  >
                    {t('onboarding.skip')}
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.25)] transition-all active:scale-[0.97]"
                  >
                    <span>
                      {step === totalSteps - 1
                        ? t('onboarding.start')
                        : t('onboarding.continue')}
                    </span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
