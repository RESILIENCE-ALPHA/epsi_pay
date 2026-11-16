import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { SignupSessionError, useAuth } from '../auth/AuthContext';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Field } from '../components/ui';
import { Eye, EyeOff } from '../components/icons';

// Règles reprises de SignupDto côté auth : les refaire ici évite un aller-retour réseau pour
// afficher un tableau de messages de validation brut. Toute évolution doit suivre le DTO.
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 72; // limite de bcrypt
const PASSWORD_PATTERN = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const PASSWORD_HINT = '12 caractères minimum, avec une minuscule, une majuscule et un chiffre.';

/** Message de refus côté formulaire, ou null si le mot de passe convient */
function checkPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`;
  if (password.length > PASSWORD_MAX) return `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX} caractères.`;
  if (!PASSWORD_PATTERN.test(password)) return 'Ajoutez une minuscule, une majuscule et un chiffre.';
  return null;
}

/** Traduit un refus d'inscription en message clair */
function describeSignupError(error: unknown): { tone: 'danger' | 'warning' | 'locked'; title: string; body?: ReactNode } {
  // Le compte existe : surtout ne pas proposer de recommencer l'inscription
  if (error instanceof SignupSessionError) {
    return {
      tone: 'locked',
      title: 'Votre compte est créé.',
      body: (
        <>
          La connexion automatique n&rsquo;a pas abouti.{' '}
          <Link to="/connexion" className="font-semibold text-brand-300 hover:text-brand-200">
            Connectez-vous
          </Link>{' '}
          avec votre e-mail et votre mot de passe.
        </>
      ),
    };
  }
  if (!(error instanceof ApiError)) {
    return { tone: 'warning', title: 'Une erreur inattendue est survenue.', body: 'Réessayez dans un instant.' };
  }
  if (error.isUnavailable) {
    return {
      tone: 'warning',
      title: 'Création de compte momentanément indisponible.',
      body: 'Le service se rétablit automatiquement. Réessayez dans quelques secondes.',
    };
  }
  switch (error.code) {
    case 'EMAIL_ALREADY_USED':
      return {
        tone: 'danger',
        title: 'Un compte utilise déjà cette adresse e-mail.',
        body: (
          <Link to="/connexion" className="font-semibold text-brand-300 hover:text-brand-200">
            Se connecter
          </Link>
        ),
      };
    case 'IP_BLOCKED':
      return {
        tone: 'danger',
        title: 'Accès bloqué par le système de sécurité.',
        body: 'Une activité suspecte a été détectée depuis votre réseau. Les inscriptions sont suspendues temporairement.',
      };
    default:
      // 429 : limite de créations de compte par IP, posée par la passerelle (limit-count).
      // Le corps renvoyé est {"error_msg": ...} : aucun code métier à tester, d'où le statut.
      if (error.status === 429) {
        return {
          tone: 'warning',
          title: 'Trop de créations de compte depuis votre réseau.',
          body: 'Réessayez dans quelques minutes.',
        };
      }
      // 400 : la validation d'auth renvoie un tableau de messages, inexploitable tel quel
      if (error.status === 400) {
        return { tone: 'warning', title: 'Vérifiez les informations saisies.', body: PASSWORD_HINT };
      }
      return { tone: 'warning', title: error.message };
  }
}

export function SignupPage() {
  const { state, signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{ password?: string; confirmation?: string }>({});
  const [error, setError] = useState<unknown>(null);

  // L'inscription ouvre la session : une fois connecté, cet écran n'a plus de raison d'être
  if (state.status === 'authenticated') return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const passwordError = checkPassword(password);
    const confirmationError = password !== confirmation ? 'Les deux mots de passe ne correspondent pas.' : undefined;
    setFieldError({ password: passwordError ?? undefined, confirmation: confirmationError });
    if (passwordError || confirmationError) return;

    setSubmitting(true);
    setError(null);
    try {
      await signup(email.trim(), password, name.trim() || undefined);
    } catch (err) {
      setError(err);
      // Compte créé : le mot de passe reste saisi pour la connexion manuelle
      if (!(err instanceof SignupSessionError)) {
        setPassword('');
        setConfirmation('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const feedback = error ? describeSignupError(error) : null;

  return (
    <AuthShell>
      <h2 className="text-3xl font-bold tracking-tight text-white">Créer un compte</h2>
      <p className="mt-2 text-muted">Un portefeuille en euros est ouvert automatiquement.</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
        {feedback && (
          <Alert tone={feedback.tone} title={feedback.title}>
            {feedback.body}
          </Alert>
        )}

        <Field
          label="Nom (facultatif)"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Alice Martin"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />

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
        />

        <Field
          label="Mot de passe"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          error={fieldError.password}
          hint={PASSWORD_HINT}
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

        <Field
          label="Confirmer le mot de passe"
          name="confirmation"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          error={fieldError.confirmation}
        />

        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!email || !password || !confirmation}>
          Créer mon compte
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        Vous avez déjà un compte ?{' '}
        <Link to="/connexion" className="font-semibold text-brand-300 transition hover:text-brand-200">
          Se connecter
        </Link>
      </p>

      <p className="mt-6 text-center text-xs leading-relaxed text-muted">
        Une passkey (empreinte ou Face ID) s&rsquo;ajoute après la première connexion, depuis l&rsquo;onglet Sécurité.
      </p>
    </AuthShell>
  );
}
