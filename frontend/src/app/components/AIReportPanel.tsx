import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import ReactMarkdown from 'react-markdown';
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  Users,
  User,
  Clock,
  AlertCircle,
  CheckSquare,
  Square,
  MessageSquare,
  Timer,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Activity,
  Target,
  TrendingUp,
  CalendarDays,
} from 'lucide-react';
import { reportAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import type {
  ReportType,
  WeeklyReport,
  WeeklyReportListItem,
  BoardMember,
  PersonalReportData,
  PersonalReportFeature,
  ReportMeeting,
  TeamReportData,
} from '../types';
import { formatDateTime } from '../utils/dateUtils';

interface AIReportPanelProps {
  boardId: string;
  members: BoardMember[];
  hideBilling?: boolean;
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function formatDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDisplayDate(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d}`;
}

/* ─── Custom Markdown Components for AI Report ─── */
const markdownComponents = {
  // h2: feature group header with accent left border
  h2: ({ children }: { children?: React.ReactNode }) => (
    <div className="flex items-center gap-3 mt-8 mb-3 first:mt-0">
      <div className="w-1 h-5 bg-bridge-accent rounded-full" />
      <h2 className="text-lg font-bold text-foreground tracking-tight">{children}</h2>
    </div>
  ),
  // h3: task title within a feature group
  h3: ({ children }: { children?: React.ReactNode }) => (
    <div className="mt-4 mb-1 first:mt-0">
      <h3 className="text-[15px] font-semibold text-slate-200 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-bridge-secondary flex-shrink-0" />
        {children}
      </h3>
    </div>
  ),
  // p: prose paragraphs with relaxed spacing
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-muted-foreground text-sm leading-[1.8] mb-4">{children}</p>
  ),
  // em: feature name subtitle
  em: ({ children }: { children?: React.ReactNode }) => (
    <span className="text-[11px] font-medium text-bridge-accent/70 tracking-wide not-italic">{children}</span>
  ),
  // strong: accent bold
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="text-foreground font-semibold">{children}</strong>
  ),
  // hr: feature group divider
  hr: () => (
    <div className="my-6 flex items-center gap-3">
      <div className="flex-1 h-px bg-white/[0.06]" />
      <div className="w-1 h-1 rounded-full bg-white/10" />
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  ),
  // blockquote: highlighted summary callout
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <div className="mt-6 bg-bridge-accent/[0.06] border border-bridge-accent/20 rounded-xl p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-bridge-accent rounded-l-xl" />
      <div className="pl-3 text-sm text-slate-200 leading-relaxed [&>p]:mb-0">{children}</div>
    </div>
  ),
  // ul/li for any lists that sneak through
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="text-muted-foreground text-sm space-y-1 mb-4 pl-4">{children}</ul>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-muted-foreground">{children}</li>
  ),
};

export function AIReportPanel({ boardId, members, hideBilling }: AIReportPanelProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(-1); // default: last week
  const [reportType, setReportType] = useState<ReportType>('PERSONAL');
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [reportHistory, setReportHistory] = useState<WeeklyReportListItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string>(currentUser?.id || '');
  const [showHistory, setShowHistory] = useState(false);

  // User role check
  const currentMember = members.find((m) => m.user.id === currentUser?.id);
  const isAdminOrOwner = currentMember?.role === 'OWNER' || currentMember?.role === 'ADMIN';

  // Effective target user for personal reports
  const targetUserId = reportType === 'PERSONAL' && isAdminOrOwner
    ? selectedMemberId
    : currentUser?.id || '';

  // Calculate week range
  const weekRange = React.useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() + weekOffset * 7);
    return getWeekRange(now);
  }, [weekOffset]);

  const periodStart = formatDateStr(weekRange.start);
  const periodEnd = formatDateStr(weekRange.end);

  // Load existing report for current week/type
  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const effectiveTarget = reportType === 'PERSONAL' ? targetUserId : undefined;
      const response = await reportAPI.getReports(boardId, reportType, effectiveTarget);
      setReportHistory(response.reports || []);

      // Find matching report for current period
      const matching = (response.reports || []).find(
        (r) => r.period_start === periodStart && r.period_end === periodEnd
      );
      if (matching) {
        const detail = await reportAPI.getReport(boardId, matching.id);
        setReport(detail);
      } else {
        setReport(null);
      }
    } catch {
      setReport(null);
      setReportHistory([]);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, reportType, targetUserId, periodStart, periodEnd]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Generate report (with confirmation)
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await reportAPI.generateReport(boardId, {
        reportType,
        periodStart,
        periodEnd,
        language: i18n.language,
        targetUserId: reportType === 'PERSONAL' ? targetUserId : undefined,
      });
      setReport(result);
      loadReport(); // refresh history
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || t('aiReport.error');
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Regenerate (with confirmation)
  const handleRegenerate = async () => {
    if (!report) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await reportAPI.regenerateReport(boardId, report.id, i18n.language);
      setReport(result);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || t('aiReport.error');
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Load history report
  const handleLoadHistoryReport = async (reportId: string) => {
    setIsLoading(true);
    try {
      const detail = await reportAPI.getReport(boardId, reportId);
      setReport(detail);
      // Update week to match
      // Just show the report, don't change week offset
    } catch {
      setError(t('aiReport.error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row bg-bridge-dark">
      {/* Sidebar - Report history (left) */}
      {reportHistory.length > 0 && (
        <>
          {/* Mobile history toggle button */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="md:hidden fixed left-4 z-20 flex items-center gap-2 px-4 py-2.5 bg-bridge-obsidian border border-foreground/10 rounded-xl text-xs font-medium text-muted-foreground shadow-lg"
            style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <Clock className="h-3.5 w-3.5" />
            {t('aiReport.history')}
            <span className="text-[10px] bg-bridge-accent/20 text-bridge-accent px-1.5 py-0.5 rounded-full">{reportHistory.length}</span>
          </button>

          {/* Mobile history overlay */}
          {showHistory && (
            <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setShowHistory(false)}>
              <div
                className="absolute left-0 top-0 h-full w-72 bg-bridge-dark border-r border-foreground/10 flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b border-foreground/10 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {t('aiReport.history')}
                  </h4>
                  <button onClick={() => setShowHistory(false)} className="p-1 text-slate-500 hover:text-foreground">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {reportHistory.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { handleLoadHistoryReport(item.id); setShowHistory(false); }}
                      className={`w-full text-left px-4 py-3 border-b border-foreground/5 hover:bg-foreground/5 transition-colors ${
                        report?.id === item.id ? 'bg-bridge-accent/10 border-l-2 border-l-bridge-accent' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-xs font-medium text-foreground">
                          {item.period_start} ~ {item.period_end.slice(5)}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-600">
                        {item.generated_by_name} · {formatDateTime(item.created_at)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Desktop sidebar */}
          <div className="hidden md:flex w-64 border-r border-foreground/10 flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-foreground/10">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {t('aiReport.history')}
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto">
              {reportHistory.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleLoadHistoryReport(item.id)}
                  className={`w-full text-left px-4 py-3 border-b border-foreground/5 hover:bg-foreground/5 transition-colors ${
                    report?.id === item.id ? 'bg-bridge-accent/10 border-l-2 border-l-bridge-accent' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-xs font-medium text-white">
                      {item.period_start} ~ {item.period_end.slice(5)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-600">
                    {item.generated_by_name} · {formatDateTime(item.created_at)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex-none px-4 md:px-6 py-3 md:py-4 border-b border-foreground/10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {/* Week navigation */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setWeekOffset((p) => p - 1)}
                className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-xs sm:text-sm font-medium text-foreground min-w-[140px] sm:min-w-[160px] text-center">
                {formatDisplayDate(weekRange.start)} ~ {formatDisplayDate(weekRange.end)}
                {weekOffset === -1 && (
                  <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs text-slate-500">({t('aiReport.lastWeek')})</span>
                )}
                {weekOffset === 0 && (
                  <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs text-slate-500">({t('aiReport.thisWeek')})</span>
                )}
              </div>
              <button
                onClick={() => setWeekOffset((p) => Math.min(p + 1, 0))}
                disabled={weekOffset >= 0}
                className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {/* Member selector for personal reports (Admin/Owner only) */}
              {reportType === 'PERSONAL' && isAdminOrOwner && (
                <div className="relative flex-1 sm:flex-initial">
                  <select
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    className="appearance-none w-full bg-foreground/5 border border-foreground/10 rounded-xl pl-3 pr-8 py-2 text-xs sm:text-sm text-foreground
                      focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent
                      transition-all cursor-pointer"
                  >
                    {members.map((m) => (
                      <option key={m.user.id} value={m.user.id} className="bg-bridge-obsidian text-white">
                        {m.user.id === currentUser?.id
                          ? `${m.user.name} (${t('aiReport.me')})`
                          : m.user.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                </div>
              )}

              {/* Report type toggle */}
              <div className="flex items-center gap-1 bg-bridge-dark rounded-xl p-1 border border-white/20">
                <button
                  onClick={() => setReportType('PERSONAL')}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    reportType === 'PERSONAL'
                      ? 'bg-bridge-accent text-white shadow-lg'
                      : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
                  }`}
                >
                  <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">{t('aiReport.personalReport')}</span>
                  <span className="sm:hidden">{t('aiReport.personalReport').slice(0, 2)}</span>
                </button>
                {isAdminOrOwner && (
                  <button
                    onClick={() => setReportType('TEAM')}
                    className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      reportType === 'TEAM'
                        ? 'bg-bridge-accent text-white shadow-lg'
                        : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">{t('aiReport.teamReport')}</span>
                    <span className="sm:hidden">{t('aiReport.teamReport').slice(0, 2)}</span>
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {isGenerating ? (
            /* Loading state */
            <div className="flex flex-col items-center justify-center py-12 sm:py-20">
              <div className="relative mb-6">
                <Sparkles className="h-12 w-12 text-bridge-accent animate-pulse" />
              </div>
              <p className="text-slate-400 text-sm">{t('aiReport.generating')}</p>
              <p className="text-slate-600 text-xs mt-2">{t('aiReport.generatingHint')}</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12 sm:py-20">
              <div className="animate-spin h-6 w-6 border-2 border-bridge-accent border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            /* Error state */
            <div className="flex flex-col items-center justify-center py-12 sm:py-20">
              <AlertCircle className="h-10 w-10 text-red-400 mb-4" />
              <p className="text-red-400 text-sm mb-4">{error}</p>
              <button
                onClick={handleGenerate}
                className="px-4 py-2 bg-bridge-accent text-white rounded-xl text-sm font-medium hover:bg-bridge-accent/90 transition-all"
              >
                {t('aiReport.retry')}
              </button>
            </div>
          ) : report ? (
            /* Report content */
            <div>
              {/* Report metadata */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-4 md:mb-6">
                <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-slate-500">
                  <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>{formatDateTime(report.created_at)}</span>
                  <span className="text-slate-700">|</span>
                  <span>{report.generated_by_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRegenerate}
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs rounded-lg border border-foreground/10 transition-all text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  >
                    <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{t('aiReport.regenerate')}</span>
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg border border-foreground/10 transition-all"
                  >
                    {copied ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400" /> : <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
                    <span className="hidden sm:inline">{copied ? t('aiReport.copied') : t('aiReport.copy')}</span>
                  </button>
                </div>
              </div>

              {/* Structured data section (Personal or Team) */}
              {report.report_type === 'PERSONAL' && report.data_snapshot && (
                <PersonalDataSection dataSnapshot={report.data_snapshot} t={t} />
              )}
              {report.report_type === 'TEAM' && report.data_snapshot && (
                <TeamDataSection dataSnapshot={report.data_snapshot} t={t} />
              )}

              {/* AI Analysis section header */}
              {report.data_snapshot && (
                <div className="flex items-center gap-3 mt-8 mb-4">
                  <Sparkles className="h-4 w-4 text-bridge-accent" />
                  <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">{t('aiReport.aiAnalysis')}</h3>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              )}

              {/* Markdown content */}
              <div className="space-y-0">
                <ReactMarkdown components={markdownComponents}>{report.content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            /* Empty state - generate button */
            <div className="flex flex-col items-center justify-center py-12 sm:py-20">
              <div className="w-16 h-16 rounded-2xl bg-bridge-accent/10 flex items-center justify-center mb-6">
                <Sparkles className="h-8 w-8 text-bridge-accent" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">{t('aiReport.title')}</h3>
              <p className="text-slate-500 text-sm mb-8 text-center max-w-md">
                {reportType === 'TEAM' ? t('aiReport.teamDescription') : t('aiReport.personalDescription')}
              </p>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white hover:shadow-[0_0_20px_rgba(45,212,191,0.3)]"
              >
                <Sparkles className="h-4 w-4" />
                {t('aiReport.generate')}
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

/* ─── Personal Report Structured Data Section ─── */

function formatMinutesToHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function CircularProgress({ value, max, size = 52, strokeWidth = 4, color }: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = max > 0 ? value / max : 0;
  const offset = circumference * (1 - percentage);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-white/5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-foreground">
          {max > 0 ? Math.round((value / max) * 100) : 0}%
        </span>
      </div>
    </div>
  );
}

function PersonalDataSection({ dataSnapshot, t }: { dataSnapshot: string; t: (key: string) => string }) {
  let data: PersonalReportData;
  try {
    data = JSON.parse(dataSnapshot);
  } catch {
    return null;
  }

  if (!data.features || !data.summary) return null;

  const { summary, features } = data;
  const totalTasks = features.reduce((acc, f) => acc + f.tasks.length, 0);

  const doneCount = features.filter(f => f.status === 'DONE').length;
  const activeCount = features.filter(f => f.status === 'IN_PROGRESS').length;
  const notStartedCount = features.filter(f => f.status === 'NOT_STARTED').length;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <Layers className="h-4 w-4 text-bridge-secondary" />
        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">{t('aiReport.activityData')}</h3>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Summary cards - 2x2 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {/* 총 작업시간 */}
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-5 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="h-4 w-4 text-bridge-accent" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.totalTime')}</span>
            </div>
            <div className="text-2xl font-bold text-foreground tracking-tight">
              {formatMinutesToHours(summary.total_minutes)}
            </div>
          </div>
        </div>

        {/* 체크리스트 */}
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-5 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="h-4 w-4 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.checklists')}</span>
            </div>
            <div className="flex items-center gap-4">
              <CircularProgress
                value={summary.completed_checklists}
                max={summary.total_checklists}
                color="#34d399"
              />
              <div>
                <div className="text-2xl font-bold text-foreground tracking-tight">
                  {summary.completed_checklists}/{summary.total_checklists}
                </div>
                {summary.total_checklists > 0 && summary.completed_checklists === summary.total_checklists && (
                  <div className="text-[10px] text-emerald-400 font-medium mt-0.5">{t('aiReport.allComplete')}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 참여 피처 */}
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-5 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="h-4 w-4 text-bridge-secondary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.featuresLabel')}</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2.5">
              <span className="text-2xl font-bold text-foreground tracking-tight">{features.length}</span>
              <span className="text-[11px] text-slate-500">{totalTasks} {t('aiReport.taskCount')}</span>
            </div>
            {features.length > 0 && (
              <>
                <div className="flex rounded-full overflow-hidden h-1.5 bg-foreground/5 mb-2">
                  {doneCount > 0 && (
                    <div className="bg-emerald-400 h-full" style={{ width: `${(doneCount / features.length) * 100}%` }} />
                  )}
                  {activeCount > 0 && (
                    <div className="bg-bridge-accent h-full" style={{ width: `${(activeCount / features.length) * 100}%` }} />
                  )}
                  {notStartedCount > 0 && (
                    <div className="bg-slate-600 h-full" style={{ width: `${(notStartedCount / features.length) * 100}%` }} />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {doneCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{doneCount} {t('aiReport.done')}
                    </span>
                  )}
                  {activeCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-bridge-accent">
                      <span className="w-1.5 h-1.5 rounded-full bg-bridge-accent" />{activeCount} {t('aiReport.active')}
                    </span>
                  )}
                  {notStartedCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />{notStartedCount} {t('aiReport.notStarted')}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 댓글 */}
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-5 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.commentsLabel')}</span>
            </div>
            <div className="text-2xl font-bold text-foreground tracking-tight">{summary.total_comments}</div>
          </div>
        </div>
      </div>

      {/* Meetings */}
      {data.meetings && data.meetings.length > 0 && (
        <MeetingsSection meetings={data.meetings} t={t} />
      )}

      {/* Feature → Task breakdown */}
      <div className="space-y-3">
        {features.map((feature, fi) => (
          <FeatureCard key={fi} feature={feature} t={t} />
        ))}
      </div>
    </div>
  );
}

/* ─── Team Report Structured Data Section ─── */

function TeamDataSection({ dataSnapshot, t }: { dataSnapshot: string; t: (key: string) => string }) {
  let data: TeamReportData;
  try {
    data = JSON.parse(dataSnapshot);
  } catch {
    return null;
  }

  if (!data.statistics?.summary || !data.management) return null;

  const { statistics, management } = data;
  const { summary } = statistics;
  const healthScore = management.summary?.overall_health_score ?? 0;
  const delayed = management.delayed_items?.bottleneck_summary;
  const totalDelayed = (delayed?.total_overdue_features ?? 0) + (delayed?.total_stagnant_tasks ?? 0) + (delayed?.total_stuck_checklists ?? 0);

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <Layers className="h-4 w-4 text-bridge-secondary" />
        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">{t('aiReport.activityData')}</h3>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Summary cards - 2x2 grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {/* 총 작업시간 */}
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-5 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="h-4 w-4 text-bridge-accent" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.totalTime')}</span>
            </div>
            <div className="text-2xl font-bold text-foreground tracking-tight">
              {formatMinutesToHours(summary.total_work_minutes)}
            </div>
            <div className="text-[10px] text-slate-600 mt-1">
              {t('aiReport.focusRate')} {Math.round(summary.focus_rate * 100)}%
            </div>
          </div>
        </div>

        {/* 태스크 완료 */}
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-5 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.tasksCompleted')}</span>
            </div>
            <div className="flex items-center gap-4">
              <CircularProgress
                value={summary.completed_tasks}
                max={summary.total_tasks}
                color="#34d399"
              />
              <div>
                <div className="text-2xl font-bold text-foreground tracking-tight">
                  {summary.completed_tasks}/{summary.total_tasks}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 프로젝트 건강도 */}
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-5 relative overflow-hidden">
          <div className={`absolute -top-6 -right-6 w-28 h-28 rounded-full blur-2xl pointer-events-none ${
            healthScore >= 70 ? 'bg-emerald-500/10' : healthScore >= 40 ? 'bg-amber-500/10' : 'bg-red-500/10'
          }`} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-bridge-secondary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.healthScore')}</span>
            </div>
            <div className={`text-2xl font-bold tracking-tight ${
              healthScore >= 70 ? 'text-emerald-400' : healthScore >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {Math.round(healthScore)}
            </div>
            <div className="w-full h-1.5 rounded-full bg-foreground/5 mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  healthScore >= 70 ? 'bg-emerald-400' : healthScore >= 40 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ width: `${healthScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* 주의 필요 항목 */}
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-5 relative overflow-hidden">
          <div className={`absolute -top-6 -right-6 w-28 h-28 rounded-full blur-2xl pointer-events-none ${
            totalDelayed > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'
          }`} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className={`h-4 w-4 ${totalDelayed > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.attentionItems')}</span>
            </div>
            <div className={`text-2xl font-bold tracking-tight ${totalDelayed > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {totalDelayed}
            </div>
            {delayed && totalDelayed > 0 && (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {delayed.total_overdue_features > 0 && (
                  <span className="text-[10px] text-red-400/80">{t('aiReport.overdueFeatures')} {delayed.total_overdue_features}</span>
                )}
                {delayed.total_stagnant_tasks > 0 && (
                  <span className="text-[10px] text-amber-400/80">{t('aiReport.stagnantTasks')} {delayed.total_stagnant_tasks}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature progress */}
      {statistics.by_feature && statistics.by_feature.length > 0 && (
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-4 sm:p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-bridge-accent" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.featureProgress')}</span>
          </div>
          <div className="space-y-3">
            {statistics.by_feature.map((f, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {f.feature.color && (
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: f.feature.color }} />
                    )}
                    <span className="text-[11px] sm:text-xs text-muted-foreground truncate">{f.feature.title}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <span className="text-[10px] text-slate-600 hidden sm:inline">
                      {f.completed_task_count}/{f.task_count} {t('aiReport.taskCount')}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium w-8 text-right">
                      {Math.round(f.progress_percentage)}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-foreground/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-bridge-accent transition-all duration-500"
                    style={{ width: `${f.progress_percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member contributions */}
      {statistics.by_member && statistics.by_member.length > 0 && (
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-4 sm:p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-bridge-secondary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.memberContributions')}</span>
          </div>
          <div className="space-y-3">
            {statistics.by_member
              .sort((a, b) => b.total_minutes - a.total_minutes)
              .map((m, i) => {
                const maxMinutes = statistics.by_member[0]?.total_minutes || 1;
                const barWidth = (m.total_minutes / maxMinutes) * 100;
                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <span className="text-xs text-muted-foreground sm:w-20 truncate flex-shrink-0">{m.member.name}</span>
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className="flex-1 h-2 rounded-full bg-foreground/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-bridge-secondary/60 transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 w-12 text-right flex-shrink-0">
                        {formatMinutesToHours(m.total_minutes)}
                      </span>
                      <span className="text-[10px] text-slate-600 w-16 text-right flex-shrink-0">
                        {m.completed_task_count}/{m.task_count} {t('aiReport.taskCount')}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Milestone health */}
      {management.milestone_health && management.milestone_health.length > 0 && (
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-bridge-accent" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.milestoneHealth')}</span>
          </div>
          <div className="space-y-2.5">
            {management.milestone_health.map((ms, i) => {
              const statusStyle: Record<string, { text: string; bg: string; dot: string }> = {
                ON_TRACK: { text: 'text-emerald-400', bg: 'bg-emerald-400/10', dot: 'bg-emerald-400' },
                SLOW: { text: 'text-amber-400', bg: 'bg-amber-400/10', dot: 'bg-amber-400' },
                AT_RISK: { text: 'text-orange-400', bg: 'bg-orange-400/10', dot: 'bg-orange-400' },
                OVERDUE: { text: 'text-red-400', bg: 'bg-red-400/10', dot: 'bg-red-400' },
              };
              const s = statusStyle[ms.status] || statusStyle.ON_TRACK;
              return (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                    <span className="text-[11px] sm:text-xs text-muted-foreground truncate">{ms.milestone.title}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md ${s.text} ${s.bg}`}>
                      {ms.status.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-slate-600 w-8 sm:w-10 text-right">
                      {Math.round(ms.progress_percentage)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Meetings */}
      {data.meetings && data.meetings.length > 0 && (
        <MeetingsSection meetings={data.meetings} t={t} />
      )}
    </div>
  );
}

/* ─── Meetings Section (shared by Personal & Team) ─── */

function MeetingsSection({ meetings, t }: { meetings: ReportMeeting[]; t: (key: string) => string }) {
  return (
    <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-4 sm:p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-4 w-4 text-violet-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('aiReport.meetingsLabel')}</span>
        <span className="text-[10px] text-slate-600 ml-auto">{meetings.length}</span>
      </div>
      <div className="space-y-2.5">
        {meetings.map((meeting, i) => (
          <div key={i} className="flex items-start gap-3 py-2 border-b border-white/[0.03] last:border-b-0">
            <div className="flex-shrink-0 w-12 text-center pt-0.5">
              <div className="text-[10px] text-slate-500">{meeting.date.slice(5)}</div>
              {meeting.start_time && (
                <div className="text-[9px] text-slate-600">{meeting.start_time.slice(0, 5)}</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-slate-200 truncate">{meeting.title}</span>
                {meeting.has_transcript && (
                  <span className="text-[9px] text-violet-400/70 bg-violet-400/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {t('aiReport.hasTranscript')}
                  </span>
                )}
              </div>
              {meeting.participants.length > 0 && (
                <div className="flex items-center gap-1 mb-1">
                  <Users className="h-3 w-3 text-slate-700 flex-shrink-0" />
                  <span className="text-[10px] text-slate-500 truncate">
                    {meeting.participants.join(', ')}
                  </span>
                </div>
              )}
              {meeting.memo && (
                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{meeting.memo}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ feature, t }: { feature: PersonalReportFeature; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState(true);

  // Parse progress "2/4"
  const progressParts = feature.progress.split('/');
  const completed = parseInt(progressParts[0]) || 0;
  const total = parseInt(progressParts[1]) || 0;
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;

  const statusConfig: Record<string, { color: string; bg: string; border: string }> = {
    NOT_STARTED: { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-l-slate-500/50' },
    IN_PROGRESS: { color: 'text-bridge-accent', bg: 'bg-bridge-accent/10', border: 'border-l-bridge-accent' },
    DONE: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-l-emerald-400' },
  };

  const status = statusConfig[feature.status] || statusConfig.NOT_STARTED;

  return (
    <div className={`bg-bridge-obsidian rounded-xl border border-foreground/5 overflow-hidden border-l-2 ${status.border}`}>
      {/* Feature header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 sm:px-5 py-3 sm:py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-md flex-shrink-0 ${status.color} ${status.bg}`}>
            {feature.status.replace('_', ' ')}
          </span>
          <span className="text-xs sm:text-sm font-medium text-foreground truncate">{feature.title}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-2 sm:ml-3">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-full bg-foreground/5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  feature.status === 'DONE' ? 'bg-emerald-400' : 'bg-bridge-accent'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] sm:text-xs text-slate-500 font-medium">{feature.progress}</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
          )}
        </div>
      </button>

      {/* Tasks */}
      {expanded && (
        <div className="border-t border-foreground/5">
          {feature.tasks.map((task, ti) => (
            <div
              key={ti}
              className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-white/[0.03] last:border-b-0"
            >
              {/* Task header */}
              <div className="flex items-start sm:items-center gap-2 mb-2">
                {task.completed ? (
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5 sm:mt-0" />
                ) : (
                  <Square className="h-3.5 w-3.5 text-slate-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                )}
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className={`text-xs sm:text-sm ${task.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                    {task.title}
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-slate-600 bg-foreground/5 px-1.5 sm:px-2 py-0.5 rounded-full">{task.block}</span>
                </div>
                {task.time_minutes != null && task.time_minutes > 0 && (
                  <span className="text-[10px] text-bridge-accent flex-shrink-0">
                    {formatMinutesToHours(task.time_minutes)}
                  </span>
                )}
              </div>

              {/* Checklists */}
              {task.checklists && task.checklists.length > 0 && (
                <div className="ml-5 sm:ml-5 flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 mb-1.5">
                  {task.checklists.map((cl, ci) => (
                    <div key={ci} className="flex items-center gap-1.5 text-[11px]">
                      {cl.completed ? (
                        <CheckSquare className="h-3 w-3 text-emerald-400/70" />
                      ) : (
                        <Square className="h-3 w-3 text-slate-700" />
                      )}
                      <span className={cl.completed ? 'text-slate-500' : 'text-slate-400'}>{cl.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Time details */}
              {task.time_details && task.time_details.length > 0 && (
                <div className="ml-5 sm:ml-5 flex items-center gap-1 flex-wrap mb-1.5">
                  <Timer className="h-3 w-3 text-slate-700 mr-1" />
                  {task.time_details.map((td, tdi) => (
                    <span
                      key={tdi}
                      className="text-[10px] text-slate-600 bg-white/[0.03] px-1.5 py-0.5 rounded"
                    >
                      {td.date.slice(5)} {formatMinutesToHours(td.minutes)}
                    </span>
                  ))}
                </div>
              )}

              {/* Comments */}
              {task.comments && task.comments.length > 0 && (
                <div className="ml-5 sm:ml-5 space-y-1">
                  {task.comments.map((cm, cmi) => (
                    <div key={cmi} className="flex items-start gap-1.5 text-[11px]">
                      <MessageSquare className="h-3 w-3 text-slate-700 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-500 leading-relaxed">{cm.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
