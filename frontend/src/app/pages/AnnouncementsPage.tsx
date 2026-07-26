import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Megaphone,
  Info,
  AlertCircle,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { systemService } from "../utils/services";
import type { AnnouncementDetail } from "../utils/api";
import { formatDate } from "../utils/dateUtils";

export function AnnouncementsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<AnnouncementDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementDetail | null>(null);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      setIsLoading(true);
      const data = await systemService.getActiveAnnouncements();
      // 우선순위 높은 순, 최신순 정렬
      const sorted = data.sort((a, b) => {
        if (a.priority !== b.priority)
          return (b.priority || 0) - (a.priority || 0);
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
      setAnnouncements(sorted);
    } catch (err) {
      console.error("Failed to load announcements:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "BANNER":
        return <Megaphone className="h-5 w-5" />;
      case "POPUP":
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "BANNER":
        return {
          label: t("announcements.banner"),
          color: "bg-orange-500/20 text-orange-400",
        };
      case "POPUP":
        return {
          label: t("announcements.popup"),
          color: "bg-red-500/20 text-red-400",
        };
      default:
        return {
          label: t("announcements.notice"),
          color: "bg-bridge-accent/20 text-bridge-accent",
        };
    }
  };

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Header */}
      <header className="bg-bridge-obsidian border-b border-foreground/5 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {t("announcements.title")}
            </h1>
            <p className="text-sm text-slate-400">
              {t("announcements.subtitle")}
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-foreground/5 mb-4">
              <Megaphone className="h-8 w-8 text-slate-500" />
            </div>
            <p className="text-slate-400">
              {t("announcements.noAnnouncements")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => {
              const badge = getTypeBadge(announcement.type);
              return (
                <button
                  key={announcement.id}
                  onClick={() => setSelectedAnnouncement(announcement)}
                  className="w-full bg-bridge-obsidian rounded-2xl border border-foreground/5 p-5 text-left hover:border-foreground/10 hover:bg-white/[0.02] transition-all group"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-2.5 rounded-xl ${badge.color.split(" ")[0]}`}
                    >
                      {getTypeIcon(announcement.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                        {announcement.priority && announcement.priority > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                            {t("announcements.important")}
                          </span>
                        )}
                      </div>
                      <h3 className="text-foreground font-medium mb-1 group-hover:text-bridge-accent transition-colors">
                        {announcement.title}
                      </h3>
                      {announcement.content && (
                        <p className="text-sm text-slate-400 line-clamp-2">
                          {announcement.content}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(announcement.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedAnnouncement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setSelectedAnnouncement(null)}
        >
          <div
            className="bg-bridge-obsidian rounded-2xl border border-foreground/10 shadow-2xl w-full max-w-lg max-h-[80dvh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-foreground/5">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${getTypeBadge(selectedAnnouncement.type).color}`}
                >
                  {getTypeBadge(selectedAnnouncement.type).label}
                </span>
                <span className="text-xs text-slate-500">
                  {formatDate(selectedAnnouncement.created_at)}
                </span>
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {selectedAnnouncement.title}
              </h2>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[50dvh]">
              {selectedAnnouncement.content ? (
                <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {selectedAnnouncement.content}
                </div>
              ) : (
                <p className="text-slate-500 italic">
                  {t("announcements.noContent")}
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-foreground/5">
              <button
                onClick={() => setSelectedAnnouncement(null)}
                className="w-full py-3 bg-bridge-accent text-white rounded-xl font-medium hover:bg-bridge-accent/90 transition-colors"
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
