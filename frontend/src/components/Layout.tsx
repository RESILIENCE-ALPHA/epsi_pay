import { Link, Outlet } from 'react-router';
import { useAuth } from '../auth';

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">EPSI Pay</Link>
        {user && (
          <div className="topbar-user">
            <span>{user.name ?? user.email}</span>
            <button type="button" className="button-ghost" onClick={logout}>Sign out</button>
          </div>
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </>
  );
}
