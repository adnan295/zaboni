import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter, setUnauthorizedHandler, customFetch } from "@workspace/api-client-react";

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  role: "customer" | "courier";
  avatarUrl?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isCourier: boolean;
  isCourierMode: boolean;
  setCourierMode: (val: boolean) => Promise<void>;
  signIn: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
  updateName: (name: string) => void;
  updateProfile: (updates: Partial<Pick<AuthUser, "name" | "phone" | "avatarUrl">>) => void;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_TOKEN_KEY = "@marsool_jwt";
const STORAGE_USER_KEY = "@marsool_user_v3";
const STORAGE_COURIER_MODE_KEY = "@marsool_courier_mode";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCourierMode, setIsCourierModeState] = useState(false);

  // Eagerly sync the module-level auth getter on every render.
  // This recovers from Fast Refresh: when custom-fetch.ts is re-evaluated
  // the module-level _authTokenGetter resets to null, but the next render
  // of this component (even without a state change) restores it immediately.
  setAuthTokenGetter(token !== null ? () => token : null);

  // Also keep it in sync via effect for the normal sign-in / sign-out flow.
  useEffect(() => {
    setAuthTokenGetter(token !== null ? () => token : null);
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser, storedMode] = await Promise.all([
          AsyncStorage.getItem(STORAGE_TOKEN_KEY),
          AsyncStorage.getItem(STORAGE_USER_KEY),
          AsyncStorage.getItem(STORAGE_COURIER_MODE_KEY),
        ]);

        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser) as AuthUser;
          if (!parsedUser.role) parsedUser.role = "customer";
          setToken(storedToken);
          setUser(parsedUser);
          setAuthTokenGetter(() => storedToken);

          // Refresh role from server in background to pick up any DB changes
          try {
            const { getApiBaseUrl } = await import("@/lib/apiClient");
            const meRes = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
              headers: { Authorization: `Bearer ${storedToken}` },
            });
            const fresh = meRes.ok ? await meRes.json() : null;
            const freshRole = ((fresh?.role) as "customer" | "courier") ?? parsedUser.role;
            const freshUser: AuthUser = { ...parsedUser, role: freshRole };
            await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(freshUser));
            setUser(freshUser);

            if (freshRole === "courier") {
              const modeExplicitlyOff = storedMode === "false";
              if (!modeExplicitlyOff) setIsCourierModeState(true);
            }
          } catch {
            // Server unreachable — keep cached role
            if (parsedUser.role === "courier") {
              const modeExplicitlyOff = storedMode === "false";
              if (!modeExplicitlyOff) setIsCourierModeState(true);
            }
          }
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (newToken: string, newUser: AuthUser) => {
    const userWithRole: AuthUser = {
      ...newUser,
      role: newUser.role ?? "customer",
    };
    await Promise.all([
      AsyncStorage.setItem(STORAGE_TOKEN_KEY, newToken),
      AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userWithRole)),
    ]);
    setToken(newToken);
    setUser(userWithRole);
    setAuthTokenGetter(() => newToken);
  }, []);

  const signOut = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_TOKEN_KEY),
      AsyncStorage.removeItem(STORAGE_USER_KEY),
      AsyncStorage.removeItem(STORAGE_COURIER_MODE_KEY),
    ]);
    setToken(null);
    setUser(null);
    setIsCourierModeState(false);
    setAuthTokenGetter(null);
    setUnauthorizedHandler(null);
  }, []);

  const setCourierMode = useCallback(async (val: boolean) => {
    await AsyncStorage.setItem(STORAGE_COURIER_MODE_KEY, val ? "true" : "false");
    setIsCourierModeState(val);
  }, []);

  const refreshRole = useCallback(async () => {
    if (!token) return;
    try {
      const result = await customFetch<{ id: string; phone: string; name: string; role: string }>(
        "/api/auth/me"
      );
      const newRole = (result.role as "customer" | "courier") ?? "customer";
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, role: newRole };
        AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch {
    }
  }, [token]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setUnauthorizedHandler(null);
      return;
    }
    setUnauthorizedHandler(() => {
      signOut();
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [isLoading, user, signOut]);

  const updateName = useCallback((name: string) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, name };
      AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateProfile = useCallback((updates: Partial<Pick<AuthUser, "name" | "phone" | "avatarUrl">>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isCourier = user?.role === "courier";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isCourier,
        isCourierMode,
        setCourierMode,
        signIn,
        signOut,
        updateName,
        updateProfile,
        refreshRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
