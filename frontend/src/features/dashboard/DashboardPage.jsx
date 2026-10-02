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
        This is the signed-in shell. Research directories, opportunities, mentorship,
        and administration screens are not part of this foundation step.
      </p>
    </section>
  );
}
