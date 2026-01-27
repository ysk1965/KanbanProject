
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { HeroScene } from './components/BridgeScene';
import { KanbanDiagram, GanttDiagram, PriceComparisonDiagram, ResourcePulseDiagram } from './components/Diagrams';
import { motion, Variants } from 'framer-motion';
import { 
  ArrowRight, Menu, X, Layers, Layout, Zap, CheckCircle, 
  ShieldCheck, TrendingDown, DollarSign, Globe, Sparkles, 
  RefreshCcw, BarChart3, Clock, Users2, ShieldAlert, Activity
} from 'lucide-react';

const FeatureCard = ({ icon: Icon, title, desc, delay, highlight = false }: { icon: any, title: string, desc: string, delay: string, highlight?: boolean }) => (
  <motion.div 
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: parseFloat(delay), duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    className={`flex flex-col p-10 rounded-[3rem] border transition-all duration-700 group relative overflow-hidden ${
      highlight 
      ? 'bg-bridge-accent/10 border-bridge-accent/30 shadow-[0_0_80px_rgba(99,102,241,0.1)]' 
      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 shadow-2xl'
    }`}
  >
    {highlight && <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity"><Activity size={80} className="text-bridge-accent" /></div>}
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-10 border transition-all duration-700 ${
      highlight ? 'bg-bridge-accent text-white border-bridge-accent shadow-xl scale-110' : 'bg-white/5 text-bridge-secondary border-white/10 shadow-inner'
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

const App: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-bridge-dark text-slate-200 selection:bg-bridge-accent selection:text-white font-inter overflow-x-hidden">
      
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${scrolled ? 'glass border-b border-white/5 py-4' : 'bg-transparent py-8'}`}>
        <div className="container mx-auto px-8 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 bg-bridge-accent rounded-xl flex items-center justify-center text-white font-jakarta font-extrabold text-lg shadow-[0_0_20px_rgba(99,102,241,0.6)] group-hover:scale-110 transition-all duration-500">BS</div>
            <div className="font-jakarta font-bold text-2xl tracking-tighter transition-all duration-500">
              <span className="text-white">Bridge</span><span className="text-bridge-secondary">Spots</span><span className="spot-dot w-1.5 h-1.5 ml-1" />
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-12 text-[11px] font-bold tracking-[0.4em] text-slate-400 uppercase font-jakarta">
            <a href="#core" onClick={scrollToSection('core')} className="hover:text-white transition-all duration-300">Features</a>
            <a href="#comparison" onClick={scrollToSection('comparison')} className="hover:text-white transition-all duration-300">Comparison</a>
            <a href="#pricing" onClick={scrollToSection('pricing')} className="hover:text-white transition-all duration-300">Pricing</a>
            <button className="px-10 py-3.5 bg-white text-bridge-dark rounded-full hover:bg-bridge-secondary hover:shadow-[0_0_30px_rgba(45,212,191,0.5)] transition-all duration-500 font-extrabold tracking-widest text-[11px]">JOIN NOW</button>
          </div>

          <button className="md:hidden text-white p-2" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        <HeroScene />
        <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(10,14,23,0)_0%,rgba(10,14,23,0.3)_60%,#0A0E17_100%)]" />

        <div className="relative z-10 container mx-auto px-8 text-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="inline-block mb-10 px-8 py-3 border border-bridge-secondary/20 text-bridge-secondary text-[11px] font-bold tracking-[0.5em] uppercase rounded-full bg-bridge-secondary/5 backdrop-blur-xl shadow-2xl font-jakarta"
          >
            The Intelligent PM Orchestration
          </motion.div>
          
          <AnimatedTitle text="BridgeSpots" />
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3, duration: 1.2 }}
            className="max-w-4xl mx-auto text-xl md:text-3xl text-slate-300 font-normal leading-relaxed mb-16 px-4 font-inter opacity-90"
          >
            복잡한 워크플로우를 관통하는 명확한 <span className="text-bridge-secondary font-semibold">Flow</span>.<br/>
            가장 진화된 PM 전용 협업 인터페이스를 경험하세요.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="flex flex-col md:flex-row justify-center gap-6 mb-20"
          >
            <button className="px-16 py-7 bg-bridge-accent text-white rounded-full font-bold uppercase tracking-widest text-[12px] shadow-[0_0_60px_rgba(99,102,241,0.5)] hover:bg-white hover:text-bridge-dark transition-all transform hover:-translate-y-2 duration-500 flex items-center gap-3 mx-auto md:mx-0 font-jakarta">
              Try 7 Days Free Premium <ArrowRight size={20} />
            </button>
            <button className="px-16 py-7 bg-white/5 border border-white/10 text-white rounded-full font-bold uppercase tracking-widest text-[12px] shadow-xl backdrop-blur-md hover:bg-white/10 transition-all transform hover:-translate-y-1 duration-500 mx-auto md:mx-0 font-jakarta">
              Basic Board Forever Free
            </button>
          </motion.div>
        </div>
      </header>

      <main>
        {/* Core Values Section */}
        <section id="core" className="py-64 bg-bridge-obsidian/40 border-y border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-bridge-accent/5 blur-[250px] rounded-full -mr-96 -mt-96" />
          <div className="container mx-auto px-8">
            <div className="max-w-5xl mb-32">
               <div className="inline-block mb-10 text-[11px] font-bold tracking-[0.6em] text-bridge-secondary uppercase font-jakarta">Core Architecture</div>
               <h2 className="font-jakarta text-6xl md:text-9xl mb-12 leading-none text-white tracking-tighter font-extrabold">
                 협업의 흐름을<br/>정밀하게 조율하다<span className="spot-dot scale-150" />
               </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <FeatureCard 
                icon={Layers} 
                title="실무 중심 칸반 설계" 
                desc="'Feature → Task → Done' 구조 위에 팀만의 워크플로우를 자유롭게 얹으세요. 현직 PM들의 통찰을 녹여낸 가장 실용적인 협업 인터페이스입니다."
                delay="0.1"
                highlight
              />
              <FeatureCard 
                icon={RefreshCcw} 
                title="Gantt & Daily 통합" 
                desc="로드맵과 일간 스케줄이 실시간으로 동기화됩니다. 개별 작업의 변화가 팀 전체의 로드맵에 즉시 반영되는 유기적인 시스템입니다."
                delay="0.2"
              />
              <FeatureCard 
                icon={BarChart3} 
                title="지능형 통합 대시보드" 
                desc="팀원별 리소스 상태를 시각화하여 업무 쏠림을 방지합니다. 정체된 태스크를 자동으로 포착해 프로젝트 리스크를 사전에 관리하세요."
                delay="0.3"
              />
              <FeatureCard 
                icon={Zap} 
                title="투명한 무제한 모델" 
                desc="핵심 협업 기능은 평생 무료입니다. 추가 결제 없이 모든 프리미엄 기능을 인당 $5로 누릴 수 있는 유일한 모델입니다."
                delay="0.4"
              />
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
                    <span className="tracking-[0.4em]">PREMIUM 7 DAYS FREE TRIAL</span>
                  </div>
                </div>
                <h2 className="font-jakarta text-7xl md:text-[11rem] mb-16 text-white tracking-tighter leading-none font-extrabold">
                  Price.<br/>Reinvented<span className="spot-dot scale-150" />
                </h2>
                <div className="bg-bridge-obsidian/60 backdrop-blur-3xl rounded-[3rem] p-12 border border-white/10 max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-center gap-12">
                  <RefreshCcw size={48} className="text-bridge-secondary animate-spin-slow flex-shrink-0" />
                  <p className="text-left text-xl leading-relaxed text-slate-300 font-inter font-light">
                    <strong className="text-white block mb-3 font-jakarta text-2xl font-bold italic">Continuous Momentum.</strong>
                    7일 후 결제를 원하지 않으셔도 <span className="text-bridge-secondary font-bold">무제한 무료 보드(Basic)</span>로 자동 전환되어 데이터와 협업 흐름은 영구적으로 안전하게 보존됩니다.
                  </p>
                </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-6xl mx-auto items-stretch">
                <div className="p-16 bg-white/5 backdrop-blur-xl rounded-[4rem] border border-white/10 flex flex-col items-center text-center hover:bg-white/10 transition-all duration-700">
                  <span className="text-[12px] font-black text-slate-500 uppercase tracking-[0.6em] mb-12 font-jakarta">Basic Spots</span>
                  <div className="flex items-baseline gap-2 mb-8">
                    <span className="text-8xl font-jakarta font-extrabold text-white">Free</span>
                  </div>
                  <p className="text-lg text-slate-500 mb-16 font-inter">Infinite Collaboration. Zero Cost.</p>
                  <ul className="text-base space-y-8 text-slate-400 mb-20 text-left w-full border-t border-white/5 pt-16 font-light font-inter">
                    <li className="flex items-center gap-5"><CheckCircle size={22} className="text-bridge-secondary/50" /> 핵심 칸반 아키텍처 무제한</li>
                    <li className="flex items-center gap-5"><CheckCircle size={22} className="text-bridge-secondary/50" /> 실시간 데이터 동기화 및 팀 공유</li>
                    <li className="flex items-center gap-5 text-slate-700 line-through"><CheckCircle size={22} /> 지능형 대시보드 및 정체 감지</li>
                  </ul>
                  <button className="w-full py-8 bg-white/10 border border-white/10 rounded-full text-[12px] font-black uppercase tracking-widest text-white hover:bg-white hover:text-bridge-dark transition-all font-jakarta">START FREE</button>
                </div>

                <div className="p-16 bg-bridge-slate rounded-[4rem] border-2 border-bridge-secondary/40 shadow-[0_0_120px_rgba(45,212,191,0.2)] flex flex-col items-center text-center transform scale-105 relative z-10 transition-all duration-700">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bridge-secondary text-bridge-dark px-14 py-4 rounded-full text-[12px] font-black tracking-[0.5em] uppercase shadow-2xl font-jakarta">Premium Spots</div>
                  <div className="flex items-baseline gap-3 mb-8">
                    <span className="text-4xl text-bridge-secondary font-jakarta font-bold">$</span>
                    <span className="text-9xl font-jakarta font-extrabold text-white">5</span>
                  </div>
                  <p className="text-lg text-slate-400 mb-16 font-inter">per user / month (Annual $50)</p>
                  <ul className="text-base space-y-8 text-slate-100 mb-20 text-left w-full border-t border-white/10 pt-16 font-medium font-inter">
                    <li className="flex items-center gap-5 text-bridge-secondary font-bold"><CheckCircle size={26} /> 지능형 PM 대시보드 무제한 접근</li>
                    <li className="flex items-center gap-5"><CheckCircle size={26} className="text-bridge-secondary" /> 리소스 병목 및 정체 자동 알림</li>
                    <li className="flex items-center gap-5"><CheckCircle size={26} className="text-bridge-secondary" /> Gantt & Daily 통합 뷰 무제한</li>
                    <li className="flex items-center gap-5"><CheckCircle size={26} className="text-bridge-secondary" /> 고급 팀 권한 오케스트레이션</li>
                  </ul>
                  <button className="w-full py-9 bg-bridge-secondary text-bridge-dark rounded-full text-[12px] font-black uppercase tracking-widest shadow-2xl hover:shadow-[0_0_80px_rgba(45,212,191,0.7)] transition-all transform hover:scale-[1.03] font-jakarta">START TRIAL</button>
                </div>
             </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-72 relative overflow-hidden bg-bridge-dark text-white text-center">
           <HeroScene />
           <div className="absolute inset-0 bg-gradient-to-t from-bridge-dark via-transparent to-bridge-dark" />
           <div className="relative z-10 max-w-6xl mx-auto px-8">
              <motion.h2 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2 }}
                className="font-jakarta text-7xl md:text-[13rem] mb-20 leading-none text-white tracking-tighter font-extrabold"
              >
                Connect<br/><span className="text-outline">Everything</span><span className="spot-dot scale-[2]" />
              </motion.h2>
              <p className="text-3xl text-slate-400 mb-24 font-light max-w-5xl mx-auto leading-relaxed font-inter">
                BridgeSpots와 함께 단순한 작업 관리를 넘어 <br/>
                팀의 무한한 생산성을 지능적으로 오케스트레이션하세요.
              </p>
              <button className="px-24 py-10 bg-white text-bridge-dark rounded-full font-black uppercase tracking-[0.7em] text-[13px] shadow-[0_0_120px_rgba(255,255,255,0.25)] hover:scale-110 transition-all duration-700 font-jakarta">LAUNCH FLOW</button>
           </div>
        </section>
      </main>

      <footer className="bg-bridge-obsidian text-slate-500 py-48 border-t border-white/5">
        <div className="container mx-auto px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-24 mb-32">
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-3 mb-12">
                 <div className="w-10 h-10 bg-bridge-accent rounded-xl flex items-center justify-center text-white font-jakarta font-bold text-xl">BS</div>
                 <div className="font-jakarta font-bold text-3xl tracking-tighter">
                   <span className="text-white">Bridge</span><span className="text-bridge-secondary">Spots</span><span className="spot-dot w-2 h-2 ml-1" />
                 </div>
              </div>
              <p className="text-lg leading-relaxed text-slate-500 font-normal font-inter">
                Built by PMs for Absolute Mastery. <br/>Precision Collaboration, Redefined.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-white mb-10 text-[11px] uppercase tracking-[0.5em] font-jakarta">Ecosystem</h4>
              <ul className="text-lg space-y-6 font-light font-inter">
                <li><a href="#" className="hover:text-bridge-secondary transition-all">Templates</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">Integrations</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">API Guide</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-10 text-[11px] uppercase tracking-[0.5em] font-jakarta">Community</h4>
              <ul className="text-lg space-y-6 font-light font-inter">
                <li><a href="#" className="hover:text-bridge-secondary transition-all">LinkedIn</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">Twitter / X</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">Slack Group</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-10 text-[11px] uppercase tracking-[0.5em] font-jakarta">Mission</h4>
              <ul className="text-lg space-y-6 font-light font-inter">
                <li><a href="#" className="hover:text-bridge-secondary transition-all">Manifesto</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">Privacy</a></li>
                <li><a href="#" className="hover:text-bridge-secondary transition-all">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-20 border-t border-white/5 text-center text-[11px] tracking-[0.8em] uppercase font-black text-slate-700 font-jakarta">
            © 2026 BRIDGESPOTS INC. ORCHESTRATING SUPREME FLOW.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
