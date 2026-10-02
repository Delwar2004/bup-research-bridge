import { Link, Outlet } from 'react-router-dom';
import { useSession } from '../auth/session';

export function PublicLayout() {
  const { isAuthenticated, status } = useSession();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <Link className="brand" to="/">BUP Research Bridge</Link>
        <nav className="site-nav" aria-label="Public">
          <Link to="/">Home</Link>
          {status !== 'loading' && isAuthenticated ? (
            <Link to="/dashboard">Dashboard</Link>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link className="nav-accent" to="/register">Create account</Link>
            </>
          )}
        </nav>
      </header>
      <main id="main" className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>Bangladesh University of Professionals · CSE and ICT research collaboration</p>
      </footer>
    </div>
  );
}
