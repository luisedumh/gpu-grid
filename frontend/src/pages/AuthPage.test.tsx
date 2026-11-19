import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { client, mockFetch, renderWithProviders } from '../test/utils.tsx';
import { AuthPage } from './AuthPage.tsx';

function renderAuth(route: '/login' | '/register') {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/jobs/new" element={<p>New job page</p>} />
    </Routes>,
    { route },
  );
}

describe('AuthPage', () => {
  it('checks every field before sending anything to the backend', async () => {
    const fetch = mockFetch(201, client);
    renderAuth('/register');

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the error of the backend when the password is wrong', async () => {
    mockFetch(401, { error: 'Wrong email or password' });
    renderAuth('/login');

    await userEvent.type(screen.getByLabelText('Email'), client.email);
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Wrong email or password')).toBeInTheDocument();
  });

  it('opens the home page of the user after logging in', async () => {
    const fetch = mockFetch(200, client);
    renderAuth('/login');

    await userEvent.type(screen.getByLabelText('Email'), client.email);
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('New job page')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.anything());
  });
});
