import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Columns, Calendar, Clock, CheckCircle2, TrendingDown, Users2, ShieldAlert, Hash, AtSign, Bell, MessageSquare, ListChecks, GripVertical, ChevronRight, Sparkles, FileText, ListTodo, Home, Flame, BookHeart, LayoutGrid, Flag, Mic, Volume2, Archive, CalendarClock, Zap } from 'lucide-react';

// --- RESOURCE PULSE DIAGRAM (PM Dashboard View) ---
export const ResourcePulseDiagram: React.FC = () => {
  const team = [
    { name: 'Alice (Dev)', load: 85, status: 'Overheat', color: 'text-red-400' },
    { name: 'Bob (PM)', load: 45, status: 'Idle', color: 'text-bridge-secondary' },
    { name: 'Charlie (Design)', load: 65, status: 'Normal', color: 'text-indigo-400' },
  ];

  return (
    <div className="flex flex-col p-10 bg-bridge-obsidian rounded-[3.5rem] border border-white/20 shadow-3xl w-full text-stone-100 overflow-hidden relative font-inter">
      <div className="flex justify-between items-center mb-12">
        <h3 className="font-jakarta font-bold text-2xl text-white flex items-center gap-4 tracking-tight">
          <Users2 size={22} className="text-bridge-accent" />
          Resource Intelligence
        </h3>
        <div className="flex items-center gap-3 px-4 py-2 bg-red-400/10 border border-red-400/20 rounded-full">
          <ShieldAlert size={14} className="text-red-400 animate-pulse" />
          <span className="text-[10px] font-extrabold text-red-400 uppercase tracking-widest">Bottlenecks detected</span>
        </div>
      </div>

      <div className="space-y-10">
        {team.map((member, i) => (
          <div key={i} className="space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <span className="text-lg font-bold text-white block mb-1">{member.name}</span>
                <span className={`text-[10px] font-extrabold uppercase tracking-[0.2em] ${member.color}`}>{member.status}</span>
              </div>
              <span className="text-xs font-mono text-slate-400">{member.load}% Load</span>
            </div>
            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${member.load}%` }}
                transition={{ duration: 1.5, delay: i * 0.2, ease: "circOut" }}
                className={`h-full rounded-full ${
                  member.status === 'Overheat' ? 'bg-red-400 shadow-[0_0_15px_rgba(248,113,113,0.3)]' :
                  member.status === 'Normal' ? 'bg-indigo-400' : 'bg-bridge-secondary shadow-[0_0_15px_rgba(45,212,191,0.3)]'
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 pt-8 border-t border-white/15 grid grid-cols-2 gap-4">
        <div className="p-5 bg-white/5 rounded-3xl border border-white/15">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-2">Sprint Health</span>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-bridge-secondary shadow-[0_0_10px_rgba(45,212,191,0.5)]" />
            <span className="text-2xl font-jakarta font-extrabold text-white tracking-tighter">94.2%</span>
          </div>
        </div>
        <div className="p-5 bg-white/5 rounded-3xl border border-red-400/10">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-2 text-red-400/80">Risk Level</span>
          <div className="flex items-center gap-2">
             <span className="text-2xl font-jakarta font-extrabold text-red-400 tracking-tighter">Low</span>
             <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">3 Alerts</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- PRICE COMPARISON DIAGRAM ---
export const PriceComparisonDiagram: React.FC = () => {
  return (
    <div className="flex flex-col p-10 bg-bridge-obsidian rounded-[3rem] border border-white/20 shadow-2xl w-full text-stone-100 overflow-hidden relative font-inter">
      <div className="absolute top-0 right-0 p-8">
        <TrendingDown size={40} className="text-bridge-secondary opacity-20" />
      </div>
      <h3 className="font-jakarta font-bold text-2xl mb-12 text-white flex items-center gap-4 tracking-tight">
        Annual Market Cost
      </h3>

      <div className="space-y-12">
        {[
          { name: 'Flow.team', cost: 72, color: 'bg-slate-700' },
          { name: 'Trello Premium', cost: 60, color: 'bg-slate-600' },
          { name: 'BridgeSpots Premium', cost: 50, color: 'bg-bridge-secondary', highlight: true },
        ].map((item, i) => (
          <div key={i} className="space-y-3">
            <div className="flex justify-between text-[11px] font-extrabold uppercase tracking-[0.15em]">
              <span className={item.highlight ? 'text-bridge-secondary' : 'text-slate-400'}>{item.name}</span>
              <span className={item.highlight ? 'text-white' : 'text-slate-400'}>${item.cost} / Year</span>
            </div>
            <div className="h-4 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${(item.cost / 80) * 100}%` }}
                transition={{ duration: 1.5, delay: i * 0.2, ease: "circOut" }}
                className={`h-full rounded-full ${item.color} ${item.highlight ? 'shadow-[0_0_20px_rgba(45,212,191,0.4)]' : ''}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 p-6 bg-bridge-secondary/5 rounded-2xl border border-bridge-secondary/10 text-center">
        <p className="text-sm text-bridge-secondary font-semibold font-jakarta italic">"Market disruption: Zero cost for core kanban features."</p>
      </div>
    </div>
  );
};

// --- KANBAN BOARD DIAGRAM ---
export const KanbanDiagram: React.FC = () => {
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Identity System', status: 'Task', color: 'bg-indigo-600/30 border-indigo-500/50' },
    { id: 2, title: 'API Flow Engine', status: 'In Progress', color: 'bg-indigo-600 border-indigo-500' },
    { id: 3, title: 'Security Audit', status: 'Review', color: 'bg-teal-600 border-teal-500' },
    { id: 4, title: 'UI Core Render', status: 'Done', color: 'bg-bridge-secondary border-bridge-secondary text-bridge-dark' },
  ]);

  const moveTask = (id: number) => {
    const statuses = ['Task', 'In Progress', 'Review', 'Done'];
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const nextIdx = (statuses.indexOf(t.status) + 1) % statuses.length;
        return { ...t, status: statuses[nextIdx] };
      }
      return t;
    }));
  };

  return (
    <div className="flex flex-col items-center p-8 bg-bridge-obsidian rounded-[2.5rem] border border-white/15 shadow-2xl w-full font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-8 text-white flex items-center gap-4 tracking-tight">
        <Columns size={22} className="text-bridge-accent" />
        Core Orchestration Flow
      </h3>

      <div className="grid grid-cols-4 gap-3 w-full">
        {['Task', 'In Progress', 'Review', 'Done'].map(status => (
          <div key={status} className={`flex flex-col gap-3 min-h-[180px] p-3 rounded-2xl border transition-all ${
            ['Task', 'In Progress', 'Done'].includes(status) ? 'bg-white/5 border-white/20' : 'bg-bridge-accent/5 border-bridge-accent/20'
          }`}>
            <span className={`text-[10px] font-extrabold uppercase tracking-[0.2em] text-center mb-2 ${
              ['Task', 'In Progress', 'Done'].includes(status) ? 'text-slate-400' : 'text-bridge-accent'
            }`}>{status}</span>
            <AnimatePresence mode="popLayout">
              {tasks.filter(t => t.status === status).map(task => (
                <motion.div
                  key={task.id}
                  layoutId={String(task.id)}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => moveTask(task.id)}
                  className={`p-3 rounded-xl shadow-xl border cursor-pointer ${task.color} text-[11px] font-bold tracking-tight hover:brightness-110 transition-all flex justify-between items-center group font-jakarta`}
                >
                  <span className="truncate pr-1">{task.title}</span>
                  {status === 'Done' && <CheckCircle2 size={12} className="flex-shrink-0" />}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- GANTT CHART DIAGRAM ---
export const GanttDiagram: React.FC = () => {
  return (
    <div className="flex flex-col p-10 bg-bridge-dark rounded-[2.5rem] border border-white/20 shadow-2xl w-full text-stone-100 overflow-hidden font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-10 text-bridge-secondary flex items-center gap-4 tracking-tight">
        <Calendar size={22} className="text-bridge-secondary" />
        Unified Roadmap
      </h3>

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-8 gap-1.5 border-b border-white/15 pb-5">
          <div className="col-span-2 text-[10px] text-stone-600 font-extrabold uppercase tracking-widest">Milestone</div>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
            <div key={i} className="text-center text-[10px] text-stone-600 font-extrabold">{day}</div>
          ))}
        </div>

        {[
          { name: 'Auth Sprint', color: 'bg-white/10', start: 0, span: 5, type: 'feature' },
          { name: 'Identity Engine', color: 'bg-indigo-500', start: 1, span: 3, type: 'task' },
          { name: 'Security Audit', color: 'bg-bridge-secondary', start: 3, span: 4, type: 'task' },
        ].map((item, i) => (
          <div key={i} className="grid grid-cols-8 gap-1.5 items-center">
            <div className={`col-span-2 text-[11px] ${item.type === 'task' ? 'pl-4 text-stone-500 font-medium' : 'font-bold text-stone-300'}`}>
              {item.type === 'task' ? '- ' : '* '}{item.name}
            </div>
            <div className="col-span-6 h-6 relative bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${(item.span / 6) * 100}%`, left: `${(item.start / 6) * 100}%` }}
                transition={{ duration: 1.2, delay: i * 0.15, ease: "circOut" }}
                className={`absolute top-1 bottom-1 rounded-full ${item.color} ${item.type === 'feature' ? 'opacity-30 border border-white/20' : 'shadow-[0_0_15px_rgba(99,102,241,0.2)]'}`}
              >
                {item.type === 'task' && <div className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full opacity-60 shadow-[0_0_8px_white]" />}
              </motion.div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- DAILY SCHEDULE DIAGRAM ---
export const DailyScheduleDiagram: React.FC = () => {
  return (
    <div className="flex flex-col p-8 bg-bridge-obsidian rounded-[2.5rem] border border-white/20 shadow-2xl w-full max-w-md mx-auto font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-6 text-white flex items-center gap-3 tracking-tight">
        <Clock size={20} className="text-bridge-secondary" />
        Daily Temporal Flow
      </h3>

      <div className="flex gap-6">
        <div className="flex flex-col gap-10 text-[9px] text-stone-700 font-bold py-2 tracking-widest">
          <span>09:00</span>
          <span>10:30</span>
          <span>12:00</span>
        </div>
        <div className="flex-1 space-y-3">
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            className="h-16 bg-indigo-500/10 border-l-2 border-indigo-500 p-3 rounded-r-lg flex flex-col justify-center"
          >
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Logic Alignment</span>
            <span className="text-[9px] text-indigo-300/60 font-mono">09:00 - 10:15</span>
          </motion.div>
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="h-12 bg-white/5 border-l-2 border-stone-700 p-3 rounded-r-lg flex flex-col justify-center"
          >
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Focused Build</span>
            <span className="text-[9px] text-stone-600 font-mono">10:15 - 11:30</span>
          </motion.div>
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="h-12 bg-bridge-secondary/10 border-l-2 border-bridge-secondary p-3 rounded-r-lg flex flex-col justify-center"
          >
            <span className="text-[10px] font-bold text-bridge-secondary uppercase tracking-widest mb-1">Unified Review</span>
            <span className="text-[9px] text-bridge-secondary/60 font-mono">11:30 - 12:30</span>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// --- DAILY CHECKLIST DIAGRAM (v9.0) ---
export const DailyChecklistDiagram: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState([
    { id: 1, text: t('diagrams.checklistItem1'), member: 'Alice', done: false, priority: 1 },
    { id: 2, text: t('diagrams.checklistItem2'), member: 'Alice', done: true, priority: 2 },
    { id: 3, text: t('diagrams.checklistItem3'), member: 'Bob', done: false, priority: 1 },
    { id: 4, text: t('diagrams.checklistItem4'), member: 'Bob', done: false, priority: 2 },
    { id: 5, text: t('diagrams.checklistItem5'), member: 'Bob', done: true, priority: 3 },
  ]);

  const toggleItem = (id: number) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, done: !item.done } : item
    ));
  };

  const members = ['Alice', 'Bob'];

  return (
    <div className="flex flex-col p-8 bg-bridge-obsidian rounded-[2.5rem] border border-white/20 shadow-2xl w-full max-w-md mx-auto font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-6 text-white flex items-center gap-3 tracking-tight">
        <ListChecks size={20} className="text-bridge-secondary" />
        Daily Checklist
      </h3>

      <div className="grid grid-cols-2 gap-4">
        {members.map(member => (
          <div key={member} className="space-y-2">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400 mb-3 text-center">{member}</div>
            {items.filter(i => i.member === member).map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ x: 20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.08 }}
                onClick={() => toggleItem(item.id)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all group ${
                  item.done
                    ? 'bg-bridge-secondary/5 border-bridge-secondary/20'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <GripVertical size={10} className="text-slate-700 flex-shrink-0" />
                <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  item.done ? 'bg-bridge-secondary border-bridge-secondary' : 'border-slate-600 group-hover:border-slate-400'
                }`}>
                  {item.done && <CheckCircle2 size={10} className="text-bridge-dark" />}
                </div>
                <span className={`text-[10px] font-medium truncate transition-all ${
                  item.done ? 'text-slate-600 line-through' : 'text-slate-300'
                }`}>{item.text}</span>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// --- SLACK NOTIFICATION DIAGRAM ---
export const SlackNotificationDiagram: React.FC = () => {
  const { t } = useTranslation();
  const triggers = [
    { icon: AtSign, label: '@Mention', desc: t('diagrams.slackMention'), color: 'text-bridge-accent', bg: 'bg-bridge-accent/10 border-bridge-accent/20' },
    { icon: ListChecks, label: 'Assigned', desc: t('diagrams.slackAssigned'), color: 'text-bridge-secondary', bg: 'bg-bridge-secondary/10 border-bridge-secondary/20' },
    { icon: MessageSquare, label: 'Comment', desc: t('diagrams.slackComment'), color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/20' },
  ];

  const [prefs, setPrefs] = useState({ inApp: true, slack: true, mention: true });

  return (
    <div className="flex flex-col p-10 bg-bridge-obsidian rounded-[2.5rem] border border-white/20 shadow-2xl w-full text-stone-100 overflow-hidden relative font-inter">
      <h3 className="font-jakarta font-bold text-2xl mb-10 text-white flex items-center gap-4 tracking-tight">
        <Bell size={22} className="text-bridge-accent" />
        Notification Flow
      </h3>

      {/* Trigger → Slack Flow */}
      <div className="flex flex-col lg:flex-row items-center gap-6 mb-10">
        {/* Triggers */}
        <div className="flex-1 space-y-3 w-full">
          {triggers.map((t, i) => (
            <motion.div
              key={i}
              initial={{ x: -20, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-3 p-3.5 rounded-xl border ${t.bg}`}
            >
              <t.icon size={16} className={t.color} />
              <div className="flex-1 min-w-0">
                <span className={`text-[11px] font-bold block ${t.color}`}>{t.label}</span>
                <span className="text-[9px] text-slate-500">{t.desc}</span>
              </div>
              <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
            </motion.div>
          ))}
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center gap-2 py-4 lg:py-0">
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
            className="w-12 h-12 rounded-2xl bg-bridge-accent/10 border border-bridge-accent/30 flex items-center justify-center"
          >
            <span className="font-jakarta font-extrabold text-[10px] text-bridge-accent">BS</span>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-slate-600 rotate-90 lg:rotate-0"
          >
            <ChevronRight size={18} />
          </motion.div>
        </div>

        {/* Slack Preview */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex-1 w-full"
        >
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Hash size={14} className="text-slate-500" />
              <span className="text-[11px] font-bold text-slate-400">project-alpha</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
              <div className="w-7 h-7 rounded-lg bg-bridge-accent flex items-center justify-center flex-shrink-0">
                <span className="text-[8px] font-extrabold text-white font-jakarta">BS</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-white">BridgeSpots</span>
                  <span className="text-[8px] text-slate-600">12:34 PM</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  <span className="text-bridge-accent font-semibold">@Alice</span> mentioned you in <span className="text-white font-medium">API Flow Engine</span>
                </p>
                <p className="text-[9px] text-slate-600 mt-1 italic">"{t('diagrams.slackQuote')}"</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Preference Toggles */}
      <div className="pt-8 border-t border-white/10">
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Per-Board Preferences</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'inApp' as const, label: 'In-App', active: prefs.inApp },
            { key: 'slack' as const, label: 'Slack', active: prefs.slack },
            { key: 'mention' as const, label: '@Mention', active: prefs.mention },
          ].map(pref => (
            <button
              key={pref.key}
              onClick={() => setPrefs(p => ({ ...p, [pref.key]: !p[pref.key] }))}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-[10px] font-bold transition-all ${
                pref.active
                  ? 'bg-bridge-accent/10 border-bridge-accent/30 text-bridge-accent'
                  : 'bg-white/5 border-white/10 text-slate-600'
              }`}
            >
              <div className={`w-6 h-3.5 rounded-full relative transition-all ${pref.active ? 'bg-bridge-accent' : 'bg-slate-700'}`}>
                <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${pref.active ? 'right-0.5' : 'left-0.5'}`} />
              </div>
              {pref.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- AI REPORT DIAGRAM ---
export const AIReportDiagram: React.FC = () => {
  const [reportTab, setReportTab] = useState<'personal' | 'team'>('personal');

  const dataSources = [
    { icon: ListTodo, label: 'Tasks', metric: '24 completed', color: 'text-bridge-accent', bg: 'bg-bridge-accent/10 border-bridge-accent/20' },
    { icon: Clock, label: 'Time Blocks', metric: '38.5 hours', color: 'text-bridge-secondary', bg: 'bg-bridge-secondary/10 border-bridge-secondary/20' },
    { icon: CheckCircle2, label: 'Checklists', metric: '89% done', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
    { icon: MessageSquare, label: 'Comments', metric: '47 threads', color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/20' },
  ];

  const personalReport = [
    { type: 'feature', text: 'Authentication Sprint' },
    { type: 'narrative', text: 'Your focus shifted from API design (Mon-Tue) to security hardening (Wed-Fri), indicating a natural progression from architecture to resilience.' },
    { type: 'insight', text: 'The 6-hour gap between Identity Engine and Security Audit suggests a dependency bottleneck worth addressing next sprint.' },
  ];

  const teamReport = [
    { type: 'feature', text: 'Team Dynamics Overview' },
    { type: 'narrative', text: "Alice carried 42% of the sprint load while Bob's contributions dropped 30% mid-week — likely blocked by the pending API review." },
    { type: 'insight', text: 'Cross-functional handoffs between Design and Dev averaged 1.8 days. Reducing this to < 1 day could accelerate delivery by ~20%.' },
  ];

  const activeReport = reportTab === 'personal' ? personalReport : teamReport;

  return (
    <div className="flex flex-col p-10 bg-bridge-obsidian rounded-[2.5rem] border border-white/20 shadow-2xl w-full text-stone-100 overflow-hidden relative font-inter">
      <h3 className="font-jakarta font-bold text-2xl mb-10 text-white flex items-center gap-4 tracking-tight">
        <Sparkles size={22} className="text-bridge-accent" />
        AI Report Engine
      </h3>

      {/* Data Sources */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {dataSources.map((src, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className={`flex items-center gap-3 p-3 rounded-xl border ${src.bg}`}
          >
            <src.icon size={16} className={src.color} />
            <div className="min-w-0">
              <span className={`text-[10px] font-bold block ${src.color}`}>{src.label}</span>
              <span className="text-[9px] text-slate-500">{src.metric}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* AI Processing Indicator */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-center gap-3 py-4 mb-8 border-y border-white/10"
      >
        <div className="relative">
          <Sparkles size={18} className="text-bridge-accent animate-pulse" />
          <div className="absolute inset-0 bg-bridge-accent/20 blur-xl rounded-full" />
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-bridge-accent font-jakarta">Claude AI Analyzing</span>
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              className="w-1.5 h-1.5 rounded-full bg-bridge-accent"
            />
          ))}
        </div>
      </motion.div>

      {/* Report Tab Toggle */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-white/5 border border-white/10 rounded-2xl p-1.5">
          <button
            onClick={() => setReportTab('personal')}
            className={`px-5 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all font-jakarta ${
              reportTab === 'personal'
                ? 'bg-bridge-accent text-white shadow-lg'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Personal
          </button>
          <button
            onClick={() => setReportTab('team')}
            className={`px-5 py-2 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all font-jakarta ${
              reportTab === 'team'
                ? 'bg-bridge-secondary text-bridge-dark shadow-lg'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Team
          </button>
        </div>
      </div>

      {/* Report Preview */}
      <AnimatePresence mode="wait">
        <motion.div
          key={reportTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <FileText size={14} className={reportTab === 'personal' ? 'text-bridge-accent' : 'text-bridge-secondary'} />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 font-jakarta">
              {reportTab === 'personal' ? 'Personal Report' : 'Team Report'} — Feb 3-9, 2026
            </span>
          </div>

          {activeReport.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              {item.type === 'feature' && (
                <div className={`text-[11px] font-bold font-jakarta pl-3 border-l-2 ${
                  reportTab === 'personal' ? 'text-bridge-accent border-bridge-accent' : 'text-bridge-secondary border-bridge-secondary'
                }`}>
                  {item.text}
                </div>
              )}
              {item.type === 'narrative' && (
                <p className="text-[11px] text-slate-400 leading-relaxed pl-3">
                  {item.text}
                </p>
              )}
              {item.type === 'insight' && (
                <div className={`text-[10px] leading-relaxed p-3 rounded-lg border-l-2 ${
                  reportTab === 'personal'
                    ? 'bg-bridge-accent/5 border-bridge-accent/50 text-slate-300'
                    : 'bg-bridge-secondary/5 border-bridge-secondary/50 text-slate-300'
                }`}>
                  {item.text}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// --- MY SPACE OVERVIEW DIAGRAM ---
export const MySpaceOverviewDiagram: React.FC = () => {
  return (
    <div className="flex flex-col p-8 bg-bridge-obsidian rounded-[2.5rem] border border-white/20 shadow-2xl w-full font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-6 text-white flex items-center gap-3 tracking-tight">
        <Home size={20} className="text-bridge-secondary" />
        My Space Overview
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {/* Schedule Widget */}
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0 }}
          className="p-4 bg-white/5 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-bridge-secondary" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Today</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              <div className="h-2 bg-indigo-500/20 rounded-full flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-bridge-secondary" />
              <div className="h-2 bg-bridge-secondary/20 rounded-full w-3/4" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              <div className="h-2 bg-purple-500/20 rounded-full w-1/2" />
            </div>
            <div className="text-[10px] text-slate-500 mt-1">3 events</div>
          </div>
        </motion.div>

        {/* Deadlines Widget */}
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.08 }}
          className="p-4 bg-white/5 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <Flag size={14} className="text-red-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Deadlines</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded flex-shrink-0">D-2</span>
              <span className="text-[10px] text-slate-300 truncate">Design Review</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded flex-shrink-0">D-5</span>
              <span className="text-[10px] text-slate-300 truncate">API Spec</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold text-slate-400 bg-white/5 px-1.5 py-0.5 rounded flex-shrink-0">D-12</span>
              <span className="text-[10px] text-slate-300 truncate">Sprint Review</span>
            </div>
          </div>
        </motion.div>

        {/* Habits Widget */}
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.16 }}
          className="p-4 bg-white/5 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <Flame size={14} className="text-purple-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Habits</span>
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            {['bg-purple-500', 'bg-indigo-500', 'bg-emerald-500'].map((c, i) => (
              <div key={i} className={`w-6 h-6 rounded-lg ${c} flex items-center justify-center`}>
                <CheckCircle2 size={10} className="text-white" />
              </div>
            ))}
            <div className="w-6 h-6 rounded-lg bg-white/10 border border-white/20" />
          </div>
          <div className="text-[10px] text-slate-500">3/4 today</div>
        </motion.div>

        {/* Diary Widget */}
        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.24 }}
          className="p-4 bg-white/5 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <BookHeart size={14} className="text-pink-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Diary</span>
          </div>
          <div className="text-2xl mb-1">😊</div>
          <div className="text-[10px] text-slate-500 mb-1">Today's mood</div>
          <div className="flex items-center gap-1">
            <Sparkles size={10} className="text-bridge-accent" />
            <span className="text-[9px] text-bridge-accent">AI insights ready</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// --- EISENHOWER MATRIX DIAGRAM ---
export const EisenhowerDiagram: React.FC = () => {
  const [tasks, setTasks] = useState([
    { id: 1, title: 'Ship Auth Module', quadrant: 'q1', dday: 'D-1' },
    { id: 2, title: 'Plan Q2 Roadmap', quadrant: 'q2', dday: 'D-7' },
    { id: 3, title: 'Fix Typo in Docs', quadrant: 'q3', dday: 'D-0' },
    { id: 4, title: 'Clean Old Branches', quadrant: 'q4', dday: '' },
    { id: 5, title: 'Security Audit', quadrant: 'q1', dday: 'D-2' },
    { id: 6, title: 'Learn GraphQL', quadrant: 'q2', dday: 'D-14' },
  ]);

  const quadrants = ['q1', 'q2', 'q3', 'q4'];

  const cycleTask = (id: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const next = (quadrants.indexOf(t.quadrant) + 1) % 4;
        return { ...t, quadrant: quadrants[next] };
      }
      return t;
    }));
  };

  const quadrantConfig: Record<string, { label: string; sublabel: string; icon: React.ElementType; color: string; border: string; bg: string }> = {
    q1: { label: 'Do First', sublabel: 'Urgent & Important', icon: Flame, color: 'text-red-400', border: 'border-red-500/20', bg: 'bg-red-500/5' },
    q2: { label: 'Schedule', sublabel: 'Important', icon: CalendarClock, color: 'text-bridge-accent', border: 'border-bridge-accent/20', bg: 'bg-bridge-accent/5' },
    q3: { label: 'Delegate', sublabel: 'Urgent', icon: Zap, color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' },
    q4: { label: 'Eliminate', sublabel: 'Neither', icon: Archive, color: 'text-slate-400', border: 'border-white/10', bg: 'bg-white/5' },
  };

  return (
    <div className="flex flex-col p-8 bg-bridge-obsidian rounded-[2.5rem] border border-white/20 shadow-2xl w-full font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-6 text-white flex items-center gap-3 tracking-tight">
        <LayoutGrid size={20} className="text-bridge-accent" />
        Eisenhower Matrix
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {quadrants.map(q => {
          const cfg = quadrantConfig[q];
          const Icon = cfg.icon;
          return (
            <div key={q} className={`p-3 rounded-2xl border ${cfg.border} ${cfg.bg} min-h-[120px]`}>
              <div className="flex items-center gap-2 mb-3">
                <Icon size={14} className={cfg.color} />
                <div>
                  <span className={`text-[10px] font-extrabold uppercase tracking-[0.15em] ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-[8px] text-slate-600 block">{cfg.sublabel}</span>
                </div>
              </div>
              <AnimatePresence mode="popLayout">
                {tasks.filter(t => t.quadrant === q).map(task => (
                  <motion.div
                    key={task.id}
                    layoutId={`eisenhower-${task.id}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => cycleTask(task.id)}
                    className="flex items-center justify-between gap-2 p-2 mb-1.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-all"
                  >
                    <span className="text-[10px] font-medium text-slate-300 truncate">{task.title}</span>
                    {task.dday && (
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                        task.dday === 'D-0' ? 'bg-red-500/15 text-red-400' :
                        task.dday === 'D-1' || task.dday === 'D-2' ? 'bg-orange-500/15 text-orange-400' :
                        'bg-white/5 text-slate-400'
                      }`}>{task.dday}</span>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- HABIT TRACKER DIAGRAM ---
export const HabitTrackerDiagram: React.FC = () => {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const [habits, setHabits] = useState([
    { name: '🏃 Running', color: '#8B5CF6', streak: 12, completions: [true, true, true, false, true, true, false] },
    { name: '📚 Reading', color: '#6366F1', streak: 8, completions: [true, true, false, true, true, false, false] },
    { name: '💧 Water 2L', color: '#10B981', streak: 23, completions: [true, true, true, true, true, true, true] },
    { name: '🧘 Meditate', color: '#EC4899', streak: 5, completions: [true, false, true, true, false, false, false] },
  ]);

  const toggleDay = (habitIdx: number, dayIdx: number) => {
    setHabits(prev => prev.map((h, i) => {
      if (i === habitIdx) {
        const newCompletions = [...h.completions];
        newCompletions[dayIdx] = !newCompletions[dayIdx];
        return { ...h, completions: newCompletions };
      }
      return h;
    }));
  };

  return (
    <div className="flex flex-col p-8 bg-bridge-obsidian rounded-[2.5rem] border border-white/20 shadow-2xl w-full font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-6 text-white flex items-center gap-3 tracking-tight">
        <Flame size={20} className="text-purple-400" />
        Habit Tracker
      </h3>

      {/* Day headers */}
      <div className="grid grid-cols-[1fr_repeat(7,_minmax(0,_1fr))_auto] gap-2 mb-3 items-center">
        <div />
        {days.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-extrabold text-slate-600 uppercase">{d}</div>
        ))}
        <div className="text-[9px] font-extrabold text-slate-600 uppercase text-center w-12">Streak</div>
      </div>

      {/* Habit rows */}
      {habits.map((habit, hIdx) => (
        <motion.div
          key={hIdx}
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: hIdx * 0.08 }}
          className="grid grid-cols-[1fr_repeat(7,_minmax(0,_1fr))_auto] gap-2 items-center py-2 border-t border-white/5"
        >
          <span className="text-[10px] font-medium text-slate-300 truncate">{habit.name}</span>
          {habit.completions.map((done, dIdx) => (
            <button
              key={dIdx}
              onClick={() => toggleDay(hIdx, dIdx)}
              className="flex justify-center"
            >
              <div
                className={`w-5 h-5 rounded-md transition-all flex items-center justify-center ${
                  done
                    ? 'shadow-[0_0_8px_rgba(0,0,0,0.2)]'
                    : 'bg-white/5 border border-white/10'
                }`}
                style={done ? { backgroundColor: habit.color } : {}}
              >
                {done && <CheckCircle2 size={10} className="text-white" />}
              </div>
            </button>
          ))}
          <div className="flex items-center gap-1 justify-center w-12">
            <Flame size={10} className="text-orange-400" />
            <span className="text-[10px] font-bold text-orange-400">{habit.streak}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

// --- AI DIARY DIAGRAM ---
export const AIDiaryDiagram: React.FC = () => {
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const moods = ['😊', '😌', '🤔', '😔', '😢', '😠', '🤩', '🥱'];

  const messages = [
    { role: 'ai' as const, text: "How was your day? Tell me about what stood out." },
    { role: 'user' as const, text: "Had a productive morning finishing the auth module, but the afternoon meeting drained me." },
    { role: 'ai' as const, text: "Great deep work followed by meeting fatigue. What made the morning session so productive?" },
  ];

  return (
    <div className="flex flex-col p-8 bg-bridge-obsidian rounded-[2.5rem] border border-white/20 shadow-2xl w-full font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-6 text-white flex items-center gap-3 tracking-tight">
        <BookHeart size={20} className="text-pink-400" />
        AI Diary
      </h3>

      {/* Chat messages */}
      <div className="space-y-3 mb-6">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${
              msg.role === 'ai'
                ? 'bg-bridge-accent/20 border border-bridge-accent/30'
                : 'bg-bridge-secondary/20 border border-bridge-secondary/30'
            }`}>
              {msg.role === 'ai'
                ? <Sparkles size={12} className="text-bridge-accent" />
                : <span className="text-[10px]">👤</span>
              }
            </div>
            <div className={`max-w-[75%] p-3 rounded-2xl text-[11px] leading-relaxed ${
              msg.role === 'ai'
                ? 'bg-white/5 border border-white/10 text-slate-300 rounded-tl-sm'
                : 'bg-bridge-secondary/10 border border-bridge-secondary/20 text-slate-200 rounded-tr-sm'
            }`}>
              {msg.text}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Mood selector */}
      <div className="pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Today's Mood</span>
        </div>
        <div className="flex gap-2 justify-center">
          {moods.map((mood, i) => (
            <button
              key={i}
              onClick={() => setSelectedMood(mood === selectedMood ? null : mood)}
              className={`w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all ${
                selectedMood === mood
                  ? 'bg-bridge-accent/20 border-2 border-bridge-accent scale-110'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
            >
              {mood}
            </button>
          ))}
        </div>
      </div>

      {/* Voice indicator */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
          <Mic size={14} className="text-bridge-secondary" />
          <span className="text-[10px] text-slate-400">Voice journaling supported</span>
          <Volume2 size={14} className="text-bridge-accent" />
        </div>
      </div>
    </div>
  );
};
