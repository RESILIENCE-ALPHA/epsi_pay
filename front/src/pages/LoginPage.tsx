import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Field } from '../components/ui';
import { Eye, EyeOff, Fingerprint } from '../components/icons';
import { formatTime } from '../lib/format';
import { describePasskeyPromptError, passkeysSupported } from '../lib/passkeys';

/** Traduit un refus de connexion en message clair, sans révéler d'information exploitable */
function describeLoginError(error: unknown): { tone: 'danger' | 'warning' | 'locked'; title: string; body?: ReactNode } {
  const promptError = describePasskeyPromptError(error);
  if (promptError) return { tone: 'warning', title: promptError };
  if (!(error instanceof ApiError)) {
    return { tone: 'warning', title: 'Une erreur inattendue est survenue.', body: 'Réessayez dans un instant.' };
  }
  if (error.isUnavailable) {
    return {
      tone: 'warning',
      title: 'Connexion momentanément indisponible.',
      body: 'Le service se rétablit automatiquement. Réessayez dans quelques secondes.',
    };
  }
  switch (error.code) {
    case 'IP_BLOCKED':
      return {
        tone: 'danger',
        title: 'Accès bloqué par le système de sécurité.',
        body: 'Une activité suspecte a été détectée depuis votre réseau. Les connexions sont suspendues temporairement.',
      };
    case 'ACCOUNT_LOCKED': {
      const until = error.body.lockedUntil;
      return {
        tone: 'locked',
        title: 'Compte temporairement verrouillé.',
        body: until
          ? `Trop de tentatives échouées. Réessayez après ${formatTime(until)}.`
          : 'Trop de tentatives échouées. Réessayez plus tard.',
      };
    }
    case 'INVALID_CREDENTIALS': {
      const remaining = error.body.remainingAttempts;
      return {
        tone: 'danger',
        title: 'E-mail ou mot de passe incorrect.',
        body:
          remaining !== undefined && remaining <= 3
            ? `Encore ${remaining} tentative${remaining > 1 ? 's' : ''} avant le verrouillage temporaire du compte.`
            : undefined,
      };
    }
    case 'INVALID_PASSKEY':
      return {
        tone: 'danger',
        title: 'Passkey non reconnue.',
        body: 'Elle a peut-être été supprimée de votre compte. Connectez-vous avec votre mot de passe.',
      };
    case 'PASSKEY_CHALLENGE_INVALID':
      return { tone: 'warning', title: 'La demande a expiré.', body: 'Réessayez la connexion par passkey.' };
    case 'INVALID_INPUT':
      return { tone: 'warning', title: 'Renseignez votre e-mail et votre mot de passe.' };
    default:
      return { tone: 'warning', title: error.message };
  }
}

export function LoginPage() {
  const { state, login, loginWithPasskey } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [canUsePasskey] = useState(passkeysSupported);

  if (state.status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasskey = async () => {
    setPasskeyPending(true);
    setError(null);
    try {
      await loginWithPasskey();
    } catch (err) {
      setError(err);
    } finally {
      setPasskeyPending(false);
    }
  };

  const feedback = error ? describeLoginError(error) : null;
  const expired = state.status === 'anonymous' && state.reason === 'expired';

  return (
    <AuthShell>
      <h2 className="text-3xl font-bold tracking-tight text-white">Connexion</h2>
      <p className="mt-2 text-muted">Accédez à votre compte EPSI Pay.</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        {expired && !feedback && (
          <Alert tone="locked" title="Votre session a expiré.">
            Reconnectez-vous pour continuer.
          </Alert>
        )}
        {feedback && (
          <Alert tone={feedback.tone} title={feedback.title}>
            {feedback.body}
          </Alert>
        )}

        <Field
          label="Adresse e-mail"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="vous@exemple.fr"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />

        <Field
          label="Mot de passe"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="••••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-lg text-muted hover:bg-white/5 hover:text-white"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          }
        />

        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={!email || !password || passkeyPending}
        >
          Se connecter
        </Button>
      </form>

      {canUsePasskey && (
        <div className="mt-6">
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-white/30">
            <span className="h-px flex-1 bg-white/[0.08]" />
            ou
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="mt-6 w-full"
            icon={<Fingerprint />}
            loading={passkeyPending}
            disabled={submitting}
            onClick={() => void handlePasskey()}
          >
            Empreinte ou Face ID
          </Button>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted">
            Avec une passkey ajoutée depuis l’onglet Sécurité. Votre empreinte et votre visage restent sur votre appareil.
          </p>
        </div>
      )}

      <p className="mt-8 text-center text-sm text-muted">
        Pas encore de compte ?{' '}
        <Link to="/inscription" className="font-semibold text-brand-300 transition hover:text-brand-200">
          Créer un compte
        </Link>
      </p>

      {import.meta.env.DEV && (
        <p className="mt-8 rounded-2xl border border-dashed border-white/10 p-4 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-white/70">Développement</span> — comptes du seed :
          alice@epsi.fr, bob@epsi.fr, store@merchant.com · mot de passe <code className="text-white/70">Password123!</code>
        </p>
      )}
    </AuthShell>
  );
}
