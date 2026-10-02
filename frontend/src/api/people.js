import { apiRequest } from './client';
import { toQuery } from './query';

export function listFaculty(params) {
  return apiRequest(`/faculty${toQuery(params)}`);
}

export function getFaculty(userId) {
  return apiRequest(`/faculty/${userId}`);
}

export function listAlumni(params) {
  return apiRequest(`/alumni${toQuery(params)}`);
}

export function getAlumni(userId) {
  return apiRequest(`/alumni/${userId}`);
}
