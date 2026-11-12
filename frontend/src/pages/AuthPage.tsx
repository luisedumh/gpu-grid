import { Code2, Cpu, Loader2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import * as authApi from '../api/auth.ts';
import { ApiError } from '../api/http.ts';
import { BrandMark } from '../components/BrandMark.tsx';

type Mode = 'login' | 'register';
type AccountType = 'CLIENT' | 'PROVIDER';
type Field = 'name' | 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Checks the form in the browser, with the same rules as the backend. */
function validate(mode: Mode, name: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'register' && name.trim() === '') errors.name = 'Enter your name';
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address';
  if (mode === 'register' && password.length < 8) errors.password = 'Use at least 8 characters';
  if (mode === 'login' && password === '') errors.password = 'Enter your password';
  return errors;
}

/** Login and sign-up screen, as in the mockups. */
export function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AccountType>('CLIENT');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const errors = validate(mode, name, email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === 'login') await authApi.login(email, password);
      else await authApi.register({ name, email, password, role });
      // The session is kept in Redux in SCRUM-21; for now, go to the app
      navigate('/jobs');
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        // Errors per field returned by the backend validation (Zod)
        setFieldErrors(
          Object.fromEntries(err.details.map((d) => [d.field, d.message])) as FieldErrors,
        );
      } else {
        setError((err as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel: only on large screens */}
      <aside className="hidden w-[46%] flex-col bg-sidebar p-14 text-white lg:flex">
        <div className="flex items-center gap-2.5 text-xl font-bold">
          <BrandMark />
          GPU Grid
        </div>
        <div className="mt-auto">
          <h1 className="text-4xl leading-tight font-bold tracking-tight">
            GPU power
            <br />
            when you need it.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-300">
            Run your CUDA programs on other people&apos;s GPUs, or put the hardware you are not
            using to work.
          </p>
          <div className="mt-10 flex gap-10 text-sm text-slate-400">
            <div>
              <div className="text-xl font-bold text-white">Pay per use</div>
              no hardware to buy
            </div>
            <div>
              <div className="text-xl font-bold text-white">Real time</div>
              status and results
            </div>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center p-6">
        {/* Logo above the form: only on small screens, where the left panel is hidden */}
        <div className="mb-8 flex items-center gap-2.5 text-xl font-bold lg:hidden">
          <BrandMark />
          GPU Grid
        </div>

        <form onSubmit={handleSubmit} noValidate className="w-full max-w-sm">
          <div className="mb-7 flex rounded-xl bg-slate-200/70 p-1 text-sm font-semibold">
            <TabLink to="/login" active={mode === 'login'}>
              Log in
            </TabLink>
            <TabLink to="/register" active={mode === 'register'}>
              Create account
            </TabLink>
          </div>

          <h2 className="text-2xl font-bold">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">
            {mode === 'login'
              ? 'Log in to submit jobs or manage your machines.'
              : 'Choose how you want to use the platform.'}
          </p>

          {mode === 'register' && (
            <div className="mb-5 grid grid-cols-2 gap-3">
              <RoleCard
                selected={role === 'CLIENT'}
                onSelect={() => setRole('CLIENT')}
                icon={<Code2 className="size-5" />}
                title="Client"
                text="I want to run my code"
              />
              <RoleCard
                selected={role === 'PROVIDER'}
                onSelect={() => setRole('PROVIDER')}
                icon={<Cpu className="size-5" />}
                title="Provider"
                text="I want to offer my GPUs"
              />
            </div>
          )}

          <div className="space-y-4">
            {mode === 'register' && (
              <FormField label="Name" id="name" error={fieldErrors.name}>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className={inputClass(fieldErrors.name)}
                />
              </FormField>
            )}
            <FormField label="Email" id="email" error={fieldErrors.email}>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={inputClass(fieldErrors.email)}
              />
            </FormField>
            <FormField label="Password" id="password" error={fieldErrors.password}>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className={inputClass(fieldErrors.password)}
              />
            </FormField>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </main>
    </div>
  );
}

function inputClass(error?: string) {
  return `w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none ${
    error ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-brand-500'
  }`;
}

function TabLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`flex-1 rounded-lg py-2 text-center ${
        active ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </Link>
  );
}

interface FormFieldProps {
  label: string;
  id: string;
  error?: string;
  children: ReactNode;
}

function FormField({ label, id, error, children }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-500">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface RoleCardProps {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  text: string;
}

function RoleCard({ selected, onSelect, icon, title, text }: RoleCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border p-3.5 text-left ${
        selected
          ? 'border-2 border-brand-500 bg-brand-50 text-brand-500'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
      }`}
    >
      {icon}
      <div className="mt-1.5 font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-500">{text}</div>
    </button>
  );
}
