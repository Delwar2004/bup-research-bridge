import { apiRequest } from './client';
import { toQuery } from './query';

export function searchContent(params) {
  return apiRequest(`/search${toQuery(params)}`);
}
