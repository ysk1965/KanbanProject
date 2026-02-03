import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Star, Users, Settings, ChevronRight, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  onUpgradeClick?: () => void;
  hideBilling?: boolean;
}

export function Sidebar({ isOpen = true, onClose, onUpgradeClick, hideBilling }: SidebarProps) {
  const navigate = useNavigate();

  const menuItems = [
    { icon: <LayoutGrid size={20} />, label: '모든 보드', path: '/boards', active: true },
    { icon: <Star size={20} />, label: '즐겨찾기', path: '/boards?filter=starred', active: false },
    { icon: <Users size={20} />, label: '팀 멤버', path: '/teams', active: false },
    { icon: <Settings size={20} />, label: '설정', path: '/settings', active: false },
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-bridge-accent to-purple-500 flex items-center justify-center font-serif italic font-bold shadow-lg shadow-bridge-accent/30">
              B
            </div>
            <span className="text-xl font-bold tracking-tighter font-serif">BRIDGE</span>
            <ChevronRight
              size={14}
              className="text-slate-500 group-hover:translate-x-1 transition-transform"
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
                  ? 'bg-bridge-accent/10 text-bridge-accent shadow-[inset_0_0_20px_rgba(99,102,241,0.05)]'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Upgrade Card - TESTER/ADMIN 사용자는 숨김 */}
      {!hideBilling && (
        <div className="mt-auto p-6">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-bridge-accent to-purple-600 shadow-lg shadow-bridge-accent/20">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} fill="white" />
              <span className="text-xs font-bold uppercase tracking-tight">Upgrade Pro</span>
            </div>
            <p className="text-[10px] text-white/80 mb-3 leading-relaxed">
              무제한 보드와 고급 통계 기능을 사용해보세요.
            </p>
            <button
              onClick={() => {
                onUpgradeClick?.();
                onClose?.();
              }}
              className="w-full py-2 bg-white text-bridge-accent text-xs font-bold rounded-lg hover:bg-slate-100 transition-colors"
            >
              플랜 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* 데스크탑 사이드바 */}
      <aside className="w-64 h-full hidden lg:flex flex-col border-r border-white/5 bg-bridge-dark/40 backdrop-blur-sm">
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
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            />

            {/* 사이드바 패널 */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 w-64 h-full bg-bridge-dark border-r border-white/5 z-50 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
