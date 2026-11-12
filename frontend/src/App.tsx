import { Navigate, Route, Routes } from 'react-router';
import { AppLayout } from './layout/AppLayout.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { JobsPage } from './pages/JobsPage.tsx';
import { NewJobPage } from './pages/NewJobPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ProvidersPage } from './pages/ProvidersPage.tsx';

/** Which page is shown for each URL. Login and sign-up have their own full-screen layout. */
export default function App() {
  return (
    <Routes>
      <Route path="login" element={<AuthPage mode="login" />} />
      <Route path="register" element={<AuthPage mode="register" />} />
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/jobs/new" replace />} />
        <Route path="jobs/new" element={<NewJobPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
