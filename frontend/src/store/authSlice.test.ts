import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { client, mockFetch } from '../test/utils.tsx';
import reducer, { fetchCurrentUser, login, logout, sessionExpired } from './authSlice.ts';

const initial = reducer(undefined, { type: 'init' });
const loggedIn = { user: client, status: 'ready' as const };

describe('authSlice reducer', () => {
  it('starts without a user, checking whether there is a session', () => {
    expect(initial).toEqual({ user: null, status: 'checking' });
  });

  it('keeps the user found when the page loads', () => {
    const state = reducer(initial, fetchCurrentUser.fulfilled(client, 'req'));
    expect(state).toEqual(loggedIn);
  });

  it('is ready without a user when there is no session', () => {
    const state = reducer(initial, fetchCurrentUser.rejected(new Error('401'), 'req'));
    expect(state).toEqual({ user: null, status: 'ready' });
  });

  it('stores the user after logging in', () => {
    const state = reducer(
      { user: null, status: 'ready' },
      login.fulfilled(client, 'req', { email: client.email, password: 'password123' }),
    );
    expect(state.user).toEqual(client);
  });

  it('forgets the user after logging out or when the session expires', () => {
    expect(reducer(loggedIn, logout.fulfilled(undefined, 'req')).user).toBeNull();
    expect(reducer(loggedIn, sessionExpired()).user).toBeNull();
  });
});

describe('login action', () => {
  const makeStore = () => configureStore({ reducer: { auth: reducer } });

  it('sends the credentials to the backend and stores the user', async () => {
    const fetch = mockFetch(200, client);
    const store = makeStore();

    await store.dispatch(login({ email: client.email, password: 'password123' }));

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(store.getState().auth.user).toEqual(client);
  });

  it('returns the errors of each field when the backend rejects the data', async () => {
    mockFetch(400, {
      error: 'Invalid request',
      details: [{ field: 'email', message: 'Invalid email address' }],
    });
    const store = makeStore();

    const result = await store.dispatch(login({ email: 'nope', password: 'x' }));

    expect(login.rejected.match(result)).toBe(true);
    expect(result.payload).toEqual({
      message: 'Invalid request',
      fields: { email: 'Invalid email address' },
    });
    expect(store.getState().auth.user).toBeNull();
  });
});
