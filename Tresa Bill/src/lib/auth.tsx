import { renultApi, UserResponse } from "@/api/foreform";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

interface AuthContextValue {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (tokenUser: { access_token: string; user: UserResponse }) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(() => renultApi.auth.storedUser());
  const [isLoading, setIsLoading] = useState(Boolean(renultApi.auth.token()));

  const refreshUser = useCallback(async () => {
    if (!renultApi.auth.token()) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const nextUser = await renultApi.auth.me();
      setUser(nextUser);
      localStorage.setItem("renult:auth-user", JSON.stringify(nextUser));
    } catch {
      renultApi.auth.clear();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((auth: { access_token: string; user: UserResponse }) => {
    renultApi.auth.save(auth);
    setUser(auth.user);
  }, []);

  const logout = useCallback(() => {
    renultApi.auth.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    refreshUser();
    const handler = (event: Event) => {
      setUser((event as CustomEvent<UserResponse | undefined>).detail || renultApi.auth.storedUser());
    };
    window.addEventListener("renult-auth-change", handler);
    return () => window.removeEventListener("renult-auth-change", handler);
  }, [refreshUser]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user && renultApi.auth.token()),
    isLoading,
    login,
    refreshUser,
    logout,
  }), [user, isLoading, login, refreshUser, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading account...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export function OwnerRoute({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user?.account_type === "staff") return <Navigate to="/" replace />;
  if (permission && user?.allowed_sections?.length > 0 && !user.allowed_sections.includes(permission)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function PermissionRoute({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  const staffPermission = permission === "messages" ? "support" : permission;
  if (user?.account_type === "staff" && !user.staff_permissions?.includes(staffPermission)) {
    return <Navigate to="/" replace />;
  }
  if (user?.account_type === "owner" && user.allowed_sections?.length > 0 && !user.allowed_sections.includes(permission)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function PlatformAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user?.platform_role) return <Navigate to="/" replace />;
  return <>{children}</>;
}
