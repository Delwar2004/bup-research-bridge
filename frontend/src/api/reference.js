import { apiRequest } from './client';

export function listDepartments() {
  return apiRequest('/departments', { auth: false });
}

export function listResearchAreas() {
  return apiRequest('/research-areas', { auth: false });
}
