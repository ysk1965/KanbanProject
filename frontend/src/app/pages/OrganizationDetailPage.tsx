import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2, Users, LayoutGrid, Settings, CalendarOff, BarChart3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { organizationService } from '../utils/services';
import type { OrganizationDetail, OrgRole } from '../types';
import { OrgDashboardTab } from '../components/organization/tabs/OrgDashboardTab';
import { OrgMembersTab } from '../components/organization/tabs/OrgMembersTab';
import { OrgBoardsTab } from '../components/organization/tabs/OrgBoardsTab';
import { OrgLeaveTab } from '../components/organization/tabs/OrgLeaveTab';
import { OrgSettingsTab } from '../components/organization/tabs/OrgSettingsTab';

type TabKey = 'dashboard' | 'members' | 'boards' | 'leaves' | 'settings';

const TABS: { key: TabKey; labelKey: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
  { key: 'dashboard', labelKey: 'organization.tabs.dashboard', icon: <BarChart3 size={16} /> },
  { key: 'members', labelKey: 'organization.tabs.members', icon: <Users size={16} /> },
  { key: 'boards', labelKey: 'organization.tabs.boards', icon: <LayoutGrid size={16} /> },
  { key: 'leaves', labelKey: 'organization.tabs.leaves', icon: <CalendarOff size={16} /> },
  { key: 'settings', labelKey: 'organization.tabs.settings', icon: <Settings size={16} />, adminOnly: true },
];

export function OrganizationDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<OrgRole>('MEMBER');

  const activeTab = (searchParams.get('tab') as TabKey) || 'dashboard';

  const setActiveTab = (tab: TabKey) => {
    setSearchParams({ tab });
  };

  const fetchOrg = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const data = await organizationService.get(orgId);
      setOrg(data);
      setMyRole(data.my_role);
    } catch (error) {
      console.warn('Failed to fetch organization:', error);
      navigate('/organizations');
    } finally {
      setLoading(false);
    }
  }, [orgId, navigate]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';
  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  if (loading || !org) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-bridge-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/organizations')}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            {org.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-bridge-accent/20 flex items-center justify-center">
                <Building2 size={20} className="text-bridge-accent" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">{org.name}</h1>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  {org.member_count}
                </span>
                <span className="flex items-center gap-1">
                  <LayoutGrid size={12} />
                  {org.board_count}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-white/5 mb-6 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-bridge-accent text-bridge-accent'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.icon}
              {t(tab.labelKey, tab.key.charAt(0).toUpperCase() + tab.key.slice(1))}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'dashboard' && <OrgDashboardTab orgId={orgId!} />}
        {activeTab === 'members' && <OrgMembersTab orgId={orgId!} myRole={myRole} />}
        {activeTab === 'boards' && <OrgBoardsTab orgId={orgId!} myRole={myRole} />}
        {activeTab === 'leaves' && <OrgLeaveTab orgId={orgId!} myRole={myRole} />}
        {activeTab === 'settings' && isAdmin && (
          <OrgSettingsTab orgId={orgId!} org={org} myRole={myRole} onUpdate={fetchOrg} />
        )}
      </div>
    </div>
  );
}
