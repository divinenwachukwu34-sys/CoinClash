import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, type User } from '@/lib/api';

const TOKEN_KEY = 'coincash_token_v1';

interface AuthContextType {
  user: User | null;
  token: string | null;
  authLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, username: string, password: string, referralCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Load persisted token on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (stored) {
          const me = await api.me(stored);
          setToken(stored);
          setUser(me);
        }
      } catch {
        // Invalid token — clear it
        await AsyncStorage.removeItem(TOKEN_KEY);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (tok: string, usr: User) => {
    await AsyncStorage.setItem(TOKEN_KEY, tok);
    setToken(tok);
    setUser(usr);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token: tok, user: usr } = await api.login(email, password);
      await persist(tok, usr);
    },
    [persist]
  );

  const signup = useCallback(
    async (email: string, username: string, password: string, referralCode?: string) => {
      const { token: tok, user: usr } = await api.signup(email, username, password, referralCode);
      await persist(tok, usr);
    },
    [persist]
  );

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.me(token);
      setUser(me);
    } catch {
      // Token expired
      await logout();
    }
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{ user, token, authLoading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
