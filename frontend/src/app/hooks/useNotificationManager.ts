import { useState, useEffect } from 'react';
import { notificationAPI } from '../utils/api';
import { wsManager } from '../utils/websocket';

export function useNotificationManager(
  boardId: string | undefined,
  currentUser: { id: string } | null,
  isRealtimeEnabled: boolean,
  isInquiryModalOpen: boolean
) {
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadInquiryCount, setUnreadInquiryCount] = useState(0);

  // 알림 + 문의 미읽음 수를 한 번에 조회
  useEffect(() => {
    if (!boardId || !currentUser) return;
    const fetchUnreadCounts = async () => {
      try {
        const response = await notificationAPI.getUnreadCounts(boardId);
        setUnreadNotificationCount(response.unread_count);
        setUnreadInquiryCount(response.unread_inquiry_count);
      } catch (error) {
        /* silently fail */
      }
    };
    fetchUnreadCounts();
    if (!isRealtimeEnabled) {
      const interval = setInterval(fetchUnreadCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [boardId, currentUser, isRealtimeEnabled]);

  // 문의 답변 WebSocket 실시간 구독
  useEffect(() => {
    if (!currentUser) return;

    // subscribe가 자동으로 연결 시작/유지, 재연결 시 자동 재구독
    const subscription = wsManager.subscribe(
      `/topic/user/${currentUser.id}`,
      (message) => {
        try {
          const event = JSON.parse(message.body);
          if (event.type === 'INQUIRY_REPLIED') {
            const unreadCount = event.data?.unread_count;
            if (typeof unreadCount === 'number') {
              setUnreadInquiryCount(unreadCount);
            } else {
              setUnreadInquiryCount(prev => prev + 1);
            }
          }
        } catch (error) {
          console.error('[useNotificationManager] Failed to parse global user event:', error);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [currentUser, isInquiryModalOpen]);

  return {
    unreadNotificationCount,
    setUnreadNotificationCount,
    unreadInquiryCount,
    setUnreadInquiryCount,
  };
}
