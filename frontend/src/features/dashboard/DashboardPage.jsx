import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session';

export function DashboardPage() {
  const { user } = useSession();

  return (
    <section className="panel">
      <p className="eyebrow">Signed in</p>
      <h1>Hello, {user?.fullName}</h1>
      <dl className="meta-list">
        <div>
          <dt>Role</dt>
          <dd>{user?.role}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{user?.status}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user?.email}</dd>
        </div>
      </dl>
      <p>
        Update your <Link to="/profile">profile</Link> or <Link to="/account/password">password</Link>, and open your <Link to="/notifications">notifications</Link>.
        {user?.role === 'admin' ? <> Open <Link to="/admin">administration</Link>.</> : null}
        <Link to="/search">Search</Link> research content, open <Link to="/mentorship">mentorship</Link>, or browse <Link to="/opportunities">opportunities</Link>, <Link to="/research-projects">research projects</Link>, <Link to="/publications">publications</Link>, <Link to="/faculty">faculty</Link>, and <Link to="/alumni">alumni</Link>.
      </p>
    </section>
  );
}
