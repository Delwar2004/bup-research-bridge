import { Link, Outlet } from 'react-router-dom';
import { useSession } from '../auth/session';

export function AppLayout() {
  const { user, logout, logoutEverywhere } = useSession();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <Link className="brand" to="/dashboard">BUP Research Bridge</Link>
        <nav className="site-nav" aria-label="Account">
          <Link to="/dashboard">Dashboard</Link>
          {user?.role === 'admin' ? <Link to="/admin">Administration</Link> : null}
          <button type="button" className="link-button" onClick={logout}>Sign out</button>
          <button type="button" className="link-button" onClick={logoutEverywhere}>Sign out everywhere</button>
        </nav>
      </header>
      <main id="main" className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>Signed in as {user?.fullName} · {user?.role}</p>
      </footer>
    </div>
  );
}
