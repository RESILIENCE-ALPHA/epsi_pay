import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage } from '../api';
import { Alert } from '../components/Alert';

// Mêmes règles que SignupDto côté auth
const PASSWORD_RULES: [string, (password: string) => boolean][] = [
  ['12 to 72 characters', (p) => p.length >= 12 && p.length <= 72],
  ['A lowercase letter', (p) => /[a-z]/.test(p)],
  ['An uppercase letter', (p) => /[A-Z]/.test(p)],
  ['A digit', (p) => /\d/.test(p)],
];

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordValid = PASSWORD_RULES.every(([, check]) => check(password));
  const confirmationMismatch = confirmation.length > 0 && confirmation !== password;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!passwordValid || password !== confirmation) return;
    setError(null);
    setSubmitting(true);
    try {
      const user = await api.signup(email.trim(), password, name.trim() || undefined);
      navigate('/login', { state: { signedUpEmail: user.email } });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="card card-narrow">
      <h1>Create an account</h1>
      <p className="muted">A EUR wallet is opened automatically with your account.</p>
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={handleSubmit} className="form">
        <label>
          Name <span className="muted">(optional)</span>
          <input autoComplete="name" maxLength={255} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" autoComplete="email" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="new-password" required maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <ul className="rules">
          {PASSWORD_RULES.map(([label, check]) => (
            <li key={label} className={check(password) ? 'rule-ok' : ''}>{label}</li>
          ))}
        </ul>
        <label>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            aria-invalid={confirmationMismatch}
          />
        </label>
        {confirmationMismatch && <p className="field-error">Passwords do not match.</p>}
        <button type="submit" disabled={submitting || !passwordValid || password !== confirmation}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="muted">Already registered? <Link to="/login">Sign in</Link></p>
    </section>
  );
}
