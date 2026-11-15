import { startAuthentication } from '@simplewebauthn/browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onUnauthorized } from '../api/client';
import { getSession, saveSession } from '../api/session';
import type { LoginSuccess, User } from '../api/types';

type AuthState =
  | { status: 'anonymous'; reason?: 'expired' | 'logout' }
  | { status: 'authenticated'; user: User };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  /** Connexion par empreinte digitale ou reconnaissance faciale (passkey), sans e-mail ni mot de passe */
  loginWithPasskey: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const session = getSession();
    return session ? { status: 'authenticated', user: session.user } : { status: 'anonymous' };
  });

  // Reprise de session (rechargement de page) : profil en cache affiché tout de suite, jeton revalidé
  // auprès d'auth en arrière-plan. Auth en panne : on garde la session (401 seul = session invalide).
  useEffect(() => {
    const session = getSession();
    if (!session) return;
    let cancelled = false;
    api
      .me()
      .then(({ user }) => {
        if (cancelled) return;
        saveSession({ token: session.token, user });
        setState({ status: 'authenticated', user });
      })
      .catch(() => {
        // 401 : traité par onUnauthorized ; panne : session conservée
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Session expirée ou révoquée pendant l'utilisation
  useEffect(
    () =>
      onUnauthorized(() => {
        saveSession(null);
        setState({ status: 'anonymous', reason: 'expired' });
      }),
    [],
  );

  const openSession = useCallback((result: LoginSuccess) => {
    const token = result.accessToken ?? result.token;
    if (!token) throw new Error('Réponse de connexion sans jeton');
    saveSession({ token, user: result.user });
    setState({ status: 'authenticated', user: result.user });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => openSession(await api.login(email, password)),
    [openSession],
  );

  const loginWithPasskey = useCallback(async () => {
    const { challengeId, options } = await api.passkeyLoginOptions();
    // Le navigateur affiche Touch ID / Face ID / Windows Hello ; seule la signature revient
    const response = await startAuthentication({ optionsJSON: options });
    openSession(await api.passkeyLogin(challengeId, response));
  }, [openSession]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Même si auth ne répond pas, la session locale est effacée
    } finally {
      saveSession(null);
      setState({ status: 'anonymous', reason: 'logout' });
    }
  }, []);

  const value = useMemo(() => ({ state, login, loginWithPasskey, logout }), [state, login, loginWithPasskey, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return context;
}

/** Utilisateur connecté (à n'utiliser que sous une route protégée) */
export function useCurrentUser(): User {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('Aucun utilisateur connecté');
  return state.user;
}
