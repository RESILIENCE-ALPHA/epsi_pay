import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { errorMessage } from '../api';
import { useAuth } from '../auth';
import { Alert } from '../components/Alert';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const signedUpEmail = (useLocation().state as { signedUpEmail?: string } | null)?.signedUpEmail;

  const [email, setEmail] = useState(signedUpEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/pay', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="card card-narrow">
      <h1>Sign in</h1>
      {signedUpEmail && !error && <Alert kind="success">Account created. You can now sign in.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <form onSubmit={handleSubmit} className="form">
        <label>
          Email
          <input type="email" autoComplete="email" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="muted">No account yet? <Link to="/signup">Create one</Link></p>
    </section>
  );
}
