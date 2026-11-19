import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { User } from '../api/auth.ts';
import type { Job } from '../api/jobs.ts';
import authReducer from '../store/authSlice.ts';
import jobsReducer from '../store/jobsSlice.ts';

export const client: User = {
  id: 'u1',
  name: 'Ana Cliente',
  email: 'ana@gpugrid.dev',
  role: 'CLIENT',
};

export const provider: User = {
  id: 'u2',
  name: 'Pablo Proveedor',
  email: 'pablo@gpugrid.dev',
  role: 'PROVIDER',
};

/** A store like the real one, starting with the given session. */
export function makeStore(user: User | null = null, status: 'checking' | 'ready' = 'ready') {
  return configureStore({
    reducer: { auth: authReducer, jobs: jobsReducer },
    preloadedState: { auth: { user, status } },
  });
}

interface RenderOptions {
  /** URL the app starts at. */
  route?: string;
  user?: User | null;
  status?: 'checking' | 'ready';
}

/** Renders a component inside the Redux store and a router, as in the real app. */
export function renderWithProviders(
  ui: ReactNode,
  { route = '/', user = null, status = 'ready' }: RenderOptions = {},
) {
  const store = makeStore(user, status);
  const result = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
  );
  return { store, ...result };
}

/** A job with sensible values; each test changes only what it needs. */
export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    name: 'Vector addition',
    status: 'PENDING',
    timeoutSeconds: 60,
    compilerOutput: null,
    attempts: 0,
    stdout: null,
    stderr: null,
    exitCode: null,
    durationMs: null,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

/** Replaces fetch with a fake one that always answers this status and JSON body. */
export function mockFetch(status: number, body: unknown) {
  const fake = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fake);
  return fake;
}
