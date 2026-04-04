import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  signIn: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
  updateName: (name: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_TOKEN_KEY = "@marsool_jwt";
const STORAGE_USER_KEY = "@marsool_user_v2";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(STORAGE_TOKEN_KEY),
          AsyncStorage.getItem(STORAGE_USER_KEY),
        ]);
        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser) as AuthUser;
          setToken(storedToken);
          setUser(parsedUser);
          setAuthTokenGetter(() => storedToken);
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (newToken: string, newUser: AuthUser) => {
    await Promise.all([
      AsyncStorage.setItem(STORAGE_TOKEN_KEY, newToken),
      AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify(newUser)),
    ]);
    setToken(newToken);
    setUser(newUser);
    setAuthTokenGetter(() => newToken);
  }, []);

  const signOut = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_TOKEN_KEY),
      AsyncStorage.removeItem(STORAGE_USER_KEY),
    ]);
    setToken(null);
    setUser(null);
    setAuthTokenGetter(null);
    setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut();
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [signOut]);

  const updateName = useCallback((name: string) => {
    setUser((prev) => (prev ? { ...prev, name } : prev));
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut, updateName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
