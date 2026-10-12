import { getApiBaseUrl } from './client';

export function photoSrc(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/uploads/profile-photos/')) {
    return `${getApiBaseUrl().replace(/\/api\/v1$/, '')}${url}`;
  }
  return '';
}
