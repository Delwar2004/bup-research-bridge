import { apiRequest } from './client';
import { toQuery } from './query';

export function listPublications(params) {
  return apiRequest(`/publications${toQuery(params)}`);
}

export function getPublication(publicationId) {
  return apiRequest(`/publications/${publicationId}`);
}

export function createPublication(body) {
  return apiRequest('/publications', { method: 'POST', body });
}

export function updatePublication(publicationId, body) {
  return apiRequest(`/publications/${publicationId}`, { method: 'PATCH', body });
}

export function submitPublication(publicationId) {
  return apiRequest(`/publications/${publicationId}/submit`, { method: 'POST' });
}

export function deletePublication(publicationId) {
  return apiRequest(`/publications/${publicationId}`, { method: 'DELETE' });
}

export function moderatePublication(publicationId, body) {
  return apiRequest(`/admin/publications/${publicationId}/moderation`, {
    method: 'PATCH',
    body,
  });
}
