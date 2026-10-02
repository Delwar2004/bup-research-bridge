import { apiRequest } from './client';
import { toQuery } from './query';

export function listUsers(params) {
  return apiRequest(`/admin/users${toQuery(params)}`);
}

export function createUser(body) {
  return apiRequest('/admin/users', { method: 'POST', body });
}

export function getUser(userId) {
  return apiRequest(`/admin/users/${userId}`);
}

export function updateUser(userId, body) {
  return apiRequest(`/admin/users/${userId}`, { method: 'PATCH', body });
}

export function changeUserRole(userId, body) {
  return apiRequest(`/admin/users/${userId}/role`, { method: 'POST', body });
}

export function updateUserProfile(userId, body) {
  return apiRequest(`/admin/users/${userId}/profile`, { method: 'PATCH', body });
}

export function listActivityLogs(params) {
  return apiRequest(`/admin/activity-logs${toQuery(params)}`);
}

export function reportSummary(params = {}) {
  return apiRequest(`/admin/reports/summary${toQuery(params)}`);
}

export function createResearchArea(body) {
  return apiRequest('/admin/research-areas', { method: 'POST', body });
}

export function updateResearchArea(researchAreaId, body) {
  return apiRequest(`/admin/research-areas/${researchAreaId}`, { method: 'PATCH', body });
}
