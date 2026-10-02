import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as authApi from '../api/auth';
import { setAccessToken, setRefreshSession } from '../api/client';
import { clearRefreshToken, readRefreshToken, writeRefreshToken } from './storage';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const refreshInFlight = useRef(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    clearRefreshToken();
    setUser(null);
  }, []);

  const refreshSession = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;

    refreshInFlight.current = (async () => {
      const existing = readRefreshToken();
      if (!existing) return false;
      try {
        const payload = await authApi.refresh(existing);
        setAccessToken(payload.data.accessToken);
        writeRefreshToken(payload.data.refreshToken);
        return true;
      } catch {
        clearSession();
        return false;
      } finally {
        refreshInFlight.current = null;
      }
    })();

    return refreshInFlight.current;
  }, [clearSession]);

  useEffect(() => {
    setRefreshSession(refreshSession);
    return () => setRefreshSession(null);
  }, [refreshSession]);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!readRefreshToken()) {
        if (!cancelled) setStatus('ready');
        return;
      }
      const refreshed = await refreshSession();
      if (!refreshed) {
        if (!cancelled) setStatus('ready');
        return;
      }
      try {
        const payload = await authApi.currentUser();
        if (!cancelled) setUser(payload.data);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setStatus('ready');
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [clearSession, refreshSession]);

  const login = useCallback(async (email, password) => {
    const payload = await authApi.login({ email, password });
    setAccessToken(payload.data.accessToken);
    writeRefreshToken(payload.data.refreshToken);
    setUser(payload.data.user);
    return payload.data.user;
  }, []);

  const register = useCallback(async (body) => {
    const payload = await authApi.register(body);
    return payload;
  }, []);

  const logout = useCallback(async () => {
    const token = readRefreshToken();
    try {
      if (token) await authApi.logout(token);
    } catch {
      // A network failure still ends the browser session.
    }
    clearSession();
  }, [clearSession]);

  const logoutEverywhere = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } catch {
      // Local session still ends so a stale access token is not kept.
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo(() => ({
    user,
    status,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    logoutEverywhere,
  }), [user, status, login, register, logout, logoutEverywhere]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used within SessionProvider.');
  }
  return value;
}
