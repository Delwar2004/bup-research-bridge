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

export function uploadProfilePhoto(file) {
  const formData = new FormData();
  formData.append('photo', file);
  return apiRequest('/me/profile-photo', { method: 'POST', formData });
}

export function removeProfilePhoto() {
  return apiRequest('/me/profile-photo', { method: 'DELETE' });
}
