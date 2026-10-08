import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { unreadNotificationCount } from '../api/notifications';
import { useSession } from '../auth/session';

const ROLE_LABEL = {
  student: 'Student',
  faculty: 'Faculty',
  alumni: 'Alumni',
  admin: 'Administrator',
};

const EXPLORE = [
  ['/dashboard', 'Dashboard'],
  ['/search', 'Search'],
  ['/faculty', 'Faculty'],
  ['/opportunities', 'Thesis opportunities'],
  ['/research-projects', 'Projects'],
  ['/publications', 'Publications'],
  ['/alumni', 'Alumni'],
  ['/mentorship', 'Mentorship'],
  ['/notifications', 'Notifications'],
];

const ADMIN = [
  ['/admin', 'Overview'],
  ['/admin/users', 'User management'],
  ['/admin/research-areas', 'Research areas'],
  ['/admin/reports', 'Statistics'],
  ['/admin/activity-logs', 'Activity logs'],
];

const CRUMBS = [
  ['/account/password', 'Password'],
  ['/admin/users', 'User management'],
  ['/admin/activity-logs', 'Activity logs'],
  ['/admin/reports', 'Statistics'],
  ['/admin/research-areas', 'Research areas'],
  ['/admin', 'Administration'],
  ['/dashboard', 'Dashboard'],
  ['/search', 'Search'],
  ['/opportunities', 'Thesis opportunities'],
  ['/research-projects', 'Projects'],
  ['/publications', 'Publications'],
  ['/faculty', 'Faculty'],
  ['/alumni', 'Alumni'],
  ['/mentorship', 'Mentorship'],
  ['/notifications', 'Notifications'],
  ['/profile', 'Profile'],
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0].toUpperCase());
  return letters.join('') || 'B';
}

function currentCrumb(pathname) {
  const match = CRUMBS.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  return match ? match[1] : 'Research Bridge';
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.2a3.4 3.4 0 0 0-3.4 3.4c0 2.2-.7 2.8-1.3 3.4h9.4c-.6-.6-1.3-1.2-1.3-3.4A3.4 3.4 0 0 0 8 2.2Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.6 12.2a1.4 1.4 0 0 0 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Logo({ to = '/dashboard' }) {
  return (
    <Link className="logo" to={to}>
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
  );
}

function NotificationButton() {
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

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';
  return (
    <Link className="icon-button" to="/notifications" aria-label={label}>
      <BellIcon />
      {unreadCount > 0 ? <span className="bell-count">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
    </Link>
  );
}

function SideLink({ to, children, onNavigate }) {
  const exact = to === '/dashboard' || to === '/admin';
  return (
    <NavLink
      to={to}
      end={exact}
      onClick={onNavigate}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    >
      {children}
    </NavLink>
  );
}

export function AppLayout() {
  const { user, logout, logoutEverywhere } = useSession();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const roleLabel = ROLE_LABEL[user?.role] || user?.role || '';

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      {menuOpen ? <button type="button" className="sidebar-backdrop" aria-label="Close menu" onClick={closeMenu} /> : null}
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Primary">
        <div className="side-top">
          <Logo />
          <button type="button" className="mobile-close" aria-label="Close menu" onClick={closeMenu}>×</button>
        </div>
        <p className="nav-caption">Explore</p>
        <nav aria-label="Explore">
          {EXPLORE.map(([to, label]) => (
            <SideLink key={to} to={to} onNavigate={closeMenu}>{label}</SideLink>
          ))}
        </nav>
        {user?.role === 'admin' ? (
          <>
            <p className="nav-caption secondary-caption">Administration</p>
            <nav aria-label="Administration">
              {ADMIN.map(([to, label]) => (
                <SideLink key={to} to={to} onNavigate={closeMenu}>{label}</SideLink>
              ))}
            </nav>
          </>
        ) : null}
        <p className="nav-caption secondary-caption">Account</p>
        <nav aria-label="Account">
          <SideLink to="/profile" onNavigate={closeMenu}>Profile</SideLink>
          <SideLink to="/account/password" onNavigate={closeMenu}>Password</SideLink>
          <button type="button" className="nav-item" onClick={logout}>Sign out</button>
          <button type="button" className="nav-item" onClick={logoutEverywhere}>Sign out everywhere</button>
        </nav>
        <Link className="side-profile" to="/profile" onClick={closeMenu}>
          <span className="avatar initials" aria-hidden="true">{initials(user?.fullName)}</span>
          <div>
            <strong>{user?.fullName}</strong>
            <span>{roleLabel}</span>
          </div>
        </Link>
      </aside>
      <div className="content-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <button type="button" className="icon-button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
              <MenuIcon />
            </button>
          </div>
          <div className="breadcrumbs">
            Research Bridge
            <span aria-hidden="true">/</span>
            <strong>{currentCrumb(pathname)}</strong>
          </div>
          <Link className="global-search" to="/search">
            <SearchIcon />
            <span>Search across BUP Research Bridge</span>
          </Link>
          <div className="top-actions">
            <NotificationButton />
            <Link className="header-profile" to="/profile">
              <span className="avatar initials" aria-hidden="true">{initials(user?.fullName)}</span>
              <span>
                <strong>{user?.fullName}</strong>
                <span>{roleLabel}</span>
              </span>
            </Link>
          </div>
        </header>
        <main id="main" className="site-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
