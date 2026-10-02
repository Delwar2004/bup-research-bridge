import { apiRequest } from './client';
import { toQuery } from './query';

export function listNotifications(params) {
  return apiRequest(`/notifications${toQuery(params)}`);
}

export function unreadNotificationCount() {
  return apiRequest('/notifications/unread-count');
}

export function updateNotification(notificationId, isRead) {
  return apiRequest(`/notifications/${notificationId}`, {
    method: 'PATCH',
    body: { isRead },
  });
}

export function markAllNotificationsRead() {
  return apiRequest('/notifications/read-all', { method: 'POST' });
}
