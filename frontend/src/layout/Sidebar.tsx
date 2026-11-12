import { Code2, Cpu, ListChecks, LogOut, UserRound, type LucideIcon } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import type { Role } from '../api/auth.ts';
import { ROLE_LABELS } from '../auth/roles.ts';
import { BackendStatus } from '../components/BackendStatus.tsx';
import { BrandMark } from '../components/BrandMark.tsx';
import { logout } from '../store/authSlice.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Roles that see this option. */
  roles: Role[];
}

const navItems: NavItem[] = [
  { to: '/jobs/new', label: 'New job', icon: Code2, roles: ['CLIENT', 'ADMIN'] },
  { to: '/jobs', label: 'My jobs', icon: ListChecks, roles: ['CLIENT', 'PROVIDER', 'ADMIN'] },
  { to: '/providers', label: 'Providers', icon: Cpu, roles: ['PROVIDER', 'ADMIN'] },
  { to: '/profile', label: 'Profile', icon: UserRound, roles: ['CLIENT', 'PROVIDER', 'ADMIN'] },
];

/** Left navigation bar, as in the mockups. Each role only sees its own options. */
export function Sidebar() {
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  async function handleLogout() {
    await dispatch(logout());
    navigate('/login');
  }

  const visibleItems = navItems.filter((item) => user && item.roles.includes(user.role));

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-sidebar px-3.5 py-5 text-slate-300">
      <div className="flex items-center gap-2.5 px-2 pb-6 text-[17px] font-bold text-white">
        <BrandMark />
        GPU Grid
      </div>

      <nav className="flex flex-col gap-1">
        {visibleItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="size-[18px]" strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3 border-t border-white/10 px-2.5 pt-3">
        {user && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user.name}</div>
              <div className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
              className="rounded-lg p-1.5 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
        <BackendStatus />
      </div>
    </aside>
  );
}
