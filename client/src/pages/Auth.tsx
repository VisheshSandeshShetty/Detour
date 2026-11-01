// Login and Register pages. They share one form component because they are almost identical.

import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DetourLogo } from '../components/Navbar';
import { ErrorBanner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';

type Mode = 'login' | 'register';

interface RedirectState {
  from?: string;
  message?: string;
}

function AuthForm({ mode }: { mode: Mode }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = (location.state as RedirectState | null) ?? {};

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'register';
  const destination = redirect.from ?? '/';

  // Already logged in? No need to see this page.
  if (user && !submitting) return <Navigate to={destination} replace />;

  // Frontend validation: quick feedback. The server checks everything again.
  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (isRegister && name.trim().length < 2) errors.name = 'Enter your name (at least 2 characters).';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (isRegister && password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (!isRegister && password.length === 0) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isRegister) await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
      navigate(destination, { replace: true });
    } catch (e) {
      setFormError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mb-5 flex justify-center">
          <DetourLogo className="h-10" />
        </div>
        <h1 className="text-2xl font-extrabold">{isRegister ? 'Create your Detour account' : 'Welcome back'}</h1>
        <p className="mt-1 text-sm text-muted">
          {isRegister ? 'Save places and keep your journeys in one place.' : 'Log in to see your saved places and journeys.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="card space-y-4 p-6">
        {redirect.message && !formError && (
          <p className="rounded-xl bg-forest-50 px-3.5 py-2.5 text-sm text-forest-800">{redirect.message}</p>
        )}
        {formError && <ErrorBanner message={formError} />}

        {isRegister && (
          <div>
            <label htmlFor="name" className="label">Name</label>
            <input id="name" className={`input ${fieldErrors.name ? 'input-error' : ''}`} value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>
        )}

        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className={`input ${fieldErrors.email ? 'input-error' : ''}`} value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
          {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
        </div>

        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            type="password"
            className={`input ${fieldErrors.password ? 'input-error' : ''}`}
            value={password}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
          {fieldErrors.password && <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isRegister ? 'Create account' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {isRegister ? 'Already have an account?' : 'New to Detour?'}{' '}
        <Link to={isRegister ? '/login' : '/register'} state={redirect} className="font-semibold text-forest-800 hover:underline">
          {isRegister ? 'Log in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function RegisterPage() {
  return <AuthForm mode="register" />;
}
