import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, clearSession, getStoredUser, getToken, storeSession, type User } from "../api/client";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [token, setToken] = useState<string | null>(getToken());

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    storeSession(result.token, result.user);
    setUser(result.user);
    setToken(result.token);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const result = await api.register(email, password, name);
    storeSession(result.token, result.user);
    setUser(result.user);
    setToken(result.token);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, login, register, logout }),
    [user, token, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
