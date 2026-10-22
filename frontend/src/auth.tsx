import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type User } from './api';

// Jeton conservé pour l'onglet uniquement : il disparaît à la fermeture du navigateur
const TOKEN_KEY = 'epsi_pay_token';

interface AuthState {
  token: string | null;
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  expire: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // stockage indisponible (navigation privée) : la session ne survit pas au rechargement
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readToken);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(token === null);

  const expire = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  // Au rechargement, on vérifie que le jeton stocké correspond toujours à une session valide
  useEffect(() => {
    if (!token || user) return;
    api
      .me(token)
      .then(({ user }) => setUser(user))
      .catch(expire)
      .finally(() => setReady(true));
  }, [token, user, expire]);

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken, user } = await api.login(email, password);
    writeToken(accessToken);
    setToken(accessToken);
    setUser(user);
    setReady(true);
  }, []);

  const logout = useCallback(async () => {
    if (token) await api.logout(token).catch(() => undefined);
    expire();
  }, [token, expire]);

  const value = useMemo(
    () => ({ token, user, ready, login, logout, expire }),
    [token, user, ready, login, logout, expire],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}
