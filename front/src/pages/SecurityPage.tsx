import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { api, ApiError } from '../api/client';
import type { Passkey } from '../api/types';
import { Alert, Button, Card, Field, Skeleton } from '../components/ui';
import { Eye, EyeOff, Fingerprint, ShieldCheck, Trash } from '../components/icons';
import { formatActivityDate } from '../lib/format';
import { describePasskeyPromptError, passkeysSupported } from '../lib/passkeys';

// Onglet Sécurité : ajout, liste et révocation des passkeys (empreinte digitale / visage vérifiés sur l'appareil).
// Ajouter ou révoquer une passkey exige le mot de passe : un jeton de session volé ne suffit pas à
// s'approprier le compte. Une fois une passkey enregistrée, chaque paiement doit être validé avec elle.

type Feedback = { tone: 'danger' | 'warning' | 'locked'; title: string; body?: string };

/** Traduit une erreur (navigateur ou API) en message clair */
function describeSecurityError(error: unknown): Feedback {
  const promptError = describePasskeyPromptError(error);
  if (promptError) return { tone: 'warning', title: promptError };
  if (!(error instanceof ApiError)) return { tone: 'warning', title: 'Une erreur inattendue est survenue.', body: 'Réessayez dans un instant.' };
  if (error.isUnavailable) {
    return { tone: 'warning', title: 'Service momentanément indisponible.', body: 'Réessayez dans quelques secondes.' };
  }
  switch (error.code) {
    case 'INVALID_PASSWORD':
      return { tone: 'danger', title: 'Mot de passe incorrect.', body: 'Les essais ratés comptent comme des connexions échouées.' };
    case 'ACCOUNT_LOCKED':
      return { tone: 'locked', title: 'Compte temporairement verrouillé.', body: 'Trop de tentatives échouées. Réessayez plus tard.' };
    case 'PASSKEY_LIMIT_REACHED':
      return { tone: 'warning', title: 'Nombre maximal de passkeys atteint.', body: 'Révoquez une passkey avant d’en ajouter une autre.' };
    case 'PASSKEY_ALREADY_REGISTERED':
      return { tone: 'warning', title: 'Cet appareil est déjà enregistré sur votre compte.' };
    case 'PASSKEY_REGISTRATION_FAILED':
      return { tone: 'danger', title: 'L’appareil n’a pas pu être enregistré.', body: 'Réessayez, ou choisissez un autre appareil.' };
    case 'PASSKEY_CHALLENGE_INVALID':
      return { tone: 'warning', title: 'La demande a expiré.', body: 'Recommencez l’ajout de la passkey.' };
    case 'PASSKEY_NOT_FOUND':
      return { tone: 'warning', title: 'Cette passkey n’existe plus.' };
    default:
      return { tone: 'warning', title: error.message };
  }
}

/** Libellé par défaut proposé pour un nouvel appareil */
function defaultDeviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'PC Windows';
  return 'Mon appareil';
}

function PasswordField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      label={label}
      name="current-password"
      type={visible ? 'text' : 'password'}
      autoComplete="current-password"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-muted transition hover:text-white"
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      }
    />
  );
}

export function SecurityPage() {
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState(defaultDeviceName);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Passkey | null>(null);
  const [canUsePasskey] = useState(passkeysSupported);

  const load = useCallback(async () => {
    try {
      const { passkeys: list } = await api.listPasskeys();
      setPasskeys(list);
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForms = () => {
    setAdding(false);
    setRevoking(null);
    setPassword('');
    setFeedback(null);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setFeedback({ tone: 'warning', title: 'Saisissez votre mot de passe.' });
      return;
    }
    setPending(true);
    setFeedback(null);
    setSuccess(null);
    try {
      const { challengeId, options } = await api.passkeyRegistrationOptions(password);
      // Le navigateur propose Touch ID / Face ID / Windows Hello, le trousseau iCloud ou un téléphone
      const response = await startRegistration({ optionsJSON: options });
      const { passkey } = await api.registerPasskey(challengeId, response, deviceName.trim() || undefined);
      setPasskeys((list) => [...(list ?? []), passkey]);
      setSuccess(`Passkey « ${passkey.name ?? 'sans nom'} » ajoutée. Vos prochains paiements seront validés avec elle.`);
      resetForms();
    } catch (error) {
      setFeedback(describeSecurityError(error));
      setPassword('');
    } finally {
      setPending(false);
    }
  };

  const handleRevoke = async (event: FormEvent) => {
    event.preventDefault();
    if (!revoking) return;
    if (!password) {
      setFeedback({ tone: 'warning', title: 'Saisissez votre mot de passe.' });
      return;
    }
    setPending(true);
    setFeedback(null);
    setSuccess(null);
    try {
      await api.revokePasskey(revoking.id, password);
      setPasskeys((list) => (list ?? []).filter((p) => p.id !== revoking.id));
      setSuccess(`Passkey « ${revoking.name ?? 'sans nom'} » révoquée.`);
      resetForms();
    } catch (error) {
      setFeedback(describeSecurityError(error));
      setPassword('');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Sécurité</h1>
        <p className="mt-1 text-sm text-muted">
          Connectez-vous et validez vos paiements avec votre empreinte ou votre visage. Ils restent sur votre appareil :
          EPSI Pay ne reçoit qu’une signature.
        </p>
      </div>

      {success && (
        <div className="mb-6">
          <Alert tone="locked" title={success} />
        </div>
      )}

      <Card className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500/15 text-xl text-brand-300">
              <Fingerprint />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Passkeys</h2>
              <p className="text-sm text-muted">Empreinte digitale ou reconnaissance faciale</p>
            </div>
          </div>
          {!adding && !revoking && canUsePasskey && (
            <Button
              onClick={() => {
                setAdding(true);
                setSuccess(null);
                setFeedback(null);
              }}
              icon={<Fingerprint />}
            >
              Ajouter
            </Button>
          )}
        </div>

        {!canUsePasskey && (
          <div className="mt-6">
            <Alert tone="warning" title="Ce navigateur ne permet pas d’utiliser les passkeys.">
              Utilisez un navigateur récent (Safari, Chrome, Edge, Firefox) sur le site officiel en HTTPS.
            </Alert>
          </div>
        )}

        {adding && (
          <form className="mt-6 space-y-5 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-5" onSubmit={handleAdd} noValidate>
            <p className="text-sm text-white/80">
              Confirmez votre mot de passe, puis validez avec votre empreinte ou votre visage. Choisissez{' '}
              <strong className="text-white">cet appareil</strong> (trousseau iCloud, Windows Hello…) ou{' '}
              <strong className="text-white">un téléphone</strong> via le QR code (Bluetooth activé sur les deux).
            </p>
            {feedback && (
              <Alert tone={feedback.tone} title={feedback.title}>
                {feedback.body}
              </Alert>
            )}
            <PasswordField label="Mot de passe" value={password} onChange={setPassword} />
            <Field
              label="Nom de l’appareil"
              name="device-name"
              autoComplete="off"
              maxLength={64}
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              hint="Pour reconnaître cette passkey dans la liste."
            />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={pending} icon={<Fingerprint />}>
                Ajouter la passkey
              </Button>
              <Button type="button" variant="ghost" onClick={resetForms} disabled={pending}>
                Annuler
              </Button>
            </div>
          </form>
        )}

        {revoking && (
          <form className="mt-6 space-y-5 rounded-2xl border border-loss/20 bg-loss/[0.04] p-5" onSubmit={handleRevoke} noValidate>
            <p className="text-sm text-white/80">
              Révoquer <strong className="text-white">« {revoking.name ?? 'sans nom'} »</strong> ? Elle ne permettra plus de
              se connecter ni de valider un paiement.
            </p>
            {feedback && (
              <Alert tone={feedback.tone} title={feedback.title}>
                {feedback.body}
              </Alert>
            )}
            <PasswordField label="Mot de passe" value={password} onChange={setPassword} />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={pending} icon={<Trash />}>
                Révoquer
              </Button>
              <Button type="button" variant="ghost" onClick={resetForms} disabled={pending}>
                Annuler
              </Button>
            </div>
          </form>
        )}

        <div className="mt-6">
          {loadError && !passkeys ? (
            <Alert tone="warning" title="Impossible de charger vos passkeys.">
              {describeSecurityError(loadError).title}
            </Alert>
          ) : !passkeys ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : passkeys.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
              <p className="font-medium text-white">Aucune passkey pour le moment.</p>
              <p className="mt-1 text-sm text-muted">
                Ajoutez-en une pour vous connecter sans mot de passe et sécuriser vos paiements.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.06]" aria-label="Passkeys enregistrées">
              {passkeys.map((passkey) => (
                <li key={passkey.id} className="flex items-center gap-4 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-lg text-white/80">
                    <ShieldCheck />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{passkey.name ?? 'Passkey sans nom'}</p>
                    <p className="text-xs text-muted">
                      {passkey.deviceType === 'multiDevice' ? 'Synchronisée (trousseau)' : 'Liée à cet appareil'} · ajoutée{' '}
                      {formatActivityDate(passkey.createdAt)}
                      {passkey.lastUsedAt ? ` · utilisée ${formatActivityDate(passkey.lastUsedAt)}` : ' · jamais utilisée'}
                    </p>
                  </div>
                  {!adding && !revoking && (
                    <button
                      type="button"
                      onClick={() => {
                        setRevoking(passkey);
                        setSuccess(null);
                        setFeedback(null);
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-lg text-muted transition hover:bg-loss/10 hover:text-loss"
                      title="Révoquer"
                      aria-label={`Révoquer ${passkey.name ?? 'la passkey'}`}
                    >
                      <Trash />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
