import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
} from 'lucide-react';
import { reportAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import type { ReportType, WeeklyReport, WeeklyReportListItem, BoardMember } from '../types';
import { formatDateTime } from '../utils/dateUtils';

interface AIReportPanelProps {
  boardId: string;
  members: BoardMember[];
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

export function AIReportPanel({ boardId, members }: AIReportPanelProps) {
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

  // User role check
  const currentMember = members.find((m) => m.user.id === currentUser?.id);
  const isAdminOrOwner = currentMember?.role === 'OWNER' || currentMember?.role === 'ADMIN';

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
      const response = await reportAPI.getReports(boardId, reportType);
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
  }, [boardId, reportType, periodStart, periodEnd]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Generate report
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const lang = navigator.language?.startsWith('ko') ? 'ko' :
                   navigator.language?.startsWith('ja') ? 'ja' : 'en';
      const result = await reportAPI.generateReport(boardId, {
        reportType,
        periodStart,
        periodEnd,
        language: lang,
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

  // Regenerate
  const handleRegenerate = async () => {
    if (!report) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await reportAPI.regenerateReport(boardId, report.id);
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
    <div className="h-full flex bg-bridge-dark">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-none px-6 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            {/* Week navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWeekOffset((p) => p - 1)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-medium text-white min-w-[160px] text-center">
                {formatDisplayDate(weekRange.start)} ~ {formatDisplayDate(weekRange.end)}
                {weekOffset === -1 && (
                  <span className="ml-2 text-xs text-slate-500">({t('aiReport.lastWeek')})</span>
                )}
                {weekOffset === 0 && (
                  <span className="ml-2 text-xs text-slate-500">({t('aiReport.thisWeek')})</span>
                )}
              </div>
              <button
                onClick={() => setWeekOffset((p) => Math.min(p + 1, 0))}
                disabled={weekOffset >= 0}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Report type toggle */}
            <div className="flex items-center gap-1 bg-bridge-dark rounded-xl p-1 border border-white/20">
              <button
                onClick={() => setReportType('PERSONAL')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  reportType === 'PERSONAL'
                    ? 'bg-bridge-accent text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <User className="h-4 w-4" />
                {t('aiReport.personalReport')}
              </button>
              {isAdminOrOwner && (
                <button
                  onClick={() => setReportType('TEAM')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    reportType === 'TEAM'
                      ? 'bg-bridge-accent text-white shadow-lg'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Users className="h-4 w-4" />
                  {t('aiReport.teamReport')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isGenerating ? (
            /* Loading state */
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative mb-6">
                <Sparkles className="h-12 w-12 text-bridge-accent animate-pulse" />
              </div>
              <p className="text-slate-400 text-sm">{t('aiReport.generating')}</p>
              <p className="text-slate-600 text-xs mt-2">{t('aiReport.generatingHint')}</p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-6 w-6 border-2 border-bridge-accent border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            /* Error state */
            <div className="flex flex-col items-center justify-center py-20">
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
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatDateTime(report.created_at)}</span>
                  <span className="text-slate-700">|</span>
                  <span>{report.generated_by_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRegenerate}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg border border-white/10 transition-all"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('aiReport.regenerate')}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg border border-white/10 transition-all"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? t('aiReport.copied') : t('aiReport.copy')}
                  </button>
                </div>
              </div>

              {/* Markdown content */}
              <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-8">
                <div className="prose prose-invert prose-sm max-w-none
                  prose-headings:text-white prose-headings:font-bold
                  prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2
                  prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
                  prose-p:text-slate-300 prose-p:leading-relaxed
                  prose-li:text-slate-300
                  prose-strong:text-white
                  prose-table:border-collapse
                  prose-th:bg-white/5 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-slate-300 prose-th:text-xs prose-th:font-bold prose-th:uppercase prose-th:tracking-wider prose-th:border prose-th:border-white/10
                  prose-td:px-3 prose-td:py-2 prose-td:text-slate-400 prose-td:border prose-td:border-white/10
                ">
                  <ReactMarkdown>{report.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            /* Empty state - generate button */
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-bridge-accent/10 flex items-center justify-center mb-6">
                <Sparkles className="h-8 w-8 text-bridge-accent" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{t('aiReport.title')}</h3>
              <p className="text-slate-500 text-sm mb-8 text-center max-w-md">
                {reportType === 'TEAM' ? t('aiReport.teamDescription') : t('aiReport.personalDescription')}
              </p>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-6 py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
              >
                <Sparkles className="h-4 w-4" />
                {t('aiReport.generate')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sidebar - Report history */}
      {reportHistory.length > 0 && (
        <div className="w-64 border-l border-white/10 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {t('aiReport.history')}
            </h4>
          </div>
          <div className="flex-1 overflow-y-auto">
            {reportHistory.map((item) => (
              <button
                key={item.id}
                onClick={() => handleLoadHistoryReport(item.id)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
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
      )}
    </div>
  );
}
