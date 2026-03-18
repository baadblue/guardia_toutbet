"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearStoredAuth, getStoredAuth, setStoredAuth } from "./lib/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuthState] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored?.token) setAuthState(stored);
    setHydrated(true);
  }, []);

  const setAuth = useCallback((nextAuth) => {
    setAuthState(nextAuth);
    if (nextAuth?.token) setStoredAuth(nextAuth);
    else clearStoredAuth();
  }, []);

  const logout = useCallback(() => {
    setAuth(null);
  }, [setAuth]);

  const value = useMemo(() => {
    const token = auth?.token || "";
    const user = auth?.user || null;
    const userId = user?.id || "";
    const userEmail = user?.email || "";
    const balance = user?.balance ?? null;

    return {
      hydrated,
      auth,
      token,
      user,
      userId,
      userEmail,
      balance,
      setAuth,
      logout,
    };
  }, [auth, hydrated, logout, setAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

