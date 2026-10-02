const REFRESH_KEY = 'bup.refreshToken';

export function readRefreshToken() {
  try {
    return sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function writeRefreshToken(token) {
  sessionStorage.setItem(REFRESH_KEY, token);
}

export function clearRefreshToken() {
  try {
    sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // Ignore storage failures. The in-memory access token is still cleared.
  }
}
