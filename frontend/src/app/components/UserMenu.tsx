import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreditCard, LogOut, Settings as SettingsIcon, ChevronDown, User } from 'lucide-react';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';
import { resolveFileUrl } from '../utils/api';

interface UserMenuProps {
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  assigneeColor?: string | null;
  onOpenSubscription: () => void;
  onLogout: () => void;
  hideBilling?: boolean;
}

export function UserMenu({ user, assigneeColor, onOpenSubscription, onLogout, hideBilling }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

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
            src={resolveFileUrl(user.avatar)}
            alt={user.name}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium"
            style={{ backgroundColor: getAssigneeHex(user.name, assigneeColor) }}
          >
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
                navigate('/my-board');
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
            >
              <User className="h-4 w-4" />
              <span>{t('dashboard.sidebar.myBoard', 'My Space')}</span>
            </button>

            <button
              onClick={() => {
                navigate('/settings');
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
            >
              <SettingsIcon className="h-4 w-4" />
              <span>{t('user.settings')}</span>
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
                <span>{t('user.subscription')}</span>
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
              <span>{t('user.logout')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
