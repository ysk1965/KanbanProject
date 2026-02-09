import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Star, Users, Settings, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const menuItems = [
    { icon: <LayoutGrid size={20} />, label: t('dashboard.sidebar.allBoards'), path: '/boards', active: true },
    { icon: <Star size={20} />, label: t('dashboard.sidebar.favorites'), path: '/boards?filter=starred', active: false },
    { icon: <Users size={20} />, label: t('dashboard.sidebar.teamMembers'), path: '/teams', active: false },
    { icon: <Settings size={20} />, label: t('dashboard.sidebar.settings'), path: '/settings', active: false },
  ];

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-6">
        {/* Logo */}
        <div className="flex items-center justify-between mb-8">
          <div
            className="flex items-center gap-2 group cursor-pointer"
            onClick={() => handleNavigate('/')}
          >
            <img src="/BridgeSpotsIcon.png" alt="BRIDGE SPOTS" className="w-8 h-8 rounded-lg shadow-lg shadow-[#2DD4BF]/20" />
            <div className="flex flex-col leading-none">
              <span className="text-lg font-bold tracking-tighter font-serif">BRIDGE</span>
              <span className="text-[9px] font-bold text-[#2DD4BF] tracking-[0.25em] uppercase">SPOTS</span>
            </div>
            <ChevronRight
              size={14}
              className="text-slate-400 group-hover:translate-x-1 transition-transform"
            />
          </div>
          {/* 모바일에서 닫기 버튼 */}
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={() => handleNavigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                item.active
                  ? 'bg-[#2DD4BF]/10 text-[#2DD4BF] shadow-[inset_0_0_20px_rgba(45,212,191,0.05)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </div>

    </div>
  );

  return (
    <>
      {/* 데스크탑 사이드바 */}
      <aside className="w-64 h-full hidden lg:flex flex-col border-r border-white/[0.06] bg-[#060a12]/50 backdrop-blur-sm">
        {sidebarContent}
      </aside>

      {/* 모바일 사이드바 (오버레이) */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 배경 오버레이 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
            />

            {/* 사이드바 패널 */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 w-64 h-full bg-[#060a12] border-r border-white/[0.06] z-50 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
