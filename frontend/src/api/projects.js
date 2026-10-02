import { apiRequest } from './client';
import { toQuery } from './query';

export function listProjects(params) {
  return apiRequest(`/research-projects${toQuery(params)}`);
}

export function getProject(projectId) {
  return apiRequest(`/research-projects/${projectId}`);
}

export function createProject(body) {
  return apiRequest('/research-projects', { method: 'POST', body });
}

export function updateProject(projectId, body) {
  return apiRequest(`/research-projects/${projectId}`, { method: 'PATCH', body });
}

export function submitProject(projectId) {
  return apiRequest(`/research-projects/${projectId}/submit`, { method: 'POST' });
}

export function deleteProject(projectId) {
  return apiRequest(`/research-projects/${projectId}`, { method: 'DELETE' });
}

export function moderateProject(projectId, body) {
  return apiRequest(`/admin/research-projects/${projectId}/moderation`, {
    method: 'PATCH',
    body,
  });
}
