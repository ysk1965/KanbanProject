import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { format, subDays } from 'date-fns';
import { organizationService } from '../../../utils/services';
import type { OrgInsightsSummary, OrgBoardResourceResponse, OrgRole, OrgDepartment, OrgJobGroup, OrgStructureSettings } from '../../../types';
import { InsightsPeriodFilter } from './insights/InsightsPeriodFilter';
import { InsightsSummaryCards } from './insights/InsightsSummaryCards';
import { MembersContributionView } from './insights/MembersContributionView';
import { MemberContributionDetailDrawer } from './insights/MemberContributionDetailDrawer';
import { BoardsResourceView } from './insights/BoardsResourceView';
import { ResourceDistributionChart } from './insights/ResourceDistributionChart';

interface OrgInsightsTabProps {
  orgId: string;
  myRole: OrgRole;
  departments: OrgDepartment[];
  jobGroups: OrgJobGroup[];
  structureSettings?: OrgStructureSettings;
}

function getDefaultDates(): { start: string; end: string } {
  const today = new Date();
  return {
    start: format(subDays(today, 30), 'yyyy-MM-dd'),
    end: format(today, 'yyyy-MM-dd'),
  };
}

type SubTab = 'members' | 'boards';

export function OrgInsightsTab({ orgId, myRole, departments, jobGroups, structureSettings }: OrgInsightsTabProps) {
  const { t } = useTranslation();
  const isAdmin = myRole === 'OWNER' || myRole === 'ADMIN';

  const [dates, setDates] = useState(getDefaultDates);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('members');
  const [summaryData, setSummaryData] = useState<OrgInsightsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [boardResourceData, setBoardResourceData] = useState<OrgBoardResourceResponse | null>(null);

  // Fetch summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setSummaryLoading(true);
        const data = await organizationService.getInsightsSummary(orgId, {
          start_date: dates.start,
          end_date: dates.end,
        });
        setSummaryData(data);
      } catch (error) {
        console.warn('Failed to fetch insights summary:', error);
      } finally {
        setSummaryLoading(false);
      }
    };
    fetchSummary();
  }, [orgId, dates.start, dates.end]);

  const handleDateChange = useCallback((startDate: string, endDate: string) => {
    setDates({ start: startDate, end: endDate });
  }, []);

  const handleMemberClick = useCallback((memberId: string) => {
    setSelectedMemberId(memberId);
  }, []);

  const handleBoardDataLoaded = useCallback((data: OrgBoardResourceResponse | null) => {
    setBoardResourceData(data);
  }, []);

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'members', label: t('organization.insights.tabs.members', 'By Member') },
    { key: 'boards', label: t('organization.insights.tabs.boards', 'By Board') },
  ];

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <InsightsPeriodFilter
        orgId={orgId}
        startDate={dates.start}
        endDate={dates.end}
        onChange={handleDateChange}
      />

      {/* Summary Cards */}
      <InsightsSummaryCards data={summaryData} loading={summaryLoading} />

      {/* Sub-tab Buttons */}
      <div className="flex items-center gap-2">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSubTab === tab.key
                ? 'bg-bridge-accent text-white'
                : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <motion.div
        key={activeSubTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {activeSubTab === 'members' && (
          <MembersContributionView
            orgId={orgId}
            startDate={dates.start}
            endDate={dates.end}
            departments={structureSettings?.departments_enabled !== false ? departments : []}
            jobGroups={structureSettings?.job_groups_enabled !== false ? jobGroups : []}
            isAdmin={isAdmin}
            onMemberClick={handleMemberClick}
          />
        )}

        {activeSubTab === 'boards' && (
          <div className="space-y-6">
            <BoardsResourceView
              orgId={orgId}
              startDate={dates.start}
              endDate={dates.end}
              onDataLoaded={handleBoardDataLoaded}
            />
            <ResourceDistributionChart data={boardResourceData} />
          </div>
        )}
      </motion.div>

      {/* Member Detail Drawer */}
      <MemberContributionDetailDrawer
        orgId={orgId}
        memberId={selectedMemberId}
        startDate={dates.start}
        endDate={dates.end}
        isOpen={selectedMemberId !== null}
        onClose={() => setSelectedMemberId(null)}
      />
    </div>
  );
}
