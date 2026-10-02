import { apiRequest } from './client';

export function login(body) {
  return apiRequest('/auth/login', { method: 'POST', body, auth: false, retry: false });
}

export function register(body) {
  return apiRequest('/auth/register', { method: 'POST', body, auth: false, retry: false });
}

export function refresh(refreshToken) {
  return apiRequest('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
    retry: false,
  });
}

export function logout(refreshToken) {
  return apiRequest('/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
    retry: false,
  });
}

export function logoutAll() {
  return apiRequest('/auth/logout-all', { method: 'POST', retry: false });
}

export function currentUser() {
  return apiRequest('/auth/me');
}

export function changePassword(body) {
  return apiRequest('/auth/password', { method: 'POST', body });
}
