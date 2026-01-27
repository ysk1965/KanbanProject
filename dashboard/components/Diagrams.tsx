
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Columns, Calendar, Clock, CheckCircle2, TrendingDown, Users2, ShieldAlert } from 'lucide-react';

// --- RESOURCE PULSE DIAGRAM (New PM Dashboard View) ---
export const ResourcePulseDiagram: React.FC = () => {
  const team = [
    { name: 'Alice (Dev)', load: 85, status: 'Overheat', color: 'text-red-400' },
    { name: 'Bob (PM)', load: 45, status: 'Idle', color: 'text-bridge-secondary' },
    { name: 'Charlie (Design)', load: 65, status: 'Normal', color: 'text-indigo-400' },
  ];

  return (
    <div className="flex flex-col p-10 bg-bridge-obsidian rounded-[3.5rem] border border-white/10 shadow-3xl w-full text-stone-100 overflow-hidden relative font-inter">
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
              <span className="text-xs font-mono text-slate-500">{member.load}% Load</span>
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

      <div className="mt-12 pt-8 border-t border-white/5 grid grid-cols-2 gap-4">
        <div className="p-5 bg-white/5 rounded-3xl border border-white/5">
          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-2">Sprint Health</span>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-bridge-secondary shadow-[0_0_10px_rgba(45,212,191,0.5)]" />
            <span className="text-2xl font-jakarta font-extrabold text-white tracking-tighter">94.2%</span>
          </div>
        </div>
        <div className="p-5 bg-white/5 rounded-3xl border border-red-400/10">
          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block mb-2 text-red-400/80">Risk Level</span>
          <div className="flex items-center gap-2">
             <span className="text-2xl font-jakarta font-extrabold text-red-400 tracking-tighter">Low</span>
             <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">3 Alerts</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- PRICE COMPARISON DIAGRAM ---
export const PriceComparisonDiagram: React.FC = () => {
  return (
    <div className="flex flex-col p-10 bg-bridge-obsidian rounded-[3rem] border border-white/10 shadow-2xl w-full text-stone-100 overflow-hidden relative font-inter">
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
          { name: 'bridgespots Premium', cost: 50, color: 'bg-bridge-secondary', highlight: true },
        ].map((item, i) => (
          <div key={i} className="space-y-3">
            <div className="flex justify-between text-[11px] font-extrabold uppercase tracking-[0.15em]">
              <span className={item.highlight ? 'text-bridge-secondary' : 'text-slate-500'}>{item.name}</span>
              <span className={item.highlight ? 'text-white' : 'text-slate-500'}>${item.cost} / Year</span>
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
    <div className="flex flex-col items-center p-8 bg-bridge-obsidian rounded-[2.5rem] border border-white/5 shadow-2xl w-full font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-8 text-white flex items-center gap-4 tracking-tight">
        <Columns size={22} className="text-bridge-accent" />
        Core Orchestration Flow
      </h3>
      
      <div className="grid grid-cols-4 gap-3 w-full">
        {['Task', 'In Progress', 'Review', 'Done'].map(status => (
          <div key={status} className={`flex flex-col gap-3 min-h-[180px] p-3 rounded-2xl border transition-all ${
            ['Task', 'In Progress', 'Done'].includes(status) ? 'bg-white/5 border-white/10' : 'bg-bridge-accent/5 border-bridge-accent/20'
          }`}>
            <span className={`text-[10px] font-extrabold uppercase tracking-[0.2em] text-center mb-2 ${
              ['Task', 'In Progress', 'Done'].includes(status) ? 'text-slate-600' : 'text-bridge-accent'
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
    <div className="flex flex-col p-10 bg-bridge-dark rounded-[2.5rem] border border-white/10 shadow-2xl w-full text-stone-100 overflow-hidden font-inter">
      <h3 className="font-jakarta font-bold text-xl mb-10 text-bridge-secondary flex items-center gap-4 tracking-tight">
        <Calendar size={22} className="text-bridge-secondary" />
        Unified Roadmap
      </h3>

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-8 gap-1.5 border-b border-white/5 pb-5">
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
              {item.type === 'task' ? '— ' : '● '}{item.name}
            </div>
            <div className="col-span-6 h-6 relative bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${(item.span / 6) * 100}%`, left: `${(item.start / 6) * 100}%` }}
                transition={{ duration: 1.2, delay: i * 0.15, ease: "circOut" }}
                className={`absolute top-1 bottom-1 rounded-full ${item.color} ${item.type === 'feature' ? 'opacity-30 border border-white/10' : 'shadow-[0_0_15px_rgba(99,102,241,0.2)]'}`}
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
