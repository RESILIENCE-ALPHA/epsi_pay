import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { PaymentPage } from './pages/PaymentPage';
import { SignupPage } from './pages/SignupPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <Navigate to="/pay" replace /> : children;
}

export function App() {
  const { ready, user } = useAuth();
  if (!ready) return <p className="loading">Loading…</p>;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/signup" element={<GuestOnly><SignupPage /></GuestOnly>} />
        <Route path="/pay" element={<RequireAuth><PaymentPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to={user ? '/pay' : '/login'} replace />} />
      </Route>
    </Routes>
  );
}
