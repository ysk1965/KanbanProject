import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Megaphone, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { systemService } from '../utils/services';
import type { AnnouncementDetail } from '../utils/api';

export function AnnouncementDisplay() {
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<AnnouncementDetail[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());
  const [popupAnnouncement, setPopupAnnouncement] = useState<AnnouncementDetail | null>(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const banners = announcements.filter(
    (a) => a.type === 'BANNER' && !dismissedBanners.has(a.id)
  );

  // 자동 롤링 타이머
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!isPaused) {
        setCurrentBannerIndex((prev) => (prev + 1) % Math.max(banners.length, 1));
      }
    }, 5000);
  }, [banners.length, isPaused]);

  useEffect(() => {
    if (banners.length > 1) {
      startTimer();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [banners.length, startTimer]);

  // 배너 인덱스 범위 유지
  useEffect(() => {
    if (currentBannerIndex >= banners.length && banners.length > 0) {
      setCurrentBannerIndex(0);
    }
  }, [banners.length, currentBannerIndex]);

  const loadAnnouncements = async () => {
    try {
      const data = await systemService.getActiveAnnouncements();
      console.log('📢 [Announcements] Loaded:', data);
      setAnnouncements(data);

      // 로컬스토리지에서 오늘 닫은 팝업 확인
      const todayKey = `dismissed_popups_${new Date().toISOString().slice(0, 10)}`;
      const dismissed = JSON.parse(localStorage.getItem(todayKey) || '[]') as string[];

      // 팝업 공지 중 아직 닫지 않은 것 찾기
      const popup = data.find(
        (a) => a.type === 'POPUP' && !dismissed.includes(a.id)
      );
      if (popup) {
        setPopupAnnouncement(popup);
      }
    } catch (err) {
      // 공지사항 로드 실패는 무시 (서비스에 영향 없음)
      console.error('Failed to load announcements:', err);
    }
  };

  const dismissBanner = (id: string) => {
    setDismissedBanners((prev) => new Set(prev).add(id));
  };

  const dismissPopup = (id: string, today?: boolean) => {
    setPopupAnnouncement(null);
    if (today) {
      const todayKey = `dismissed_popups_${new Date().toISOString().slice(0, 10)}`;
      const dismissed = JSON.parse(localStorage.getItem(todayKey) || '[]') as string[];
      dismissed.push(id);
      localStorage.setItem(todayKey, JSON.stringify(dismissed));
    }
  };

  const goToBanner = (index: number) => {
    setCurrentBannerIndex(index);
    // 수동 전환 시 타이머 리셋
    if (timerRef.current) clearInterval(timerRef.current);
    startTimer();
  };

  const currentBanner = banners[currentBannerIndex];

  return (
    <>
      {/* Rolling Banner */}
      {currentBanner && (
        <div
          className="bg-bridge-accent/90 backdrop-blur-sm border-b border-bridge-accent relative overflow-hidden"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="px-4 py-2 flex items-center gap-3">
            {/* 메가폰 아이콘 */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Megaphone className="h-3.5 w-3.5 text-white/80" />
              {banners.length > 1 && (
                <span className="text-[10px] text-white/50 font-medium tabular-nums">
                  {currentBannerIndex + 1}/{banners.length}
                </span>
              )}
            </div>

            {/* 이전 버튼 */}
            {banners.length > 1 && (
              <button
                onClick={() => goToBanner((currentBannerIndex - 1 + banners.length) % banners.length)}
                className="p-0.5 text-white/40 hover:text-white transition-colors flex-shrink-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}

            {/* 배너 텍스트 (마퀴 효과) */}
            <div className="flex-1 min-w-0 overflow-hidden">
              <div
                key={currentBanner.id}
                className="animate-slide-in-banner"
              >
                <p className="text-sm text-white font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                  {currentBanner.title}
                  {currentBanner.content && (
                    <span className="text-white/70 ml-2 font-normal">
                      {currentBanner.content}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* 다음 버튼 */}
            {banners.length > 1 && (
              <button
                onClick={() => goToBanner((currentBannerIndex + 1) % banners.length)}
                className="p-0.5 text-white/40 hover:text-white transition-colors flex-shrink-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}

            {/* 닫기 버튼 */}
            <button
              onClick={() => dismissBanner(currentBanner.id)}
              className="p-0.5 text-white/40 hover:text-white transition-colors flex-shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* 진행 바 (여러 배너일 때) */}
          {banners.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
              <div
                className={`h-full bg-white/40 transition-all duration-300 ${!isPaused ? 'animate-banner-progress' : ''}`}
                style={{
                  width: `${((currentBannerIndex + 1) / banners.length) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Popup Modal */}
      {popupAnnouncement && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-bridge-accent/10 p-2 rounded-xl">
                  <Info className="h-5 w-5 text-bridge-accent" />
                </div>
                <h3 className="text-lg font-bold text-white">{popupAnnouncement.title}</h3>
              </div>
              <button
                onClick={() => dismissPopup(popupAnnouncement.id)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {popupAnnouncement.content && (
              <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap mb-6">
                {popupAnnouncement.content}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => dismissPopup(popupAnnouncement.id, true)}
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 text-slate-300 rounded-xl text-sm hover:bg-white/10 transition-colors"
              >
                {t('announcement.dismissToday')}
              </button>
              <button
                onClick={() => dismissPopup(popupAnnouncement.id)}
                className="flex-1 px-4 py-2.5 bg-bridge-accent text-white rounded-xl text-sm font-medium hover:bg-bridge-accent/90 transition-colors"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
