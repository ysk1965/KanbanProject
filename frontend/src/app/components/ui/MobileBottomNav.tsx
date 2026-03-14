import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Columns3, User, Building2, Menu } from 'lucide-react';
import { cn } from './utils';
import { useState, useEffect } from 'react';

interface NavTab {
  key: string;
  icon: React.ElementType;
  labelKey: string;
  fallback: string;
  path: string;
  match: (pathname: string) => boolean;
}

const tabs: NavTab[] = [
  {
    key: 'boards',
    icon: LayoutGrid,
    labelKey: 'nav.boards',
    fallback: 'Boards',
    path: '/boards',
    match: (p) => p === '/boards',
  },
  {
    key: 'board',
    icon: Columns3,
    labelKey: 'nav.board',
    fallback: 'Board',
    path: '/boards',
    match: (p) => /^\/boards\/[^/]+/.test(p),
  },
  {
    key: 'myspace',
    icon: User,
    labelKey: 'nav.mySpace',
    fallback: 'MySpace',
    path: '/my-board',
    match: (p) => p === '/my-board',
  },
  {
    key: 'org',
    icon: Building2,
    labelKey: 'nav.org',
    fallback: 'Org',
    path: '/organizations',
    match: (p) => p.startsWith('/organizations'),
  },
  {
    key: 'more',
    icon: Menu,
    labelKey: 'nav.more',
    fallback: 'More',
    path: '/settings',
    match: (p) => p === '/settings',
  },
];

// Paths where bottom nav should be hidden
const HIDDEN_PATHS = ['/login', '/landing', '/compare', '/email-pending', '/forgot-password', '/reset-password', '/terms', '/privacy', '/shared/', '/invite/', '/org-invite/'];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Track last visited board for the "Board" tab
  const [lastBoardPath, setLastBoardPath] = useState<string | null>(null);

  useEffect(() => {
    if (/^\/boards\/[^/]+/.test(location.pathname)) {
      setLastBoardPath(location.pathname);
    }
  }, [location.pathname]);

  // Hide when keyboard is open (visual viewport shrinks)
  useEffect(() => {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const check = () => {
      const isKeyboard = vv.height < window.innerHeight * 0.75;
      setKeyboardOpen(isKeyboard);
    };
    vv.addEventListener('resize', check);
    return () => vv.removeEventListener('resize', check);
  }, []);

  // Don't render on hidden paths or when keyboard is open
  const shouldHide = HIDDEN_PATHS.some(p => location.pathname.startsWith(p)) || keyboardOpen;
  if (shouldHide) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-bridge-obsidian border-t border-foreground/[0.08]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label={t('nav.mainNavigation', 'Main navigation')}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const isActive = tab.match(location.pathname);
          const Icon = tab.icon;

          const handleClick = () => {
            if (tab.key === 'board' && lastBoardPath) {
              navigate(lastBoardPath);
            } else {
              navigate(tab.path);
            }
          };

          return (
            <button
              key={tab.key}
              type="button"
              onClick={handleClick}
              className={cn(
                'flex flex-col items-center justify-center min-w-[56px] min-h-[44px] gap-0.5 transition-colors',
                isActive
                  ? 'text-bridge-accent'
                  : 'text-slate-500 active:text-foreground',
              )}
              aria-label={t(tab.labelKey, tab.fallback)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
              <span className={cn('text-xs leading-tight', isActive ? 'font-bold' : 'font-medium')}>
                {t(tab.labelKey, tab.fallback)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
