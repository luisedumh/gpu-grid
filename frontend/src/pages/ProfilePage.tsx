import { Check, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ROLE_LABELS, ROLE_PERMISSIONS } from '../auth/roles.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { logout } from '../store/authSlice.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';

/** Information about the logged-in user. */
export function ProfilePage() {
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  // RequireAuth only shows this page to logged-in users
  if (!user) return null;

  async function handleLogout() {
    await dispatch(logout());
    navigate('/login');
  }

  const initials = user.name
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account on GPU Grid" />
      <div className="grid gap-6 p-6 lg:max-w-3xl lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-500">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{user.name}</div>
              <div className="truncate text-sm text-slate-500">{user.email}</div>
            </div>
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Account type</dt>
              <dd>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-500">
                  {ROLE_LABELS[user.role]}
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="whitespace-nowrap text-slate-500">User ID</dt>
              <dd className="truncate font-mono text-xs text-slate-600">{user.id}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="size-4" />
            Log out
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">What you can do</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
            {ROLE_PERMISSIONS[user.role].map((permission) => (
              <li key={permission} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                {permission}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
