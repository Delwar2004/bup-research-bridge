import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';

export function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      const next = location.state?.from?.pathname || '/dashboard';
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel narrow">
      <h1>Sign in</h1>
      <p>Use the email and password for your BUP Research Bridge account.</p>
      {error ? <Alert>{error}</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField id="email" label="Email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </FormField>
        <FormField id="password" label="Password">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </FormField>
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="form-note">
        New here? <Link to="/register">Create an account</Link>. An administrator must activate it before you can sign in.
      </p>
    </section>
  );
}
