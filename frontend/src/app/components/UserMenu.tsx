import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, CreditCard, LogOut, Settings as SettingsIcon, ChevronDown } from 'lucide-react';
import { getInitials } from '../utils/assigneeColor';

interface UserMenuProps {
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  onOpenSubscription: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  hideBilling?: boolean;
}

export function UserMenu({ user, onOpenSubscription, onOpenSettings, onLogout, hideBilling }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      {/* 프로필 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
            {getInitials(user.name)}
          </div>
        )}
        <span className="text-sm text-slate-200 hidden md:block">{user.name}</span>
        <ChevronDown className={`h-4 w-4 text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-bridge-obsidian rounded-lg shadow-xl border border-white/20 py-2 z-50">
          {/* 사용자 정보 */}
          <div className="px-4 py-3 border-b border-white/15">
            <div className="font-medium text-foreground">{user.name}</div>
            <div className="text-sm text-slate-300">{user.email}</div>
          </div>

          {/* 메뉴 아이템 */}
          <div className="py-2">
            <button
              onClick={() => {
                onOpenSettings();
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
            >
              <User className="h-4 w-4" />
              <span>내 정보</span>
            </button>

            <button
              onClick={() => {
                navigate('/settings');
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
            >
              <SettingsIcon className="h-4 w-4" />
              <span>설정</span>
            </button>

            {!hideBilling && (
              <button
                onClick={() => {
                  onOpenSubscription();
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
              >
                <CreditCard className="h-4 w-4" />
                <span>구독 관리</span>
              </button>
            )}
          </div>

          {/* 로그아웃 */}
          <div className="border-t border-white/15 pt-2">
            <button
              onClick={() => {
                onLogout();
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-red-600/20 transition-colors text-red-400 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
