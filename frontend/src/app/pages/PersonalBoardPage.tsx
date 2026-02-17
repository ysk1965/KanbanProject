import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, BookHeart, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { PersonalSchedule } from '../components/personal/PersonalSchedule';
import { PersonalDiary } from '../components/personal/PersonalDiary';

type TabType = 'schedule' | 'diary';

export function PersonalBoardPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('schedule');

  const tabs = [
    { key: 'schedule' as TabType, label: 'Schedule', icon: CalendarDays },
    { key: 'diary' as TabType, label: 'AI Diary', icon: BookHeart },
  ];

  return (
    <div className="flex flex-col h-screen bg-bridge-dark text-white selection:bg-bridge-secondary/30">
      {/* Header */}
      <header className="h-14 border-b border-white/[0.06] bg-bridge-obsidian/80 backdrop-blur-sm px-4 md:px-6 flex items-center gap-4">
        <button
          onClick={() => navigate('/boards')}
          className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
        >
          <ArrowLeft size={18} />
        </button>

        <h1 className="text-lg font-bold font-serif">My Space</h1>

        {/* Tabs */}
        <div className="flex items-center gap-1 ml-6 bg-white/5 rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {activeTab === tab.key && (
                <motion.div
                  layoutId="personal-tab-bg"
                  className="absolute inset-0 bg-bridge-accent/20 border border-bridge-accent/30 rounded-lg"
                  transition={{ type: 'spring', duration: 0.3 }}
                />
              )}
              <tab.icon size={16} className="relative z-10" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'schedule' && <PersonalSchedule />}
        {activeTab === 'diary' && <PersonalDiary />}
      </main>
    </div>
  );
}
