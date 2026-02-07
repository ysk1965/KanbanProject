import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Columns, Calendar, Clock, CheckCircle2, TrendingDown, Users2, ShieldAlert, Hash, AtSign, Bell, MessageSquare, ListChecks, GripVertical, ChevronRight } from 'lucide-react';

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
