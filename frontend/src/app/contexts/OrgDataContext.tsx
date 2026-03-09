import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { organizationService, leaveService, orgSubscriptionService } from '../utils/services';
import type {
  OrganizationDetail,
  OrgRole,
  OrgDepartment,
  OrgJobGroup,
  OrgPosition,
  OrgTitle,
  OrgGrade,
  OrgStructureSettings,
  OrgSubscription,
  LeaveBalance,
} from '../types';

interface OrgDataContextType {
  orgId: string;
  org: OrganizationDetail | null;
  myRole: OrgRole;
  myMemberId: string;
  isAdmin: boolean;

  // Structure data (fetched once via /structure-data)
  departments: OrgDepartment[];
  jobGroups: OrgJobGroup[];
  positions: OrgPosition[];
  titles: OrgTitle[];
  grades: OrgGrade[];
  structureSettings: OrgStructureSettings;

  // Subscription (lazy loaded, shared across tabs)
  subscription: OrgSubscription | null;
  loadSubscription: () => Promise<void>;

  // Leave
  myLeaveBalances: LeaveBalance[];

  loading: boolean;

  // Refresh callbacks
  refreshOrg: () => Promise<void>;
  refreshStructureData: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  refreshLeaveBalances: () => Promise<void>;
}

const OrgDataContext = createContext<OrgDataContextType | null>(null);

const DEFAULT_STRUCTURE_SETTINGS: OrgStructureSettings = {
  departments_enabled: true,
  job_groups_enabled: true,
  positions_enabled: true,
  titles_enabled: true,
  grades_enabled: true,
};

export function OrgDataProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<OrgRole>('MEMBER');
  const [myMemberId, setMyMemberId] = useState('');
  const [myLeaveBalances, setMyLeaveBalances] = useState<LeaveBalance[]>([]);

  // Structure data
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [jobGroups, setJobGroups] = useState<OrgJobGroup[]>([]);
  const [positions, setPositions] = useState<OrgPosition[]>([]);
  const [titles, setTitles] = useState<OrgTitle[]>([]);
  const [grades, setGrades] = useState<OrgGrade[]>([]);
  const [structureSettings, setStructureSettings] = useState<OrgStructureSettings>(DEFAULT_STRUCTURE_SETTINGS);

  // Subscription (lazy loaded)
  const [subscription, setSubscription] = useState<OrgSubscription | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);

  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';

  // ── Initial load: org + structureData + leaveBalance (3 calls instead of 9) ──
  const fetchInitialData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const orgData = await organizationService.get(orgId);
      setOrg(orgData);
      setMyRole(orgData.my_role);
      setMyMemberId(orgData.my_member_id || '');

      const [balances, structureData] = await Promise.all([
        leaveService.getMyBalance(orgId).catch(() => [] as LeaveBalance[]),
        organizationService.getStructureData(orgId).catch(() => null),
      ]);

      setMyLeaveBalances(balances);
      if (structureData) {
        setDepartments(structureData.departments || []);
        setJobGroups(structureData.job_groups || []);
        setPositions(structureData.positions || []);
        setTitles(structureData.titles || []);
        setGrades(structureData.grades || []);
        if (structureData.settings) setStructureSettings(structureData.settings);
      }
    } catch (error) {
      console.warn('Failed to fetch organization:', error);
      navigate('/boards');
    } finally {
      setLoading(false);
    }
  }, [orgId, navigate]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // ── Refresh callbacks ──

  const refreshOrg = useCallback(async () => {
    if (!orgId) return;
    try {
      const orgData = await organizationService.get(orgId);
      setOrg(orgData);
      setMyRole(orgData.my_role);
      setMyMemberId(orgData.my_member_id || '');
    } catch (error) {
      console.warn('Failed to refresh org:', error);
    }
  }, [orgId]);

  const refreshStructureData = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await organizationService.getStructureData(orgId);
      setDepartments(data.departments || []);
      setJobGroups(data.job_groups || []);
      setPositions(data.positions || []);
      setTitles(data.titles || []);
      setGrades(data.grades || []);
      if (data.settings) setStructureSettings(data.settings);
    } catch (error) {
      console.warn('Failed to refresh structure data:', error);
    }
  }, [orgId]);

  const refreshSubscription = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await orgSubscriptionService.get(orgId);
      setSubscription(data);
      setSubscriptionLoaded(true);
    } catch {
      // Subscription data is optional
    }
  }, [orgId]);

  const loadSubscription = useCallback(async () => {
    if (subscriptionLoaded) return;
    await refreshSubscription();
  }, [subscriptionLoaded, refreshSubscription]);

  const refreshLeaveBalances = useCallback(async () => {
    if (!orgId) return;
    try {
      const balances = await leaveService.getMyBalance(orgId);
      setMyLeaveBalances(balances);
    } catch { /* ignore */ }
  }, [orgId]);

  const value = useMemo<OrgDataContextType>(() => ({
    orgId,
    org,
    myRole,
    myMemberId,
    isAdmin,
    departments,
    jobGroups,
    positions,
    titles,
    grades,
    structureSettings,
    subscription,
    loadSubscription,
    myLeaveBalances,
    loading,
    refreshOrg,
    refreshStructureData,
    refreshSubscription,
    refreshLeaveBalances,
  }), [
    orgId, org, myRole, myMemberId, isAdmin,
    departments, jobGroups, positions, titles, grades, structureSettings,
    subscription, loadSubscription, myLeaveBalances, loading,
    refreshOrg, refreshStructureData, refreshSubscription, refreshLeaveBalances,
  ]);

  return (
    <OrgDataContext.Provider value={value}>
      {children}
    </OrgDataContext.Provider>
  );
}

export function useOrgData(): OrgDataContextType {
  const ctx = useContext(OrgDataContext);
  if (!ctx) throw new Error('useOrgData must be used within OrgDataProvider');
  return ctx;
}
