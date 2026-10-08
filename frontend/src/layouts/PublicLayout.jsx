import { Link, Outlet } from 'react-router-dom';
import { useSession } from '../auth/session';

export function PublicLayout() {
  const { isAuthenticated, status } = useSession();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="public-bar">
        <Link className="logo" to="/">
          <span className="logo-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M3 13.5V4.8L9 2.2l6 2.6v8.7L9 16.2 3 13.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9 2.4v13.6M3.2 5.2 9 8.2l5.8-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </span>
          <span>
            <strong>Research Bridge</strong>
            <span>BUP CSE · ICT</span>
          </span>
        </Link>
        <nav className="public-nav" aria-label="Public">
          <Link to="/">Home</Link>
          {status !== 'loading' && isAuthenticated ? (
            <Link className="nav-accent" to="/dashboard">Dashboard</Link>
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
