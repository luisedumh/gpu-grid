import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Role } from '../api/auth.ts';
import { useAppSelector } from '../store/hooks.ts';
import { homePathFor } from './roles.ts';

interface RequireAuthProps {
  /** Roles allowed to see the page. If empty, any logged-in user can. */
  roles?: Role[];
  children: ReactNode;
}

/** Protected route: only shows its content to logged-in users with an allowed role. */
export function RequireAuth({ roles = [], children }: RequireAuthProps) {
  const { user, status } = useAppSelector((state) => state.auth);
  const location = useLocation();

  // While we ask the backend whether there is a session, show a spinner
  if (status === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Not logged in: go to the login page, remembering where the user wanted to go
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // Logged in, but this page is not for their role: go to their home page
  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }

  return children;
}
