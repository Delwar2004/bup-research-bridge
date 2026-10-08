import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session';

export function DashboardPage() {
  const { user } = useSession();

  return (
    <section className="welcome">
      <div>
        <p className="eyebrow">Signed in · {user?.role}</p>
        <h1>Hello, {user?.fullName}</h1>
        <p>
          Browse faculty and alumni, open thesis opportunities, and continue mentorship from one place.
          Your account email is {user?.email}.
        </p>
        <div className="welcome-actions">
          <Link className="button" to="/search">Search research</Link>
          <Link className="button button-secondary" to="/opportunities">Thesis opportunities</Link>
          <Link className="button button-secondary" to="/profile">Your profile</Link>
          {user?.role === 'admin' ? <Link className="button button-secondary" to="/admin">Administration</Link> : null}
        </div>
      </div>
    </section>
  );
}
