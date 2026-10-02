import { apiRequest } from './client';
import { toQuery } from './query';

export function listDepartments() {
  return apiRequest('/departments', { auth: false });
}

export function listResearchAreas(params = {}) {
  const { includeInactive } = params;
  return apiRequest(`/research-areas${toQuery({ includeInactive })}`, {
    auth: includeInactive === true,
  });
}
