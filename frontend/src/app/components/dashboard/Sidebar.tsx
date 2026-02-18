import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, User, Settings, ChevronRight, ChevronLeft, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Board } from '../../types';
import { getGradient } from './BoardCard';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  boards?: Board[];
  onSelectBoard?: (boardId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ isOpen = true, onClose, boards = [], onSelectBoard, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [activeItem, setActiveItem] = useState('all');

  // Determine active menu item from URL
  useEffect(() => {
    if (location.pathname.includes('/my-board')) setActiveItem('myBoard');
    else if (location.pathname.includes('/settings')) setActiveItem('settings');
    else setActiveItem('all');
  }, [location]);

  const menuItems = [
    { key: 'all', icon: <LayoutGrid size={18} />, label: t('dashboard.sidebar.allBoards'), path: '/boards' },
    { key: 'myBoard', icon: <User size={18} />, label: t('dashboard.sidebar.myBoard'), path: '/my-board' },
    { key: 'settings', icon: <Settings size={18} />, label: t('dashboard.sidebar.settings'), path: '/settings' },
  ];

  // Recent boards - sort by updated_at desc, take 5
  const recentBoards = [...boards]
    .sort((a, b) => {
      const aDate = a.updated_at || a.created_at;
      const bDate = b.updated_at || b.created_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    })
    .slice(0, 5);

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose?.();
  };

  const handleBoardClick = (boardId: string) => {
    if (onSelectBoard) {
      onSelectBoard(boardId);
    } else {
      navigate(`/boards/${boardId}`);
    }
    onClose?.();
  };

  // Mini board pill for sidebar
  const BoardPill = ({ board }: { board: Board }) => (
    <button
      onClick={() => handleBoardClick(board.id)}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-white/5 transition-colors group/pill"
    >
      <div
        className="w-5 h-5 rounded-md shrink-0"
        style={{ background: getGradient(board.id) }}
      />
      {!isCollapsed && (
        <span className="text-[12px] text-slate-400 group-hover/pill:text-white truncate transition-colors">
          {board.name}
        </span>
      )}
    </button>
  );

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className={`p-4 ${isCollapsed ? 'px-3' : 'px-5'}`}>
        {/* Logo */}
        <div className="flex items-center justify-between mb-6">
          <div
            className={`flex items-center gap-2 group cursor-pointer ${isCollapsed ? 'justify-center w-full' : ''}`}
            onClick={() => handleNavigate('/')}
          >
            <img
              src="/BridgeSpotsIcon.png"
              alt="BRIDGE SPOTS"
              className="w-8 h-8 rounded-lg shadow-lg shadow-bridge-secondary/20"
            />
            {!isCollapsed && (
              <>
                <div className="flex flex-col leading-none">
                  <span className="text-lg font-bold tracking-tighter font-serif">BRIDGE</span>
                  <span className="text-[9px] font-bold text-bridge-secondary tracking-[0.25em] uppercase">SPOTS</span>
                </div>
                <ChevronRight
                  size={14}
                  className="text-slate-400 group-hover:translate-x-1 transition-transform ml-auto"
                />
              </>
            )}
          </div>
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="space-y-0.5">
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => handleNavigate(item.path)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                isCollapsed ? 'justify-center' : ''
              } ${
                activeItem === item.key
                  ? 'bg-bridge-secondary/10 text-bridge-secondary'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              {item.icon}
              {!isCollapsed && item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Recent Boards */}
      {!isCollapsed && recentBoards.length > 0 && (
        <div className="px-5 mt-4">
          <div className="flex items-center gap-2 px-2.5 mb-2">
            <Clock size={11} className="text-slate-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {t('dashboard.sidebar.recent', 'Recent')}
            </span>
          </div>
          <div className="space-y-0.5">
            {recentBoards.map(board => (
              <BoardPill key={board.id} board={board} />
            ))}
          </div>
        </div>
      )}

      {/* Collapse Toggle (desktop only) */}
      {onToggleCollapse && (
        <div className="mt-auto p-4">
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors text-xs"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            {!isCollapsed && <span className="font-medium">{t('dashboard.sidebar.collapse', 'Collapse')}</span>}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`${isCollapsed ? 'w-16' : 'w-60'} h-full hidden lg:flex flex-col border-r border-white/[0.06] bg-bridge-dark/50 backdrop-blur-sm transition-all duration-300`}>
        {sidebarContent}
      </aside>

      {/* Mobile sidebar (overlay) */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 w-60 h-full bg-bridge-dark border-r border-white/[0.06] z-50 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
