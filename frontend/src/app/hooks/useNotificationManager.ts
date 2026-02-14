import { useState, useEffect } from 'react';
import { notificationAPI } from '../utils/api';
import { inquiryService } from '../utils/services';
import { wsManager } from '../utils/websocket';

export function useNotificationManager(
  boardId: string | undefined,
  currentUser: { id: string } | null,
  isRealtimeEnabled: boolean,
  isInquiryModalOpen: boolean
) {
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadInquiryCount, setUnreadInquiryCount] = useState(0);

  // 알림: PREMIUM/TRIAL은 WebSocket으로 실시간, STANDARD는 30초 폴링
  useEffect(() => {
    if (!boardId || !currentUser) return;
    const fetchUnreadCount = async () => {
      try {
        const response = await notificationAPI.getUnreadCount(boardId);
        setUnreadNotificationCount(response.unread_count);
      } catch (error) {
        /* silently fail */
      }
    };
    fetchUnreadCount();
    if (!isRealtimeEnabled) {
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [boardId, currentUser, isRealtimeEnabled]);

  // 문의 읽지 않은 답변 수 로드 + WebSocket 실시간 구독
  useEffect(() => {
    if (!currentUser) return;
    const fetchUnreadInquiryCount = async () => {
      try {
        const count = await inquiryService.getUnreadReplyCount();
        setUnreadInquiryCount(count);
      } catch (error) {
        /* silently fail */
      }
    };
    fetchUnreadInquiryCount();

    let subscription: { unsubscribe: () => void } | null = null;
    const subscribeToInquiry = () => {
      subscription = wsManager.subscribe(
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
    };

    const removeStatusListener = wsManager.onStatusChange((status) => {
      if (status === 'connected' && !subscription) {
        subscribeToInquiry();
      }
    });

    if (wsManager.getStatus() === 'connected') {
      subscribeToInquiry();
    }

    return () => {
      subscription?.unsubscribe();
      removeStatusListener();
    };
  }, [currentUser, isInquiryModalOpen]);

  return {
    unreadNotificationCount,
    setUnreadNotificationCount,
    unreadInquiryCount,
    setUnreadInquiryCount,
  };
}
