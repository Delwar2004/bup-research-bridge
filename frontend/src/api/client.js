const DEFAULT_BASE_URL = 'http://localhost:3000/api/v1';

let accessToken = null;
let refreshSession = null;

export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  const value = typeof configured === 'string' && configured.trim()
    ? configured.trim()
    : DEFAULT_BASE_URL;
  return value.replace(/\/$/, '');
}

export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function setRefreshSession(handler) {
  refreshSession = handler;
}

export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = true,
    retry = true,
  } = options;

  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached. Check that the API is running.');
  }

  if (response.status === 401 && auth && retry && refreshSession) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiRequest(path, { method, body, auth, retry: false });
    }
  }

  const payload = await readPayload(response);
  if (!response.ok || !payload || payload.success === false) {
    throw new ApiError(
      response.status,
      payload?.error?.code || 'REQUEST_FAILED',
      payload?.message || 'The request could not be completed.',
      payload?.error?.details || {},
    );
  }
  return payload;
}

async function readPayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
