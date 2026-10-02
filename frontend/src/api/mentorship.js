import { apiRequest } from './client';
import { toQuery } from './query';

export function listMentorshipRequests(params) {
  return apiRequest(`/mentorship-requests${toQuery(params)}`);
}

export function getMentorshipRequest(requestId) {
  return apiRequest(`/mentorship-requests/${requestId}`);
}

export function createMentorshipRequest(body) {
  return apiRequest('/mentorship-requests', { method: 'POST', body });
}

export function updateMentorshipStatus(requestId, status) {
  return apiRequest(`/mentorship-requests/${requestId}`, {
    method: 'PATCH',
    body: { status },
  });
}

export function listMentorshipMessages(requestId, params) {
  return apiRequest(`/mentorship-requests/${requestId}/messages${toQuery(params)}`);
}

export function createMentorshipMessage(requestId, body) {
  return apiRequest(`/mentorship-requests/${requestId}/messages`, {
    method: 'POST',
    body: { body },
  });
}
