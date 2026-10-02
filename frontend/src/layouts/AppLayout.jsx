import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { unreadNotificationCount } from '../api/notifications';
import { useSession } from '../auth/session';

function NotificationLink() {
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let ticket = 0;
    async function load() {
      const mine = ++ticket;
      try {
        const payload = await unreadNotificationCount();
        if (!cancelled && mine === ticket) setUnreadCount(payload.data?.unreadCount ?? 0);
      } catch {
        if (!cancelled && mine === ticket) setUnreadCount(null);
      }
    }
    load();
    window.addEventListener('notifications-changed', load);
    return () => {
      cancelled = true;
      window.removeEventListener('notifications-changed', load);
    };
  }, [location.pathname]);

  const label = unreadCount > 0 ? `Notifications (${unreadCount})` : 'Notifications';
  return <Link to="/notifications">{label}</Link>;
}

export function AppLayout() {
  const { user, logout, logoutEverywhere } = useSession();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <Link className="brand" to="/dashboard">BUP Research Bridge</Link>
        <nav className="site-nav" aria-label="Account">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/search">Search</Link>
          <Link to="/opportunities">Opportunities</Link>
          <Link to="/research-projects">Projects</Link>
          <Link to="/publications">Publications</Link>
          <Link to="/faculty">Faculty</Link>
          <Link to="/alumni">Alumni</Link>
          <Link to="/mentorship">Mentorship</Link>
          <NotificationLink />
          <Link to="/profile">Profile</Link>
          <Link to="/account/password">Password</Link>
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
