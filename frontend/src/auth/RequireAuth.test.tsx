import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { User } from '../api/auth.ts';
import { client, provider, renderWithProviders } from '../test/utils.tsx';
import { RequireAuth } from './RequireAuth.tsx';

/** A tiny app: a public login page and three protected pages. */
function renderAt(route: string, user: User | null, status: 'checking' | 'ready' = 'ready') {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<p>Login page</p>} />
      <Route
        path="/jobs/new"
        element={
          <RequireAuth roles={['CLIENT', 'ADMIN']}>
            <p>New job page</p>
          </RequireAuth>
        }
      />
      <Route
        path="/providers"
        element={
          <RequireAuth roles={['PROVIDER', 'ADMIN']}>
            <p>Providers page</p>
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <p>Profile page</p>
          </RequireAuth>
        }
      />
    </Routes>,
    { route, user, status },
  );
}

describe('RequireAuth', () => {
  it('shows nothing of the page while the session is being checked', () => {
    renderAt('/profile', null, 'checking');
    expect(screen.queryByText('Profile page')).not.toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('sends visitors without a session to the login page', () => {
    renderAt('/profile', null);
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('lets any logged-in user see a page without roles', () => {
    renderAt('/profile', provider);
    expect(screen.getByText('Profile page')).toBeInTheDocument();
  });

  it('shows a page to the roles it allows', () => {
    renderAt('/providers', provider);
    expect(screen.getByText('Providers page')).toBeInTheDocument();
  });

  it('sends other roles to their own home page', () => {
    renderAt('/providers', client);
    expect(screen.getByText('New job page')).toBeInTheDocument();

    renderAt('/jobs/new', provider);
    expect(screen.getByText('Providers page')).toBeInTheDocument();
  });
});
