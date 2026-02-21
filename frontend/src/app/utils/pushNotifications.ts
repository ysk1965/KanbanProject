import { isNative, isIOS } from './platform';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

export async function initPushNotifications(): Promise<void> {
  if (!isNative()) return;

  const { PushNotifications } = await import('@capacitor/push-notifications');

  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== 'granted') {
    console.log('[Push] Permission denied');
    return;
  }

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    console.log('[Push] Token:', token.value);
    const platform = isIOS() ? 'IOS' : 'ANDROID';

    try {
      await fetch(`${API_BASE}/device-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          token: token.value,
          platform,
          device_info: navigator.userAgent.slice(0, 200),
        }),
      });
      console.log('[Push] Token registered successfully');
    } catch (err) {
      console.error('[Push] Failed to register token:', err);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[Push] Registration error:', err);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[Push] Received in foreground:', notification);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[Push] Action performed:', action);
    handleNotificationTap(action.notification.data);
  });
}

function handleNotificationTap(data: Record<string, string>): void {
  const boardId = data.board_id;
  const taskId = data.task_id;
  const noteId = data.note_id;

  if (boardId && taskId) {
    window.location.href = `/boards/${boardId}?taskId=${taskId}`;
  } else if (boardId && noteId) {
    window.location.href = `/boards/${boardId}/notes/${noteId}`;
  } else if (boardId) {
    window.location.href = `/boards/${boardId}`;
  }
}
