// Platform/admin session. Owns the token in PLATFORM_TOKEN_KEY, which is the
// token lib/platformApi attaches for the /admin screens. Kept apart from
// EmployeeAuthContext on purpose: signing out here and signing out there are
// separate actions against separate realms.
//
// The backend implements these three routes in platform.controller.ts. They are
// restricted to role="admin"; a manager is refused at /api/auth/login.

import React from "react";
import axios from "axios";
import { PLATFORM_TOKEN_KEY } from "../lib/employeeApi";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Served by backend/src/controllers/platform.controller.ts. `/api/auth/login`
// admits only the admin role; the team manager signs in at /login instead.
const LOGIN_ENDPOINT = "/api/auth/login";
const ME_ENDPOINT = "/api/auth/me";
const PROFILE_ENDPOINT = "/api/user/profile";

export type PlatformUser = {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
};

type UpdateProfileResult = { success: boolean; error?: string };

type AuthValue = {
  user: PlatformUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<UpdateProfileResult>;
  logout: () => void;
  refreshUser: () => Promise<PlatformUser | null>;
  // Accepts a partial, nested payload such as { profile: { bio } } and always
  // resolves to a status object rather than throwing, so callers can read
  // result.success without a try/catch.
  updateProfile: (payload: Record<string, unknown>) => Promise<UpdateProfileResult>;
};

const AuthContext = React.createContext<AuthValue | null>(null);

const readToken = () => localStorage.getItem(PLATFORM_TOKEN_KEY);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = React.useState<PlatformUser | null>(null);
  // Held in state rather than read from localStorage during render: reading it
  // inline would not re-render when the token changes, and would throw wherever
  // there is no window (tests, SSR).
  const [token, setToken] = React.useState<string | null>(() => readToken());
  const [loading, setLoading] = React.useState(true);

  const refreshUser = React.useCallback(async (): Promise<PlatformUser | null> => {
    try {
      // Short-circuiting a signed-out visitor has to happen *inside* the try, so
      // that the `finally` still runs. Returning before it left `loading` stuck
      // at true, and both admin guards render the splash screen while loading —
      // so /admin/login never got to show its form at all.
      const stored = readToken();
      if (!stored) {
        setToken(null);
        setUser(null);
        return null;
      }

      const { data } = await axios.get(`${API_BASE_URL}${ME_ENDPOINT}`, {
        headers: { Authorization: `Bearer ${stored}` },
      });
      const next = data?.user ?? data ?? null;
      setUser(next);
      return next;
    } catch {
      // An expired or rejected platform token should not leave a stale user on
      // screen, but it also must not touch the employee session.
      localStorage.removeItem(PLATFORM_TOKEN_KEY);
      setToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = React.useCallback(async (credentials: { email: string; password: string }) => {
    try {
      const { data } = await axios.post(`${API_BASE_URL}${LOGIN_ENDPOINT}`, credentials);
      const nextToken = data?.token;

      if (!nextToken) return { success: false, error: data?.message || "Login failed." };

      localStorage.setItem(PLATFORM_TOKEN_KEY, nextToken);
      setToken(nextToken);
      await refreshUser();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.message || "Could not sign in." };
    }
  }, [refreshUser]);

  const logout = React.useCallback(() => {
    localStorage.removeItem(PLATFORM_TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const updateProfile = React.useCallback(async (payload: Record<string, unknown>) => {
    try {
      const token = readToken();
      await axios.patch(`${API_BASE_URL}${PROFILE_ENDPOINT}`, payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      await refreshUser();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.message || "Failed to update profile." };
    }
  }, [refreshUser]);

  const value = React.useMemo(
    () => ({ user, isAuthenticated: Boolean(token), loading, login, logout, refreshUser, updateProfile }),
    [user, token, loading, login, logout, refreshUser, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthValue {
  return React.useContext(AuthContext) ?? {
    user: null,
    isAuthenticated: false,
    loading: false,
    login: async () => ({ success: false, error: "AuthProvider is missing." }),
    logout: () => {},
    refreshUser: async () => null,
    updateProfile: async () => ({ success: false, error: "AuthProvider is missing." }),
  };
}

export default AuthContext;