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
const AVATAR_KEY = 'coinclash_avatar';

interface AvatarData {
  emoji: string | null;
  photo: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  authLoading: boolean;
  avatar: AvatarData;
  setAvatar: (emoji: string | null, photo: string | null) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  signupInitiate: (email: string, username: string, password: string, phone: string, referralCode?: string) => Promise<{ requiresOtp: boolean; message: string; resendCooldown: number }>;
  signupVerify: (email: string, code: string, referralCode?: string) => Promise<{ referralMessage?: string; message: string }>;
  resendOtp: (email: string, purpose?: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [avatar, setAvatarState] = useState<AvatarData>({ emoji: null, photo: null });

  // Load persisted token and avatar on mount
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedAvatar] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(AVATAR_KEY),
        ]);

        if (storedAvatar) {
          try {
            setAvatarState(JSON.parse(storedAvatar));
          } catch {}
        }

        if (storedToken) {
          const me = await api.me(storedToken);
          if (me.reservedBankName === 'Mock Bank' || me.reservedAccountNumber === '0123456789') {
            me.reservedBankName = undefined;
            me.reservedAccountNumber = undefined;
            me.reservedAccountName = undefined;
          }
          setToken(storedToken);
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

  const setAvatar = useCallback(async (emoji: string | null, photo: string | null) => {
    const data = { emoji, photo };
    setAvatarState(data);
    await AsyncStorage.setItem(AVATAR_KEY, JSON.stringify(data));
  }, []);

  const persist = useCallback(async (tok: string, usr: User) => {
    await AsyncStorage.setItem(TOKEN_KEY, tok);
    setToken(tok);
    setUser(usr);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await api.login(identifier, password);
      await persist(res.token, res.user);
    },
    [persist]
  );

  const signupInitiate = useCallback(
    async (email: string, username: string, password: string, phone: string, referralCode?: string) => {
      const res = await api.signup(email, username, password, phone, referralCode);
      if (res.token && res.user) {
        await persist(res.token, res.user);
      }
      return {
        requiresOtp: res.requiresOtp ?? false,
        message: res.message,
        resendCooldown: res.resendCooldown || 60,
      };
    },
    [persist]
  );

  const signupVerify = useCallback(
    async (email: string, code: string, referralCode?: string) => {
      const res = await api.signupVerify(email, code, referralCode);
      await persist(res.token, res.user);
      return {
        referralMessage: res.referralMessage,
        message: res.message,
      };
    },
    [persist]
  );

  const resendOtp = useCallback(async (email: string, purpose: string = 'signup') => {
    await api.resendOtp(email, purpose);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const logoutAll = useCallback(async () => {
    if (token) {
      try {
        await api.logoutAll(token);
      } catch {}
    }
    await logout();
  }, [token, logout]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.me(token);
      if (me.reservedBankName === 'Mock Bank' || me.reservedAccountNumber === '0123456789') {
        me.reservedBankName = undefined;
        me.reservedAccountNumber = undefined;
        me.reservedAccountName = undefined;
      }
      setUser(me);
    } catch {
      // Token expired
      await logout();
    }
  }, [token, logout]);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      authLoading,
      avatar,
      setAvatar,
      login,
      signupInitiate,
      signupVerify,
      resendOtp,
      logout,
      logoutAll,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
