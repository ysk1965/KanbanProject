import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, Folder, CreditCard, BarChart3, Megaphone, Shield, ArrowLeft, MessageSquare } from 'lucide-react';
import ErrorBoundary from '../components/ErrorBoundary';
import { useTranslation } from 'react-i18next';
import { AdminDashboardTab } from '../components/admin/AdminDashboardTab';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { AdminBoardsTab } from '../components/admin/AdminBoardsTab';
import { AdminSubscriptionsTab } from '../components/admin/AdminSubscriptionsTab';
import { AdminAnalyticsTab } from '../components/admin/AdminAnalyticsTab';
import { AdminAnnouncementsTab } from '../components/admin/AdminAnnouncementsTab';
import { AdminSystemTab } from '../components/admin/AdminSystemTab';
import { AdminInquiriesTab } from '../components/admin/AdminInquiriesTab';

const navItems = [
  { path: 'dashboard', labelKey: 'admin.dashboard', icon: LayoutDashboard },
  { path: 'analytics', labelKey: 'admin.analytics', icon: BarChart3 },
  { path: 'users', labelKey: 'admin.users', icon: Users },
  { path: 'boards', labelKey: 'admin.boards', icon: Folder },
  { path: 'subscriptions', labelKey: 'admin.subscriptions', icon: CreditCard },
  { path: 'announcements', labelKey: 'admin.announcements', icon: Megaphone },
  { path: 'system', labelKey: 'admin.system', icon: Shield },
  { path: 'inquiries', labelKey: 'admin.inquiries', icon: MessageSquare },
];

export function AdminPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Header */}
      <header className="bg-bridge-obsidian border-b border-white/5 px-3 md:px-6 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            <NavLink
              to="/boards"
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{t('admin.backToBoards')}</span>
            </NavLink>
            <div className="h-6 w-px bg-white/10" />
            <h1 className="text-lg md:text-xl font-bold text-white">Admin</h1>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          {/* Sidebar Navigation - horizontal on mobile, vertical on md+ */}
          <nav className="md:w-56 flex-shrink-0">
            <div className="bg-bridge-obsidian rounded-xl border border-white/5 p-1.5 md:p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={`/admin/${item.path}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-lg transition-colors whitespace-nowrap flex-shrink-0 ${
                      isActive
                        ? 'bg-bridge-accent text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  <item.icon className="h-4 w-4 md:h-5 md:w-5" />
                  <span className="text-sm md:text-base font-medium">{t(item.labelKey)}</span>
                </NavLink>
              ))}
            </div>
          </nav>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboardTab />} />
                <Route path="analytics" element={<AdminAnalyticsTab />} />
                <Route path="users" element={<AdminUsersTab />} />
                <Route path="boards" element={<AdminBoardsTab />} />
                <Route path="subscriptions" element={<AdminSubscriptionsTab />} />
                <Route path="announcements" element={<AdminAnnouncementsTab />} />
                <Route path="system" element={<AdminSystemTab />} />
                <Route path="inquiries" element={<AdminInquiriesTab />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}
