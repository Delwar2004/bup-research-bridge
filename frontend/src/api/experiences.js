import { apiRequest } from './client';

export function listExperiences(userId) {
  return apiRequest(`/alumni/${userId}/experiences`);
}

export function createExperience(body) {
  return apiRequest('/me/experiences', { method: 'POST', body });
}

export function updateExperience(experienceId, body) {
  return apiRequest(`/me/experiences/${experienceId}`, { method: 'PATCH', body });
}

export function deleteExperience(experienceId) {
  return apiRequest(`/me/experiences/${experienceId}`, { method: 'DELETE' });
}
