import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Menu, X, Check, Minus, Layers, RefreshCcw,
  BarChart3, Zap, Brain, Calendar, Clock, Users, Bell,
  ChevronDown, Shield, Sparkles, TrendingDown, ExternalLink
} from 'lucide-react';

type CompetitorKey = 'trello' | 'asana' | 'jira' | 'notion';

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true } as const,
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const },
};

export const ComparisonPage: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorKey>('trello');
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
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  const handleGetStarted = () => navigate('/login', { state: { from: 'compare' } });

  // Feature comparison data
  const features = [
    { key: 'hierarchy', icon: Layers },
    { key: 'autoProgress', icon: RefreshCcw },
    { key: 'gantt', icon: Calendar },
    { key: 'dailySchedule', icon: Clock },
    { key: 'aiReports', icon: Brain },
    { key: 'slackIntegration', icon: Bell },
    { key: 'statistics', icon: BarChart3 },
    { key: 'resourceAnalytics', icon: Users },
  ];

  const competitorStatus: Record<string, Record<CompetitorKey, 'yes' | 'paid' | 'no'>> = {
    hierarchy: { trello: 'no', asana: 'yes', jira: 'yes', notion: 'no' },
    autoProgress: { trello: 'no', asana: 'no', jira: 'no', notion: 'no' },
    gantt: { trello: 'paid', asana: 'paid', jira: 'paid', notion: 'paid' },
    dailySchedule: { trello: 'no', asana: 'no', jira: 'no', notion: 'no' },
    aiReports: { trello: 'no', asana: 'paid', jira: 'paid', notion: 'paid' },
    slackIntegration: { trello: 'paid', asana: 'yes', jira: 'yes', notion: 'yes' },
    statistics: { trello: 'paid', asana: 'paid', jira: 'yes', notion: 'no' },
    resourceAnalytics: { trello: 'no', asana: 'paid', jira: 'paid', notion: 'no' },
  };

  // Pricing data (10-person team, annual)
  const pricingData = [
    { name: 'BridgeSpots', annual: 500, perUser: 5, color: 'bg-bridge-secondary', highlight: true },
    { name: 'Trello', annual: 1200, perUser: 10, color: 'bg-slate-600', highlight: false },
    { name: 'Jira', annual: 1440, perUser: 12, color: 'bg-blue-600', highlight: false },
    { name: 'Asana', annual: 1320, perUser: 11, color: 'bg-orange-500', highlight: false },
    { name: 'Notion', annual: 1920, perUser: 16, color: 'bg-slate-500', highlight: false },
  ];

  const maxAnnual = Math.max(...pricingData.map(p => p.annual));

  const competitors: { key: CompetitorKey; label: string }[] = [
    { key: 'trello', label: 'Trello' },
    { key: 'asana', label: 'Asana' },
    { key: 'jira', label: 'Jira' },
    { key: 'notion', label: 'Notion' },
  ];

  const StatusIcon = ({ status }: { status: 'yes' | 'paid' | 'no' }) => {
    if (status === 'yes') return <Check size={18} className="text-bridge-secondary" />;
    if (status === 'paid') return <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Paid</span>;
    return <Minus size={18} className="text-slate-600" />;
  };

  return (
    <div className="min-h-screen bg-bridge-dark text-slate-200 selection:bg-bridge-accent selection:text-white font-inter overflow-x-hidden">

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 safe-top ${scrolled ? 'glass border-b border-white/15 py-4' : 'bg-transparent py-8'}`}>
        <div className="container mx-auto px-8 flex justify-between items-center">
          <Link to="/landing" className="flex items-center gap-3 cursor-pointer group">
            <img src="/BridgeSpotsIcon.png" alt="BridgeSpots" className="w-10 h-10 rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.6)] group-hover:scale-110 transition-all duration-500" />
            <div className="font-jakarta font-bold text-2xl tracking-tighter transition-all duration-500">
              <span className="text-white">Bridge</span><span className="text-bridge-secondary">Spots</span><span className="spot-dot w-1.5 h-1.5 ml-1" />
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-12 text-[11px] font-bold tracking-[0.4em] text-slate-400 uppercase font-jakarta">
            <a href="#features" onClick={scrollToSection('features')} className="hover:text-white transition-all duration-300">{t('compare.nav.features')}</a>
            <a href="#pricing" onClick={scrollToSection('pricing')} className="hover:text-white transition-all duration-300">{t('compare.nav.pricing')}</a>
            <a href="#recommend" onClick={scrollToSection('recommend')} className="hover:text-white transition-all duration-300">{t('compare.nav.recommend')}</a>
            <LanguageSwitcher variant="compact" />
            <button onClick={handleGetStarted} className="px-10 py-3.5 bg-white text-bridge-dark rounded-full hover:bg-bridge-secondary hover:shadow-[0_0_30px_rgba(45,212,191,0.5)] transition-all duration-500 font-extrabold tracking-widest text-[11px]">{t('compare.nav.tryFree')}</button>
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
          <a href="#features" onClick={scrollToSection('features')} className="uppercase font-bold tracking-[0.25em] text-slate-400">{t('compare.nav.features')}</a>
          <a href="#pricing" onClick={scrollToSection('pricing')} className="uppercase font-bold tracking-[0.25em] text-slate-400">{t('compare.nav.pricing')}</a>
          <a href="#recommend" onClick={scrollToSection('recommend')} className="uppercase font-bold tracking-[0.25em] text-slate-400">{t('compare.nav.recommend')}</a>
          <button onClick={handleGetStarted} className="px-10 py-5 bg-bridge-accent text-white rounded-full shadow-2xl uppercase font-bold tracking-widest text-sm">{t('compare.nav.tryFree')}</button>
        </motion.div>
      )}

      {/* Hero Section */}
      <header className="relative min-h-[80vh] flex items-center justify-center overflow-hidden pt-32 pb-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-bridge-accent/8 blur-[250px] rounded-full -mt-96" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-bridge-secondary/5 blur-[200px] rounded-full -mr-48 -mb-48" />

        <div className="relative z-10 container mx-auto px-8 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="inline-block mb-10 px-8 py-3 border border-bridge-secondary/20 text-bridge-secondary text-[11px] font-bold tracking-[0.5em] uppercase rounded-full bg-bridge-secondary/5 backdrop-blur-xl shadow-2xl font-jakarta"
          >
            {t('compare.hero.badge')}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="font-jakarta text-5xl md:text-8xl lg:text-[10rem] font-extrabold leading-none mb-12 tracking-tighter"
          >
            <span className="text-white">{t('compare.hero.titleLine1')}</span><br />
            <span className="text-shimmer">{t('compare.hero.titleLine2')}</span>
            <span className="spot-dot scale-150 lg:scale-[2] ml-2 lg:ml-4" />
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="max-w-3xl mx-auto text-xl md:text-2xl text-slate-400 font-light leading-relaxed mb-16 font-inter"
          >
            {t('compare.hero.subtitle')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="flex items-center justify-center gap-3 text-slate-500"
          >
            <ChevronDown size={20} className="animate-bounce" />
            <span className="text-[11px] font-bold uppercase tracking-[0.4em] font-jakarta">{t('compare.hero.scroll')}</span>
          </motion.div>
        </div>
      </header>

      <main>
        {/* Feature Comparison Section */}
        <section id="features" className="py-32 md:py-48 bg-bridge-obsidian/40 border-y border-white/15 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-bridge-accent/5 blur-[250px] rounded-full -mr-96 -mt-96" />
          <div className="container mx-auto px-4 md:px-8">
            <div className="max-w-5xl mb-20 md:mb-32">
              <div className="inline-block mb-8 text-[11px] font-bold tracking-[0.6em] text-bridge-secondary uppercase font-jakarta">{t('compare.features.label')}</div>
              <h2 className="font-jakarta text-4xl md:text-7xl lg:text-8xl mb-8 leading-none text-white tracking-tighter font-extrabold">
                {t('compare.features.titleLine1')}<br />{t('compare.features.titleLine2')}<span className="spot-dot scale-150" />
              </h2>
              <p className="text-lg md:text-xl text-slate-400 font-light font-inter max-w-3xl">
                {t('compare.features.subtitle')}
              </p>
            </div>

            {/* Competitor Selector */}
            <div className="flex justify-center mb-12">
              <div className="inline-flex bg-white/5 border border-white/10 rounded-2xl p-1.5 flex-wrap justify-center gap-1">
                {competitors.map(comp => (
                  <button
                    key={comp.key}
                    onClick={() => setSelectedCompetitor(comp.key)}
                    className={`px-5 md:px-8 py-3 rounded-xl text-[11px] font-bold tracking-widest uppercase transition-all font-jakarta ${
                      selectedCompetitor === comp.key
                        ? 'bg-bridge-accent text-white shadow-lg'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {comp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Comparison Table */}
            <div className="max-w-4xl mx-auto">
              <div className="bg-bridge-obsidian/60 backdrop-blur-xl rounded-[2rem] md:rounded-[3rem] border border-white/10 overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-3 gap-4 p-6 md:p-8 border-b border-white/10">
                  <div className="text-[11px] font-bold tracking-[0.4em] text-slate-500 uppercase font-jakarta">{t('compare.features.feature')}</div>
                  <div className="text-center">
                    <span className="text-[11px] font-bold tracking-[0.3em] text-bridge-secondary uppercase font-jakarta">Bridge</span>
                  </div>
                  <div className="text-center">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={selectedCompetitor}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="text-[11px] font-bold tracking-[0.3em] text-slate-400 uppercase font-jakarta inline-block"
                      >
                        {competitors.find(c => c.key === selectedCompetitor)?.label}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>

                {/* Table Rows */}
                {features.map((feature, i) => (
                  <motion.div
                    key={feature.key}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05, duration: 0.5 }}
                    className={`grid grid-cols-3 gap-4 p-6 md:p-8 items-center group hover:bg-white/5 transition-all ${
                      i < features.length - 1 ? 'border-b border-white/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <feature.icon size={18} className="text-bridge-accent flex-shrink-0 hidden md:block" />
                      <span className="text-sm md:text-base text-white font-medium font-jakarta">{t(`compare.features.items.${feature.key}.name`)}</span>
                    </div>
                    <div className="flex justify-center">
                      <div className="w-8 h-8 rounded-full bg-bridge-secondary/10 border border-bridge-secondary/30 flex items-center justify-center">
                        <Check size={16} className="text-bridge-secondary" />
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`${feature.key}-${selectedCompetitor}`}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.2 }}
                        >
                          <StatusIcon status={competitorStatus[feature.key][selectedCompetitor]} />
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-8 mt-8 text-[11px] font-bold tracking-wider uppercase font-jakarta">
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-bridge-secondary" />
                  <span className="text-slate-500">{t('compare.features.legend.included')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400">Paid</span>
                  <span className="text-slate-500">{t('compare.features.legend.paid')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Minus size={14} className="text-slate-600" />
                  <span className="text-slate-500">{t('compare.features.legend.none')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Differentiators Section */}
        <section className="py-32 md:py-48 bg-bridge-dark relative">
          <div className="container mx-auto px-4 md:px-8">
            <div className="max-w-4xl mx-auto text-center mb-20 md:mb-32">
              <h2 className="font-jakarta text-4xl md:text-7xl mb-8 text-white tracking-tighter font-extrabold">
                {t('compare.differentiators.title')}<span className="spot-dot scale-150 ml-4" />
              </h2>
              <p className="text-lg md:text-xl text-slate-400 leading-relaxed font-light font-inter">
                {t('compare.differentiators.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 max-w-5xl mx-auto">
              {[
                { icon: Layers, key: 'structure', highlight: true },
                { icon: RefreshCcw, key: 'autoProgress', highlight: false },
                { icon: Brain, key: 'ai', highlight: false },
                { icon: Shield, key: 'noCost', highlight: true },
              ].map((item, i) => (
                <motion.div
                  key={item.key}
                  {...fadeInUp}
                  transition={{ delay: i * 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className={`flex flex-col p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border transition-all duration-700 group relative overflow-hidden ${
                    item.highlight
                      ? 'bg-bridge-accent/10 border-bridge-accent/30 shadow-[0_0_80px_rgba(99,102,241,0.1)]'
                      : 'bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/20 shadow-2xl'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 border transition-all duration-700 ${
                    item.highlight ? 'bg-bridge-accent text-white border-bridge-accent shadow-xl' : 'bg-white/5 text-bridge-secondary border-white/20 shadow-inner'
                  }`}>
                    <item.icon size={28} />
                  </div>
                  <h3 className="font-jakarta font-bold text-xl md:text-2xl text-white mb-4 tracking-tight group-hover:text-bridge-secondary transition-colors">
                    {t(`compare.differentiators.items.${item.key}.title`)}
                    <span className="spot-dot opacity-0 group-hover:opacity-100 transition-opacity duration-500 ml-3" />
                  </h3>
                  <p className="text-slate-400 text-base md:text-lg leading-relaxed font-normal font-inter opacity-90">
                    {t(`compare.differentiators.items.${item.key}.desc`)}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Comparison Section */}
        <section id="pricing" className="py-32 md:py-48 bg-bridge-obsidian border-y border-white/15 relative overflow-hidden">
          <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-bridge-secondary/5 blur-[250px] rounded-full -ml-96 -mb-96" />
          <div className="container mx-auto px-4 md:px-8">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-20 md:mb-32">
                <div className="inline-block mb-8 text-[11px] font-bold tracking-[0.6em] text-bridge-secondary uppercase font-jakarta">{t('compare.pricing.label')}</div>
                <h2 className="font-jakarta text-4xl md:text-7xl lg:text-8xl mb-8 text-white tracking-tighter font-extrabold">
                  {t('compare.pricing.titleLine1')}<br />{t('compare.pricing.titleLine2')}<span className="spot-dot scale-150" />
                </h2>
                <p className="text-lg md:text-xl text-slate-400 font-light font-inter max-w-3xl mx-auto">
                  {t('compare.pricing.subtitle')}
                </p>
              </div>

              {/* Pricing Bars */}
              <div className="bg-bridge-dark/60 backdrop-blur-xl rounded-[2rem] md:rounded-[3rem] border border-white/10 p-8 md:p-12 mb-12">
                <div className="flex items-center justify-between mb-10">
                  <h3 className="font-jakarta font-bold text-xl md:text-2xl text-white flex items-center gap-4 tracking-tight">
                    <TrendingDown size={22} className="text-bridge-secondary" />
                    {t('compare.pricing.annualCost')}
                  </h3>
                  <span className="text-[11px] font-bold text-slate-500 tracking-widest uppercase font-jakarta">{t('compare.pricing.teamSize')}</span>
                </div>

                <div className="space-y-8">
                  {pricingData.map((item, i) => (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, x: -30 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1, duration: 0.6 }}
                      className="space-y-3"
                    >
                      <div className="flex justify-between items-end">
                        <div>
                          <span className={`text-sm md:text-base font-bold ${item.highlight ? 'text-bridge-secondary' : 'text-slate-300'}`}>
                            {item.name}
                          </span>
                          <span className="text-[11px] text-slate-500 ml-3">${item.perUser}/{t('compare.pricing.perUser')}</span>
                        </div>
                        <span className={`text-sm font-mono ${item.highlight ? 'text-white font-bold' : 'text-slate-400'}`}>
                          ${item.annual.toLocaleString()}/{t('compare.pricing.year')}
                        </span>
                      </div>
                      <div className="h-4 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: `${(item.annual / maxAnnual) * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 1.5, delay: i * 0.15, ease: 'circOut' }}
                          className={`h-full rounded-full ${item.color} ${item.highlight ? 'shadow-[0_0_20px_rgba(45,212,191,0.4)]' : ''}`}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  {...fadeInUp}
                  className="mt-12 p-6 bg-bridge-secondary/5 rounded-2xl border border-bridge-secondary/10 text-center"
                >
                  <p className="text-sm md:text-base text-bridge-secondary font-semibold font-jakarta italic">
                    {t('compare.pricing.savings')}
                  </p>
                </motion.div>
              </div>

              {/* What's Included */}
              <motion.div
                {...fadeInUp}
                className="bg-bridge-dark/60 backdrop-blur-xl rounded-[2rem] md:rounded-[3rem] border border-bridge-secondary/20 p-8 md:p-12"
              >
                <div className="flex items-center gap-4 mb-8">
                  <Sparkles size={22} className="text-bridge-secondary" />
                  <h3 className="font-jakarta font-bold text-xl md:text-2xl text-white tracking-tight">{t('compare.pricing.includedTitle')}</h3>
                  <span className="px-4 py-1.5 bg-bridge-secondary/10 border border-bridge-secondary/30 rounded-full text-[10px] font-black text-bridge-secondary tracking-widest uppercase font-jakarta">$5/{t('compare.pricing.perUser')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    'kanban', 'autoProgress', 'gantt', 'dailySchedule',
                    'milestone', 'resourceAnalytics', 'statistics',
                    'aiReports', 'aiStandup', 'slackIntegration',
                    'mentions', 'roleManagement'
                  ].map((key, i) => (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                    >
                      <Check size={16} className="text-bridge-secondary flex-shrink-0" />
                      <span className="text-sm text-slate-300 font-inter">{t(`compare.pricing.features.${key}`)}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* When to Use What Section */}
        <section id="recommend" className="py-32 md:py-48 bg-bridge-dark relative">
          <div className="container mx-auto px-4 md:px-8">
            <div className="max-w-4xl mx-auto text-center mb-20 md:mb-32">
              <h2 className="font-jakarta text-4xl md:text-7xl mb-8 text-white tracking-tighter font-extrabold">
                {t('compare.recommend.title')}<span className="spot-dot scale-150 ml-4" />
              </h2>
              <p className="text-lg md:text-xl text-slate-400 leading-relaxed font-light font-inter">
                {t('compare.recommend.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* BRIDGE - Recommended */}
              <motion.div
                {...fadeInUp}
                className="p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border-2 border-bridge-secondary/40 bg-bridge-secondary/5 shadow-[0_0_80px_rgba(45,212,191,0.1)] relative"
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bridge-secondary text-bridge-dark px-6 py-2 rounded-full text-[10px] font-black tracking-[0.4em] uppercase shadow-2xl font-jakarta">
                  {t('compare.recommend.recommended')}
                </div>
                <div className="flex items-center gap-3 mb-6 mt-2">
                  <img src="/BridgeSpotsIcon.png" alt="BridgeSpots" className="w-8 h-8 rounded-lg" />
                  <h3 className="font-jakarta font-bold text-2xl text-white tracking-tight">BridgeSpots</h3>
                </div>
                <p className="text-slate-400 font-light mb-8 font-inter">{t('compare.recommend.bridge.desc')}</p>
                <ul className="space-y-4">
                  {['useCase1', 'useCase2', 'useCase3', 'useCase4'].map(key => (
                    <li key={key} className="flex items-start gap-3">
                      <Check size={18} className="text-bridge-secondary mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-slate-300 font-inter">{t(`compare.recommend.bridge.${key}`)}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Others */}
              <motion.div
                {...fadeInUp}
                transition={{ delay: 0.15, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/10 bg-white/5"
              >
                <h3 className="font-jakarta font-bold text-2xl text-white tracking-tight mb-6">{t('compare.recommend.others.title')}</h3>
                <p className="text-slate-400 font-light mb-8 font-inter">{t('compare.recommend.others.desc')}</p>
                <ul className="space-y-4">
                  {['useCase1', 'useCase2', 'useCase3', 'useCase4'].map(key => (
                    <li key={key} className="flex items-start gap-3">
                      <Minus size={18} className="text-slate-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-slate-500 font-inter">{t(`compare.recommend.others.${key}`)}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-48 md:py-64 relative overflow-hidden bg-bridge-obsidian border-t border-white/15 text-white text-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.08)_0%,transparent_70%)]" />
          <div className="relative z-10 max-w-5xl mx-auto px-8">
            <motion.h2
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2 }}
              className="font-jakarta text-5xl md:text-8xl lg:text-[10rem] mb-16 leading-none text-white tracking-tighter font-extrabold"
            >
              {t('compare.cta.titleLine1')}<br />
              <span className="text-outline">{t('compare.cta.titleLine2')}</span>
              <span className="spot-dot scale-[2]" />
            </motion.h2>
            <p className="text-xl md:text-2xl text-slate-400 mb-16 font-light max-w-3xl mx-auto leading-relaxed font-inter">
              {t('compare.cta.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-6">
              <button
                onClick={handleGetStarted}
                className="px-16 py-7 bg-bridge-secondary text-bridge-dark rounded-full font-black uppercase tracking-[0.5em] text-[12px] shadow-[0_0_80px_rgba(45,212,191,0.4)] hover:scale-105 transition-all duration-500 font-jakarta flex items-center gap-3 mx-auto sm:mx-0"
              >
                {t('compare.cta.startFree')} <ArrowRight size={18} />
              </button>
              <Link
                to="/landing"
                className="px-16 py-7 bg-white/5 border border-white/20 text-white rounded-full font-bold uppercase tracking-widest text-[12px] hover:bg-white/10 transition-all duration-500 font-jakarta flex items-center gap-3 mx-auto sm:mx-0"
              >
                {t('compare.cta.viewLanding')} <ExternalLink size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-bridge-obsidian text-slate-400 py-20 border-t border-white/15">
        <div className="container mx-auto px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <Link to="/landing" className="flex items-center gap-3">
              <img src="/BridgeSpotsIcon.png" alt="BridgeSpots" className="w-8 h-8 rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.4)]" />
              <div className="font-jakarta font-bold text-xl tracking-tighter">
                <span className="text-white">Bridge</span><span className="text-bridge-secondary">Spots</span><span className="spot-dot w-1.5 h-1.5 ml-1" />
              </div>
            </Link>
            <div className="flex items-center gap-8 text-[11px] font-bold tracking-wider uppercase font-jakarta">
              <Link to="/landing" className="hover:text-bridge-secondary transition-colors">{t('compare.footer.landing')}</Link>
              <Link to="/privacy" className="hover:text-bridge-secondary transition-colors">{t('compare.footer.privacy')}</Link>
              <Link to="/terms" className="hover:text-bridge-secondary transition-colors">{t('compare.footer.terms')}</Link>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/10 text-center text-[10px] tracking-[0.8em] uppercase font-black text-slate-700 font-jakarta">
            &copy; 2026 BridgeSpots. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ComparisonPage;
