import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { SESSION_EXPIRED_EVENT } from './api/http.ts';
import { RequireAuth } from './auth/RequireAuth.tsx';
import { homePathFor } from './auth/roles.ts';
import { AppLayout } from './layout/AppLayout.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { JobsPage } from './pages/JobsPage.tsx';
import { NewJobPage } from './pages/NewJobPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { ProvidersPage } from './pages/ProvidersPage.tsx';
import { fetchCurrentUser, sessionExpired } from './store/authSlice.ts';
import { useAppDispatch, useAppSelector } from './store/hooks.ts';

/** Sends each user to the first page of their role. */
function HomeRedirect() {
  const user = useAppSelector((state) => state.auth.user);
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

/**
 * Which page is shown for each URL. Login and sign-up have their own full-screen layout;
 * every other page needs a session, and some of them a specific role.
 */
export default function App() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // On page load: is there a session? (the cookie survives reloads)
    dispatch(fetchCurrentUser());
    // If the backend answers 401 later on, the session expired
    const onExpired = () => dispatch(sessionExpired());
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [dispatch]);

  return (
    <Routes>
      <Route path="login" element={<AuthPage mode="login" />} />
      <Route path="register" element={<AuthPage mode="register" />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route
          path="jobs/new"
          element={
            <RequireAuth roles={['CLIENT', 'ADMIN']}>
              <NewJobPage />
            </RequireAuth>
          }
        />
        <Route path="jobs" element={<JobsPage />} />
        <Route
          path="providers"
          element={
            <RequireAuth roles={['PROVIDER', 'ADMIN']}>
              <ProvidersPage />
            </RequireAuth>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
