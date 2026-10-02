import { apiRequest } from './client';

export function updateProfile(body) {
  return apiRequest('/me/profile', { method: 'PATCH', body });
}

export function replaceResearchAreas(researchAreaIds) {
  return apiRequest('/me/research-areas', {
    method: 'PUT',
    body: { researchAreaIds },
  });
}
