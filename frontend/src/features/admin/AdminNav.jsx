import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  ['/admin', 'Overview'],
  ['/admin/users', 'Users'],
  ['/admin/activity-logs', 'Activity logs'],
  ['/admin/reports', 'Reports'],
  ['/admin/research-areas', 'Research areas'],
];

export function AdminNav() {
  const { pathname } = useLocation();

  return (
    <nav className="admin-nav" aria-label="Administration">
      {LINKS.map(([to, label]) => {
        const current = to === '/admin'
          ? pathname === '/admin'
          : pathname === to || pathname.startsWith(`${to}/`);
        return (
          <Link key={to} to={to} aria-current={current ? 'page' : undefined}>{label}</Link>
        );
      })}
    </nav>
  );
}
