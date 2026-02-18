import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../LanguageSwitcher';
const HeroScene = lazy(() => import('./BridgeScene').then(m => ({ default: m.HeroScene })));
import { KanbanDiagram, GanttDiagram, DailyScheduleDiagram, DailyChecklistDiagram, SlackNotificationDiagram, PriceComparisonDiagram, ResourcePulseDiagram, AIReportDiagram } from './Diagrams';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Menu, X, Layers, Layout, Zap, CheckCircle,
  RefreshCcw, BarChart3, Sparkles, Activity, Bell, AtSign, Settings2,
  Brain, Clock, Users
} from 'lucide-react';

const FeatureCard = ({ icon: Icon, title, desc, delay, highlight = false }: { icon: React.ElementType, title: string, desc: string, delay: string, highlight?: boolean }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: parseFloat(delay), duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    className={`flex flex-col p-10 rounded-[3rem] border transition-all duration-700 group relative overflow-hidden ${
      highlight
      ? 'bg-bridge-accent/10 border-bridge-accent/30 shadow-[0_0_80px_rgba(99,102,241,0.1)]'
      : 'bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/20 shadow-2xl'
    }`}
  >
    {highlight && <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity"><Activity size={80} className="text-bridge-accent" /></div>}
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-10 border transition-all duration-700 ${
      highlight ? 'bg-bridge-accent text-white border-bridge-accent shadow-xl scale-110' : 'bg-white/5 text-bridge-secondary border-white/20 shadow-inner'
    }`}>
      <Icon size={28} />
    </div>
    <h3 className="font-jakarta font-bold text-2xl text-white mb-6 tracking-tight group-hover:text-bridge-secondary transition-colors">
      {title}<span className="spot-dot opacity-0 group-hover:opacity-100 transition-opacity duration-500 ml-3" />
    </h3>
    <p className="text-slate-400 text-lg leading-relaxed font-normal font-inter opacity-90">{desc}</p>
  </motion.div>
);

const AnimatedTitle = ({ text }: { text: string }) => {
  const letters = Array.from(text);
  const container: Variants = {
    hidden: { opacity: 0 },
    visible: (i = 1) => ({
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.2 * i },
    }),
  };
  const child: Variants = {
    visible: {
      opacity: 1, y: 0, filter: "blur(0px)",
      transition: { type: "spring", damping: 15, stiffness: 100 },
    },
    hidden: {
      opacity: 0, y: 40, filter: "blur(12px)",
      transition: { type: "spring", damping: 15, stiffness: 100 },
    },
  };
  return (
    <motion.div
      style={{ overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "baseline" }}
      variants={container}
      initial="hidden"
      animate="visible"
      className="font-jakarta text-6xl md:text-8xl lg:text-[11rem] font-extrabold leading-none mb-12 tracking-tighter"
    >
      {letters.map((letter, index) => {
        // "Bridge" is 6 letters (0-5), "Spots" starts at index 6
        const isSpots = index >= 6;
        return (
          <motion.span
            key={index}
            variants={child}
            className={`inline-block ${isSpots ? 'text-outline text-glow-cyan' : 'text-shimmer text-glow-indigo'}`}
          >
            {letter}
          </motion.span>
        );
      })}
      <motion.span
        variants={child}
        className="spot-dot mb-4 lg:mb-8 ml-2 lg:ml-6 scale-150 lg:scale-[2.5]"
      />
    </motion.div>
  );
};

export const LandingPage: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dailyTab, setDailyTab] = useState<'timeblock' | 'checklist'>('timeblock');
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
    }
  };

  const handleGetStarted = () => {
    navigate('/login', { state: { from: 'landing' } });
  };

  return (
    <div className="min-h-screen bg-bridge-dark text-slate-200 selection:bg-bridge-accent selection:text-white font-inter overflow-x-hidden">

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 safe-top ${scrolled ? 'glass border-b border-white/15 py-4' : 'bg-transparent py-8'}`}>
        <div className="container mx-auto px-8 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src="/BridgeSpotsIcon.png" alt="BridgeSpots" className="w-10 h-10 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.6)] group-hover:scale-110 transition-all duration-500" />
            <div className="font-jakarta font-bold text-2xl tracking-tighter transition-all duration-500">
              <span className="text-white">Bridge</span><span className="text-bridge-secondary">Spots</span><span className="spot-dot w-1.5 h-1.5 ml-1" />
            </div>
          </div>

          <div className="hidden md:flex items-center gap-12 text-[11px] font-bold tracking-[0.4em] text-slate-400 uppercase font-jakarta">
            <a href="#core" onClick={scrollToSection('core')} className="hover:text-white transition-all duration-300">{t('landing.nav.features')}</a>
            <a href="#workflow" onClick={scrollToSection('workflow')} className="hover:text-white transition-all duration-300">{t('landing.nav.workflow')}</a>
            <a href="#pricing" onClick={scrollToSection('pricing')} className="hover:text-white transition-all duration-300">{t('landing.nav.pricing')}</a>
            <a href="#ai" onClick={scrollToSection('ai')} className="hover:text-white transition-all duration-300">{t('landing.nav.ai')}</a>
            <Link to="/compare" className="hover:text-bridge-secondary transition-all duration-300">{t('landing.nav.compare')}</Link>
            <LanguageSwitcher variant="compact" />
            <button onClick={handleGetStarted} className="px-10 py-3.5 bg-white text-bridge-dark rounded-full hover:bg-bridge-secondary hover:shadow-[0_0_30px_rgba(45,212,191,0.5)] transition-all duration-500 font-extrabold tracking-widest text-[11px]">{t('landing.nav.joinNow')}</button>
          </div>

          <button className="md:hidden text-white p-2" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed inset-0 z-40 bg-bridge-obsidian/95 backdrop-blur-2xl flex flex-col items-center justify-center gap-12 text-2xl font-jakarta text-white"
        >
          <a href="#core" onClick={scrollToSection('core')} className="uppercase font-bold tracking-[0.25em] text-slate-400">{t('landing.nav.features')}</a>
          <a href="#workflow" onClick={scrollToSection('workflow')} className="uppercase font-bold tracking-[0.25em] text-slate-400">{t('landing.nav.workflow')}</a>
          <a href="#pricing" onClick={scrollToSection('pricing')} className="uppercase font-bold tracking-[0.25em] text-slate-400">{t('landing.nav.pricing')}</a>
          <a href="#ai" onClick={scrollToSection('ai')} className="uppercase font-bold tracking-[0.25em] text-slate-400">{t('landing.nav.ai')}</a>
          <Link to="/compare" className="uppercase font-bold tracking-[0.25em] text-slate-400">{t('landing.nav.compare')}</Link>
          <button onClick={handleGetStarted} className="px-10 py-5 bg-bridge-accent text-white rounded-full shadow-2xl uppercase font-bold tracking-widest text-sm">{t('landing.nav.startForFree')}</button>
        </motion.div>
      )}

      {/* Hero Section */}
      <header className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        <Suspense fallback={<div className="absolute inset-0 bg-bridge-dark" />}>
          <HeroScene />
        </Suspense>
        <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(10,14,23,0)_0%,rgba(10,14,23,0.3)_60%,#0A0E17_100%)]" />

        <div className="relative z-10 container mx-auto px-8 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="inline-block mb-10 px-8 py-3 border border-bridge-secondary/20 text-bridge-secondary text-[11px] font-bold tracking-[0.5em] uppercase rounded-full bg-bridge-secondary/5 backdrop-blur-xl shadow-2xl font-jakarta"
          >
            {t('landing.hero.badge')}
          </motion.div>

          <AnimatedTitle text="BridgeSpots" />

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3, duration: 1.2 }}
            className="max-w-4xl mx-auto text-xl md:text-3xl text-slate-300 font-normal leading-relaxed mb-16 px-4 font-inter opacity-90"
          >
            {t('landing.hero.subtitleText1')} <span className="text-bridge-secondary font-semibold">{t('landing.hero.subtitleFlow')}</span>.<br/>
            {t('landing.hero.subtitleText2')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="flex flex-col md:flex-row justify-center gap-6 mb-20"
          >
            <button onClick={handleGetStarted} className="px-16 py-7 bg-bridge-accent text-white rounded-full font-bold uppercase tracking-widest text-[12px] shadow-[0_0_60px_rgba(99,102,241,0.5)] hover:bg-white hover:text-bridge-dark transition-all transform hover:-translate-y-2 duration-500 flex items-center gap-3 mx-auto md:mx-0 font-jakarta">
              {t('landing.hero.tryFree')} <ArrowRight size={20} />
            </button>
            <button onClick={handleGetStarted} className="px-16 py-7 bg-white/5 border border-white/20 text-white rounded-full font-bold uppercase tracking-widest text-[12px] shadow-xl backdrop-blur-md hover:bg-white/10 transition-all transform hover:-translate-y-1 duration-500 mx-auto md:mx-0 font-jakarta">
              {t('landing.hero.basicFree')}
            </button>
          </motion.div>
        </div>
      </header>

      <main>
        {/* Core Values Section */}
        <section id="core" className="py-64 bg-bridge-obsidian/40 border-y border-white/15 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-bridge-accent/5 blur-[250px] rounded-full -mr-96 -mt-96" />
          <div className="container mx-auto px-8">
            <div className="max-w-5xl mb-32">
               <div className="inline-block mb-10 text-[11px] font-bold tracking-[0.6em] text-bridge-secondary uppercase font-jakarta">{t('landing.core.label')}</div>
               <h2 className="font-jakarta text-6xl md:text-9xl mb-12 leading-none text-white tracking-tighter font-extrabold">
                 {t('landing.core.titleLine1')}<br/>{t('landing.core.titleLine2')}<span className="spot-dot scale-150" />
               </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <FeatureCard
                icon={Layers}
                title={t('landing.core.kanban.title')}
                desc={t('landing.core.kanban.desc')}
                delay="0.1"
                highlight
              />
              <FeatureCard
                icon={RefreshCcw}
                title={t('landing.core.gantt.title')}
                desc={t('landing.core.gantt.desc')}
                delay="0.2"
              />
              <FeatureCard
                icon={BarChart3}
                title={t('landing.core.dashboard.title')}
                desc={t('landing.core.dashboard.desc')}
                delay="0.3"
              />
              <FeatureCard
                icon={Zap}
                title={t('landing.core.pricing.title')}
                desc={t('landing.core.pricing.desc')}
                delay="0.4"
              />
            </div>
          </div>
        </section>

        {/* Workflow Section */}
        <section id="workflow" className="py-48 bg-bridge-dark relative">
          <div className="container mx-auto px-8">
            <div className="max-w-4xl mx-auto text-center mb-32">
              <h2 className="font-jakarta text-4xl md:text-8xl mb-10 text-white tracking-tighter font-extrabold">{t('landing.workflow.title')}<span className="spot-dot scale-150 ml-4" /></h2>
              <p className="text-xl text-slate-400 leading-relaxed font-light font-inter">
                {t('landing.workflow.subtitle')}
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
              <div className="order-2 lg:order-1 relative">
                <div className="absolute -inset-10 bg-bridge-accent/5 blur-[100px] rounded-full" />
                <KanbanDiagram />
              </div>
              <div className="order-1 lg:order-2 space-y-16">
                {[
                  { num: "01", title: t('landing.workflow.step1.title'), text: t('landing.workflow.step1.text') },
                  { num: "02", title: t('landing.workflow.step2.title'), text: t('landing.workflow.step2.text') },
                  { num: "03", title: t('landing.workflow.step3.title'), text: t('landing.workflow.step3.text') }
                ].map((item, i) => (
                  <motion.div
                    whileHover={{ x: 10 }}
                    key={i}
                    className="flex gap-10 group cursor-default"
                  >
                    <div className="flex-shrink-0 w-20 h-20 rounded-3xl border border-white/20 bg-white/5 flex items-center justify-center font-jakarta text-3xl font-bold text-bridge-accent group-hover:bg-bridge-accent group-hover:text-white transition-all duration-700 shadow-2xl">
                      {item.num}
                    </div>
                    <div>
                      <h4 className="text-3xl font-jakarta font-bold text-white mb-4 tracking-tight group-hover:text-bridge-secondary transition-colors duration-500">{item.title}</h4>
                      <p className="text-slate-400 leading-relaxed text-lg font-light font-inter">{item.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Scheduling Section */}
        <section id="scheduling" className="py-48 bg-bridge-obsidian border-y border-white/15">
          <div className="container mx-auto px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-28 items-center">
              <div className="lg:col-span-5">
                <div className="inline-block mb-6 text-[11px] font-bold tracking-[0.4em] text-bridge-secondary uppercase font-jakarta">{t('landing.scheduling.label')}</div>
                <h2 className="font-jakarta text-4xl md:text-7xl mb-12 leading-tight text-white font-extrabold tracking-tighter">{t('landing.scheduling.titleLine1')} <br/>{t('landing.scheduling.titleLine2')}<span className="spot-dot scale-150 ml-2" /></h2>
                <p className="text-xl text-slate-400 mb-16 leading-relaxed font-light font-inter">
                  {t('landing.scheduling.subtitle')}
                </p>
              </div>
              <div className="lg:col-span-7 flex flex-col gap-12">
                <GanttDiagram />
                <div>
                  <div className="flex justify-center mb-6">
                    <div className="inline-flex bg-white/5 border border-white/10 rounded-2xl p-1.5">
                      <button
                        onClick={() => setDailyTab('timeblock')}
                        className={`px-6 py-2.5 rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all font-jakarta ${
                          dailyTab === 'timeblock'
                            ? 'bg-bridge-accent text-white shadow-lg'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {t('landing.scheduling.timeBlocks')}
                      </button>
                      <button
                        onClick={() => setDailyTab('checklist')}
                        className={`px-6 py-2.5 rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all font-jakarta ${
                          dailyTab === 'checklist'
                            ? 'bg-bridge-secondary text-bridge-dark shadow-lg'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {t('landing.scheduling.dailyChecklist')}
                      </button>
                    </div>
                  </div>
                  <AnimatePresence mode="wait">
                    {dailyTab === 'timeblock' ? (
                      <motion.div key="timeblock" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                        <DailyScheduleDiagram />
                      </motion.div>
                    ) : (
                      <motion.div key="checklist" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                        <DailyChecklistDiagram />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Collaboration Section */}
        <section id="collaboration" className="py-48 bg-bridge-dark relative">
          <div className="container mx-auto px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-28 items-center">
              <div className="lg:col-span-7 order-2 lg:order-1">
                <div className="relative">
                  <div className="absolute -inset-10 bg-bridge-accent/5 blur-[100px] rounded-full" />
                  <SlackNotificationDiagram />
                </div>
              </div>
              <div className="lg:col-span-5 order-1 lg:order-2">
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-[11px] font-bold tracking-[0.4em] text-bridge-secondary uppercase font-jakarta">{t('landing.collaboration.label')}</span>
                  <span className="px-3 py-1 bg-bridge-secondary/10 border border-bridge-secondary/30 rounded-full text-[9px] font-black text-bridge-secondary tracking-widest uppercase font-jakarta">{t('landing.collaboration.premium')}</span>
                </div>
                <h2 className="font-jakarta text-4xl md:text-7xl mb-12 leading-tight text-white font-extrabold tracking-tighter">{t('landing.collaboration.titleLine1')}<br/>{t('landing.collaboration.titleLine2')}<span className="spot-dot scale-150 ml-2" /></h2>
                <p className="text-xl text-slate-400 mb-16 leading-relaxed font-light font-inter">
                  {t('landing.collaboration.subtitle')}
                </p>
                <div className="space-y-12">
                  {[
                    { icon: Bell, title: t('landing.collaboration.slack.title'), text: t('landing.collaboration.slack.text') },
                    { icon: AtSign, title: t('landing.collaboration.mention.title'), text: t('landing.collaboration.mention.text') },
                    { icon: Settings2, title: t('landing.collaboration.granular.title'), text: t('landing.collaboration.granular.text') },
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.15 }}
                      className="flex gap-6 group"
                    >
                      <div className="flex-shrink-0 w-14 h-14 rounded-2xl border border-white/20 bg-white/5 flex items-center justify-center group-hover:bg-bridge-accent group-hover:border-bridge-accent transition-all duration-700 shadow-2xl">
                        <item.icon size={22} className="text-bridge-accent group-hover:text-white transition-colors duration-700" />
                      </div>
                      <div>
                        <h4 className="text-xl font-jakarta font-bold text-white mb-2 tracking-tight group-hover:text-bridge-secondary transition-colors duration-500">{item.title}</h4>
                        <p className="text-slate-400 leading-relaxed text-base font-light font-inter">{item.text}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* AI Intelligence Section */}
        <section id="ai" className="py-48 bg-bridge-obsidian border-y border-white/15 relative overflow-hidden">
          <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-bridge-accent/5 blur-[250px] rounded-full -ml-96 -mb-96" />
          <div className="container mx-auto px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-28 items-center">
              <div className="lg:col-span-5">
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-[11px] font-bold tracking-[0.4em] text-bridge-secondary uppercase font-jakarta">{t('landing.ai.label')}</span>
                  <span className="px-3 py-1 bg-bridge-secondary/10 border border-bridge-secondary/30 rounded-full text-[9px] font-black text-bridge-secondary tracking-widest uppercase font-jakarta">{t('landing.ai.premium')}</span>
                </div>
                <h2 className="font-jakarta text-4xl md:text-7xl mb-12 leading-tight text-white font-extrabold tracking-tighter">{t('landing.ai.titleLine1')}<br/>{t('landing.ai.titleLine2')}<span className="spot-dot scale-150 ml-2" /></h2>
                <p className="text-xl text-slate-400 mb-16 leading-relaxed font-light font-inter">
                  {t('landing.ai.subtitle')}
                </p>
                <div className="space-y-12">
                  {[
                    { icon: Sparkles, title: t('landing.ai.narrative.title'), text: t('landing.ai.narrative.text') },
                    { icon: Clock, title: t('landing.ai.standup.title'), text: t('landing.ai.standup.text') },
                    { icon: Users, title: t('landing.ai.insights.title'), text: t('landing.ai.insights.text') },
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.15 }}
                      className="flex gap-6 group"
                    >
                      <div className="flex-shrink-0 w-14 h-14 rounded-2xl border border-white/20 bg-white/5 flex items-center justify-center group-hover:bg-bridge-accent group-hover:border-bridge-accent transition-all duration-700 shadow-2xl">
                        <item.icon size={22} className="text-bridge-accent group-hover:text-white transition-colors duration-700" />
                      </div>
                      <div>
                        <h4 className="text-xl font-jakarta font-bold text-white mb-2 tracking-tight group-hover:text-bridge-secondary transition-colors duration-500">{item.title}</h4>
                        <p className="text-slate-400 leading-relaxed text-base font-light font-inter">{item.text}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
              <div className="lg:col-span-7">
                <div className="relative">
                  <div className="absolute -inset-10 bg-bridge-accent/5 blur-[100px] rounded-full" />
                  <AIReportDiagram />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="py-64 bg-bridge-dark relative overflow-hidden">
          <div className="container mx-auto px-8 text-center">
             <div className="max-w-5xl mx-auto mb-32">
                <div className="flex justify-center mb-12">
                  <div className="px-10 py-3.5 bg-bridge-secondary/10 border border-bridge-secondary/30 rounded-full flex items-center gap-4 text-bridge-secondary text-[12px] font-black shadow-2xl font-jakarta">
                    <Sparkles size={20} />
                    <span className="tracking-[0.4em]">{t('landing.pricing.trialBadge')}</span>
                  </div>
                </div>
                <h2 className="font-jakarta text-7xl md:text-[11rem] mb-16 text-white tracking-tighter leading-none font-extrabold">
                  {t('landing.pricing.titleLine1')}<br/>{t('landing.pricing.titleLine2')}<span className="spot-dot scale-150" />
                </h2>
                <div className="bg-bridge-obsidian/60 backdrop-blur-3xl rounded-[3rem] p-12 border border-white/20 max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-12">
                  <RefreshCcw size={48} className="text-bridge-secondary animate-spin-slow flex-shrink-0" />
                  <p className="text-left text-xl leading-relaxed text-slate-300 font-inter font-light">
                    <strong className="text-white block mb-3 font-jakarta text-2xl font-bold italic">{t('landing.pricing.momentum')}</strong>
                    {t('landing.pricing.momentumDesc')}
                  </p>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-6xl mx-auto items-stretch">
                <div className="p-16 bg-white/5 backdrop-blur-xl rounded-[4rem] border border-white/20 flex flex-col items-center text-center hover:bg-white/10 transition-all duration-700">
                  <span className="text-[12px] font-black text-slate-400 uppercase tracking-[0.6em] mb-12 font-jakarta">{t('landing.pricing.basic.name')}</span>
                  <div className="flex items-baseline gap-2 mb-8">
                    <span className="text-8xl font-jakarta font-extrabold text-white">{t('landing.pricing.basic.price')}</span>
                  </div>
                  <p className="text-lg text-slate-400 mb-16 font-inter">{t('landing.pricing.basic.tagline')}</p>
                  <ul className="text-base space-y-8 text-slate-400 mb-20 text-left w-full border-t border-white/15 pt-16 font-light font-inter">
                    <li className="flex items-center gap-5"><CheckCircle size={22} className="text-bridge-secondary/50" /> {t('landing.pricing.basic.feature1')}</li>
                    <li className="flex items-center gap-5"><CheckCircle size={22} className="text-bridge-secondary/50" /> {t('landing.pricing.basic.feature2')}</li>
                    <li className="flex items-center gap-5"><CheckCircle size={22} className="text-bridge-secondary/50" /> {t('landing.pricing.basic.feature3')}</li>
                  </ul>
                  <button onClick={handleGetStarted} className="w-full py-8 bg-white/10 border border-white/20 rounded-full text-[12px] font-black uppercase tracking-widest text-white hover:bg-white hover:text-bridge-dark transition-all font-jakarta">{t('landing.pricing.basic.cta')}</button>
                </div>

                <div className="p-16 bg-bridge-obsidian rounded-[4rem] border-2 border-bridge-secondary/40 shadow-[0_0_120px_rgba(45,212,191,0.2)] flex flex-col items-center text-center transform scale-105 relative z-10 transition-all duration-700">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bridge-secondary text-bridge-dark px-14 py-4 rounded-full text-[12px] font-black tracking-[0.5em] uppercase shadow-2xl font-jakarta">{t('landing.pricing.premium.name')}</div>
                  <div className="flex items-baseline gap-3 mb-8">
                    <span className="text-4xl text-bridge-secondary font-jakarta font-bold">$</span>
                    <span className="text-9xl font-jakarta font-extrabold text-white">5</span>
                  </div>
                  <p className="text-lg text-slate-400 mb-16 font-inter">{t('landing.pricing.premium.tagline')}</p>
                  <ul className="text-base space-y-8 text-slate-100 mb-20 text-left w-full border-t border-white/20 pt-16 font-medium font-inter">
                    <li className="flex items-center gap-5 text-bridge-secondary font-bold"><CheckCircle size={26} /> {t('landing.pricing.premium.feature1')}</li>
                    <li className="flex items-center gap-5"><CheckCircle size={26} className="text-bridge-secondary" /> {t('landing.pricing.premium.feature2')}</li>
                    <li className="flex items-center gap-5"><CheckCircle size={26} className="text-bridge-secondary" /> {t('landing.pricing.premium.feature3')}</li>
                    <li className="flex items-center gap-5"><CheckCircle size={26} className="text-bridge-secondary" /> {t('landing.pricing.premium.feature4')}</li>
                    <li className="flex items-center gap-5"><CheckCircle size={26} className="text-bridge-secondary" /> {t('landing.pricing.premium.feature5')}</li>
                    <li className="flex items-center gap-5"><CheckCircle size={26} className="text-bridge-secondary" /> {t('landing.pricing.premium.feature6')}</li>
                  </ul>
                  <button onClick={handleGetStarted} className="w-full py-9 bg-bridge-secondary text-bridge-dark rounded-full text-[12px] font-black uppercase tracking-widest shadow-2xl hover:shadow-[0_0_80px_rgba(45,212,191,0.7)] transition-all transform hover:scale-[1.03] font-jakarta">{t('landing.pricing.premium.cta')}</button>
                </div>
             </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-72 relative overflow-hidden bg-bridge-dark text-white text-center">
           <Suspense fallback={<div className="absolute inset-0 bg-bridge-dark" />}>
             <HeroScene />
           </Suspense>
           <div className="absolute inset-0 bg-gradient-to-t from-bridge-dark via-transparent to-bridge-dark" />
           <div className="relative z-10 max-w-6xl mx-auto px-8">
              <motion.h2
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2 }}
                className="font-jakarta text-7xl md:text-[13rem] mb-20 leading-none text-white tracking-tighter font-extrabold"
              >
                {t('landing.cta.titleLine1')}<br/><span className="text-outline">{t('landing.cta.titleLine2')}</span><span className="spot-dot scale-[2]" />
              </motion.h2>
              <p className="text-3xl text-slate-400 mb-24 font-light max-w-5xl mx-auto leading-relaxed font-inter">
                {t('landing.cta.subtitle')}
              </p>
              <button onClick={handleGetStarted} className="px-24 py-10 bg-white text-bridge-dark rounded-full font-black uppercase tracking-[0.7em] text-[13px] shadow-[0_0_120px_rgba(255,255,255,0.25)] hover:scale-110 transition-all duration-700 font-jakarta">{t('landing.cta.button')}</button>
           </div>
        </section>
      </main>

      <footer className="bg-bridge-obsidian text-slate-400 py-48 border-t border-white/15">
        <div className="container mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-24 mb-32">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-3 mb-12">
                 <img src="/BridgeSpotsIcon.png" alt="BridgeSpots" className="w-10 h-10 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.6)]" />
                 <div className="font-jakarta font-bold text-3xl tracking-tighter">
                   <span className="text-white">Bridge</span><span className="text-bridge-secondary">Spots</span><span className="spot-dot w-2 h-2 ml-1" />
                 </div>
              </div>
              <p className="text-lg leading-relaxed text-slate-400 font-normal font-inter">
                {t('landing.footer.tagline')}
              </p>
            </div>
            <div>
              <h4 className="font-bold text-white mb-10 text-[11px] uppercase tracking-[0.5em] font-jakarta">{t('landing.footer.ecosystem')}</h4>
              <ul className="text-lg space-y-6 font-light font-inter">
                <li><a href="#" className="hover:text-bridge-secondary transition-all">{t('landing.footer.templates')}</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">{t('landing.footer.integrations')}</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">{t('landing.footer.apiGuide')}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-10 text-[11px] uppercase tracking-[0.5em] font-jakarta">{t('landing.footer.community')}</h4>
              <ul className="text-lg space-y-6 font-light font-inter">
                <li><a href="#" className="hover:text-bridge-secondary transition-all">LinkedIn</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">Twitter / X</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">{t('landing.footer.slackGroup')}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-10 text-[11px] uppercase tracking-[0.5em] font-jakarta">{t('landing.footer.mission')}</h4>
              <ul className="text-lg space-y-6 font-light font-inter">
                <li><a href="#" className="hover:text-bridge-secondary transition-all">{t('landing.footer.manifesto')}</a></li>
                <li><Link to="/privacy" className="hover:text-bridge-secondary transition-all">{t('landing.footer.privacy')}</Link></li>
                <li><Link to="/terms" className="hover:text-bridge-secondary transition-all">{t('landing.footer.terms')}</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-20 border-t border-white/15 text-center text-[11px] tracking-[0.8em] uppercase font-black text-slate-700 font-jakarta">
            {t('landing.footer.copyright')}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
