import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, Folder, CreditCard, ArrowLeft } from 'lucide-react';
import { AdminDashboardTab } from '../components/admin/AdminDashboardTab';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { AdminBoardsTab } from '../components/admin/AdminBoardsTab';
import { AdminSubscriptionsTab } from '../components/admin/AdminSubscriptionsTab';

const navItems = [
  { path: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { path: 'users', label: '사용자 관리', icon: Users },
  { path: 'boards', label: '보드 관리', icon: Folder },
  { path: 'subscriptions', label: '구독 관리', icon: CreditCard },
];

export function AdminPage() {
  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Header */}
      <header className="bg-bridge-obsidian border-b border-white/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <NavLink
              to="/boards"
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>보드로 돌아가기</span>
            </NavLink>
            <div className="h-6 w-px bg-white/10" />
            <h1 className="text-xl font-bold text-white">Admin</h1>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <nav className="w-56 flex-shrink-0">
            <div className="bg-bridge-obsidian rounded-xl border border-white/5 p-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={`/admin/${item.path}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-bridge-accent text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  <item.icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <Routes>
              <Route path="/" element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardTab />} />
              <Route path="users" element={<AdminUsersTab />} />
              <Route path="boards" element={<AdminBoardsTab />} />
              <Route path="subscriptions" element={<AdminSubscriptionsTab />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}
