import { apiRequest } from './client';
import { toQuery } from './query';

export function listOpportunities(params) {
  return apiRequest(`/opportunities${toQuery(params)}`);
}

export function getOpportunity(opportunityId) {
  return apiRequest(`/opportunities/${opportunityId}`);
}

export function createOpportunity(body) {
  return apiRequest('/opportunities', { method: 'POST', body });
}

export function updateOpportunity(opportunityId, body) {
  return apiRequest(`/opportunities/${opportunityId}`, { method: 'PATCH', body });
}

export function updateOpportunityAvailability(opportunityId, availabilityStatus) {
  return apiRequest(`/opportunities/${opportunityId}/availability`, {
    method: 'PATCH',
    body: { availabilityStatus },
  });
}

export function submitOpportunity(opportunityId) {
  return apiRequest(`/opportunities/${opportunityId}/submit`, { method: 'POST' });
}

export function deleteOpportunity(opportunityId) {
  return apiRequest(`/opportunities/${opportunityId}`, { method: 'DELETE' });
}

export function moderateOpportunity(opportunityId, body) {
  return apiRequest(`/admin/opportunities/${opportunityId}/moderation`, {
    method: 'PATCH',
    body,
  });
}
