import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Cake, PartyPopper, ChevronRight, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { anniversaryService } from "../../utils/services";
import { resolveFileUrl } from "../../utils/api";
import type {
  AnniversaryItem,
  AnniversaryType,
  AnniversaryDashboardRange,
} from "../../types";

interface AnniversaryWidgetProps {
  orgId: string;
  onOpenCelebration: (
    memberId: string,
    memberName: string,
    type: AnniversaryType,
    date: string,
  ) => void;
}

export function AnniversaryWidget({
  orgId,
  onOpenCelebration,
}: AnniversaryWidgetProps) {
  const { t } = useTranslation();
  const [range, setRange] = useState<AnniversaryDashboardRange>("THIS_MONTH");
  const [todayItems, setTodayItems] = useState<AnniversaryItem[]>([]);
  const [weekItems, setWeekItems] = useState<AnniversaryItem[]>([]);
  const [monthItems, setMonthItems] = useState<AnniversaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRangeDropdown, setShowRangeDropdown] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await anniversaryService.getUpcoming(orgId, range);
        setTodayItems(data.today || []);
        setWeekItems(data.this_week || []);
        setMonthItems(data.this_month || []);
      } catch {
        // Optional data
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [orgId, range]);

  const hasAny =
    todayItems.length > 0 || weekItems.length > 0 || monthItems.length > 0;

  const rangeLabel =
    range === "THIS_WEEK"
      ? t("organization.anniversary.dashboardRangeWeek", "This Week")
      : t("organization.anniversary.dashboardRangeMonth", "This Month");

  const renderItem = (
    item: AnniversaryItem,
    index: number,
    isToday: boolean,
  ) => {
    const isBirthday = item.type === "BIRTHDAY";
    const Icon = isBirthday ? Cake : PartyPopper;
    const iconBg = isBirthday ? "bg-pink-500/15" : "bg-amber-500/15";
    const iconText = isBirthday ? "text-pink-500" : "text-amber-500";

    const typeLabel = isBirthday
      ? t("organization.anniversary.birthday", "Birthday")
      : item.years
        ? t(
            "organization.anniversary.hireAnniversary",
            "{{years}} Year Work Anniversary",
            { years: String(item.years) },
          )
        : t(
            "organization.anniversary.hireAnniversaryNoYears",
            "Work Anniversary",
          );

    return (
      <motion.div
        key={`${item.member_id}-${item.type}-${item.date}`}
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.04 }}
        className="flex items-center gap-3 py-2.5 group"
      >
        {/* Avatar or Icon */}
        <div className="relative shrink-0">
          {item.profile_image_url ? (
            <img
              src={resolveFileUrl(item.profile_image_url)}
              alt={item.member_name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-bridge-accent/15 flex items-center justify-center text-xs text-bridge-accent font-bold">
              {item.member_name.charAt(0)}
            </div>
          )}
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${iconBg} flex items-center justify-center`}
          >
            <Icon size={8} className={iconText} />
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground font-medium truncate">
              {item.member_name}
            </span>
            {item.department_name && (
              <span className="text-xs text-muted-foreground truncate">
                {item.department_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isBirthday ? "bg-pink-500/15 text-pink-600 dark:text-pink-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}
            >
              {typeLabel}
            </span>
            <span className="text-xs text-muted-foreground">
              {(() => {
                const [, m, d] = item.date.split("-");
                return `${parseInt(m)}/${parseInt(d)}`;
              })()}
            </span>
            {item.message_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {t(
                  "organization.anniversary.messageCount",
                  "{{count}} messages",
                  { count: String(item.message_count) },
                )}
              </span>
            )}
          </div>
        </div>

        {/* Action */}
        {isToday && (
          <button
            onClick={() =>
              onOpenCelebration(
                item.member_id,
                item.member_name,
                item.type,
                item.date,
              )
            }
            className="flex items-center gap-1 text-xs text-bridge-accent hover:text-bridge-accent/80 font-medium transition-colors shrink-0 opacity-0 group-hover:opacity-100"
          >
            {t("organization.anniversary.sendMessage", "Send Message")}
            <ChevronRight size={12} />
          </button>
        )}
      </motion.div>
    );
  };

  const renderGroup = (
    title: string,
    items: AnniversaryItem[],
    isToday: boolean,
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="mt-4 first:mt-0">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
          {title}
        </div>
        <div className="divide-y divide-foreground/[0.08]">
          {items.map((item, index) => renderItem(item, index, isToday))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-32 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] animate-pulse" />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cake size={14} className="text-pink-500" />
          <h3 className="text-sm font-bold text-foreground">
            {t("organization.anniversary.title", "Upcoming Anniversaries")}
          </h3>
          {hasAny && (
            <span className="text-xs font-bold text-pink-600 dark:text-pink-400 bg-pink-500/15 px-1.5 py-0.5 rounded-full">
              {todayItems.length + weekItems.length + monthItems.length}
            </span>
          )}
        </div>

        {/* Range selector */}
        <div className="relative">
          <button
            onClick={() => setShowRangeDropdown(!showRangeDropdown)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {rangeLabel}
            <ChevronDown size={12} />
          </button>
          {showRangeDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowRangeDropdown(false)}
              />
              <div className="absolute right-0 top-6 z-20 bg-bridge-obsidian border border-foreground/10 rounded-lg shadow-xl py-1 min-w-[120px]">
                {(
                  ["THIS_WEEK", "THIS_MONTH"] as AnniversaryDashboardRange[]
                ).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRange(r);
                      setShowRangeDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      range === r
                        ? "text-bridge-accent font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]"
                    }`}
                  >
                    {r === "THIS_WEEK"
                      ? t(
                          "organization.anniversary.dashboardRangeWeek",
                          "This Week",
                        )
                      : t(
                          "organization.anniversary.dashboardRangeMonth",
                          "This Month",
                        )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {!hasAny ? (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-pink-500/15 flex items-center justify-center mx-auto mb-3">
            <Cake size={24} className="text-pink-500/60" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "organization.anniversary.noAnniversaries",
              "No upcoming anniversaries",
            )}
          </p>
        </div>
      ) : (
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-4">
          {renderGroup(
            t("organization.anniversary.today", "Today"),
            todayItems,
            true,
          )}
          {renderGroup(
            t("organization.anniversary.thisWeek", "This Week"),
            weekItems,
            false,
          )}
          {renderGroup(
            t("organization.anniversary.thisMonth", "This Month"),
            monthItems,
            false,
          )}
        </div>
      )}
    </div>
  );
}
