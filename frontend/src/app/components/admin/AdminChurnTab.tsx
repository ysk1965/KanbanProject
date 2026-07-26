import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  UserMinus,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Clock,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { IconButton } from "../ui/IconButton";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { adminService } from "../../utils/services";
import type {
  RetentionAnalysis,
  InactiveUserList,
  TrialDropoutAnalysis,
  ActivityTrends,
} from "../../utils/api";

type InactivePeriod = 7 | 14 | 30;

export function AdminChurnTab() {
  const { t } = useTranslation();
  const [retention, setRetention] = useState<RetentionAnalysis | null>(null);
  const [inactiveUsers, setInactiveUsers] = useState<InactiveUserList | null>(
    null,
  );
  const [trialDropout, setTrialDropout] = useState<TrialDropoutAnalysis | null>(
    null,
  );
  const [activityTrends, setActivityTrends] = useState<ActivityTrends | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inactivePeriod, setInactivePeriod] = useState<InactivePeriod>(14);
  const [inactivePage, setInactivePage] = useState(0);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    loadInactiveUsers();
  }, [inactivePeriod, inactivePage]);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [ret, dropout, trends, inactive] = await Promise.all([
        adminService.getRetentionAnalysis(8),
        adminService.getTrialDropoutAnalysis(90),
        adminService.getActivityTrends(90),
        adminService.getInactiveUsers(inactivePeriod, 0, 20),
      ]);
      setRetention(ret);
      setTrialDropout(dropout);
      setActivityTrends(trends);
      setInactiveUsers(inactive);
      setInactivePage(0);
    } catch (err) {
      console.error("Failed to load churn data:", err);
      setError(t("admin.churn.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadInactiveUsers = async () => {
    try {
      const data = await adminService.getInactiveUsers(
        inactivePeriod,
        inactivePage,
        20,
      );
      setInactiveUsers(data);
    } catch (err) {
      console.error("Failed to load inactive users:", err);
    }
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-64"
        role="status"
        aria-label="로딩 중"
      >
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button
          onClick={loadAllData}
          className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: "var(--bridge-obsidian)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "12px",
  };

  const formatWeek = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatAction = (action: string) => {
    return action
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getRetentionColor = (value: number) => {
    if (value >= 80) return "bg-emerald-500/80 text-white";
    if (value >= 60) return "bg-emerald-500/60 text-white";
    if (value >= 40) return "bg-emerald-500/40 text-white";
    if (value >= 20) return "bg-amber-500/40 text-white";
    if (value > 0) return "bg-red-500/30 text-white";
    return "bg-foreground/5 text-slate-500";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {t("admin.churn.title")}
          </h2>
          <p className="text-slate-400">{t("admin.churn.subtitle")}</p>
        </div>
        <button
          onClick={loadAllData}
          className="flex items-center gap-2 px-4 py-2 bg-foreground/5 border border-foreground/10 text-muted-foreground rounded-xl hover:bg-foreground/10 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          {t("admin.common.refresh")}
        </button>
      </div>

      {/* Summary Cards */}
      {inactiveUsers?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label={t("admin.churn.inactive7d")}
            value={inactiveUsers.summary.inactive_7d}
            icon={<Clock className="h-5 w-5 text-amber-400" />}
            color="amber"
          />
          <MetricCard
            label={t("admin.churn.inactive14d")}
            value={inactiveUsers.summary.inactive_14d}
            icon={<AlertTriangle className="h-5 w-5 text-orange-400" />}
            color="orange"
          />
          <MetricCard
            label={t("admin.churn.inactive30d")}
            value={inactiveUsers.summary.inactive_30d}
            icon={<UserMinus className="h-5 w-5 text-red-400" />}
            color="red"
          />
        </div>
      )}

      {/* Retention Heatmap */}
      {retention && retention.cohorts.length > 0 && (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
          <h3 className="text-sm font-bold text-foreground mb-1">
            {t("admin.churn.retention")}
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            {t("admin.churn.retentionDesc")}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr>
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">
                    {t("admin.churn.cohortWeek")}
                  </th>
                  <th className="text-center py-2 px-2 text-slate-400 font-medium">
                    {t("admin.churn.signups")}
                  </th>
                  {Array.from(
                    {
                      length: Math.min(
                        retention.cohorts[0]?.retention.length || 0,
                        9,
                      ),
                    },
                    (_, i) => (
                      <th
                        key={i}
                        className="text-center py-2 px-1 text-slate-400 font-medium"
                      >
                        {t("admin.churn.weekN", { n: i })}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {retention.cohorts.map((cohort) => (
                  <tr
                    key={cohort.cohort_week}
                    className="border-t border-foreground/[0.05]"
                  >
                    <td className="py-1.5 px-2 text-slate-400">
                      {formatWeek(cohort.cohort_week)}
                    </td>
                    <td className="py-1.5 px-2 text-center text-foreground font-medium">
                      {cohort.signup_count}
                    </td>
                    {cohort.retention.slice(0, 9).map((rate, i) => (
                      <td key={i} className="py-1 px-0.5 text-center">
                        <span
                          className={`inline-block w-full rounded px-1 py-0.5 text-xs font-bold ${getRetentionColor(rate)}`}
                        >
                          {rate}%
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Average row */}
                <tr className="border-t-2 border-foreground/[0.12]">
                  <td className="py-1.5 px-2 text-foreground font-bold">
                    {t("admin.churn.average")}
                  </td>
                  <td className="py-1.5 px-2 text-center">—</td>
                  {retention.average_retention.slice(0, 9).map((rate, i) => (
                    <td key={i} className="py-1 px-0.5 text-center">
                      <span
                        className={`inline-block w-full rounded px-1 py-0.5 text-xs font-bold ${getRetentionColor(rate)}`}
                      >
                        {rate}%
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trial Dropout Analysis */}
      {trialDropout && trialDropout.total_expired_trials > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Dropout by Day */}
          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
            <h3 className="text-sm font-bold text-foreground mb-1">
              {t("admin.churn.trialDropout")}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {t("admin.churn.totalTrials", {
                count: trialDropout.total_expired_trials,
              })}
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trialDropout.dropout_by_day}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="trial_day"
                    tickFormatter={(v) => `Day ${v}`}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) => `Trial Day ${v}`}
                    formatter={(value: number, name: string) => {
                      if (name === "count")
                        return [value, t("admin.churn.dropoutCount")];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="count" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {trialDropout.never_acted_count > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                {t("admin.churn.neverActed")}: {trialDropout.never_acted_count}{" "}
                ({trialDropout.never_acted_percentage}%)
              </p>
            )}
          </div>

          {/* Actions Before Dropout */}
          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
            <h3 className="text-sm font-bold text-foreground mb-4">
              {t("admin.churn.actionsBeforeDropout")}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trialDropout.actions_before_dropout.slice(0, 8)}
                  layout="vertical"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="action"
                    tickFormatter={formatAction}
                    width={120}
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={formatAction}
                    formatter={(value: number) => [
                      value,
                      t("admin.churn.boardCount"),
                    ]}
                  />
                  <Bar dataKey="count" fill="#6366F1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Activity Trends */}
      {activityTrends && activityTrends.weekly_activity.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Weekly Activity Trend */}
          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {t("admin.churn.activityTrend")}
                </h3>
                {activityTrends.activity_change_rate !== 0 && (
                  <p
                    className={`text-xs mt-1 flex items-center gap-1 ${
                      activityTrends.activity_change_rate >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    <TrendingDown className="h-3 w-3" />
                    {t("admin.churn.changeRate")}:{" "}
                    {activityTrends.activity_change_rate > 0 ? "+" : ""}
                    {activityTrends.activity_change_rate}%
                  </p>
                )}
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activityTrends.weekly_activity}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="week"
                    tickFormatter={formatWeek}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={formatWeek}
                  />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="total_actions"
                    name={t("admin.churn.totalActions")}
                    stroke="#6366F1"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="active_users"
                    name={t("admin.churn.activeUsers")}
                    stroke="#2DD4BF"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Feature Usage */}
          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
            <h3 className="text-sm font-bold text-foreground mb-4">
              {t("admin.churn.featureUsage")}
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityTrends.feature_usage.slice(0, 10)}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.05)"
                  />
                  <XAxis
                    dataKey="action"
                    tickFormatter={(v) => formatAction(v).substring(0, 10)}
                    tick={{ fill: "#94a3b8", fontSize: 9 }}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={formatAction}
                  />
                  <Legend />
                  <Bar
                    dataKey="count"
                    name={t("admin.churn.totalActions")}
                    fill="#6366F1"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="unique_users"
                    name={t("admin.churn.uniqueUsers")}
                    fill="#2DD4BF"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Inactive Users Table */}
      {inactiveUsers && (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-foreground">
              {t("admin.churn.inactiveUsers")}
            </h3>
            <div className="flex gap-1">
              {([7, 14, 30] as InactivePeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => {
                    setInactivePeriod(period);
                    setInactivePage(0);
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    inactivePeriod === period
                      ? "bg-bridge-accent text-white"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {period}d+
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-foreground/[0.08]">
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t("admin.churn.user")}
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t("admin.churn.created")}
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t("admin.churn.lastActive")}
                  </th>
                  <th className="text-center py-2 px-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t("admin.churn.inactiveDaysCol")}
                  </th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t("admin.churn.lastAction")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {inactiveUsers.users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-foreground/[0.04] hover:bg-foreground/[0.02] transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        {user.profile_image ? (
                          <img
                            src={user.profile_image}
                            alt={user.name || "프로필"}
                            className="w-7 h-7 rounded-full"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-bridge-accent/20 flex items-center justify-center text-xs font-bold text-bridge-accent">
                            {user.name?.charAt(0) || "?"}
                          </div>
                        )}
                        <div>
                          <p className="text-[13px] font-medium text-foreground">
                            {user.name}
                          </p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[12px] text-slate-400">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-[12px] text-slate-400">
                      {user.last_active_at
                        ? new Date(user.last_active_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                          user.inactive_days >= 30
                            ? "bg-red-500/15 text-red-600 dark:text-red-400"
                            : user.inactive_days >= 14
                              ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {user.inactive_days}d
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-400">
                      {user.last_action
                        ? formatAction(user.last_action)
                        : t("admin.churn.noActivity")}
                    </td>
                  </tr>
                ))}
                {inactiveUsers.users.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-slate-500 text-sm"
                    >
                      {t("admin.churn.noInactiveUsers")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {inactiveUsers.total > 20 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-foreground/[0.06]">
              <p className="text-xs text-slate-500">
                {inactivePage * 20 + 1}–
                {Math.min((inactivePage + 1) * 20, inactiveUsers.total)} /{" "}
                {inactiveUsers.total}
              </p>
              <div className="flex gap-1">
                <IconButton
                  onClick={() => setInactivePage(Math.max(0, inactivePage - 1))}
                  disabled={inactivePage === 0}
                  aria-label="이전 페이지"
                  className="disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft />
                </IconButton>
                <IconButton
                  onClick={() => setInactivePage(inactivePage + 1)}
                  disabled={(inactivePage + 1) * 20 >= inactiveUsers.total}
                  aria-label="다음 페이지"
                  className="disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight />
                </IconButton>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  const bgColor =
    color === "amber"
      ? "bg-amber-500/10"
      : color === "orange"
        ? "bg-orange-500/10"
        : "bg-red-500/10";

  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <div className={`p-2 rounded-lg ${bgColor}`}>{icon}</div>
      </div>
      <p className="text-3xl font-bold text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
