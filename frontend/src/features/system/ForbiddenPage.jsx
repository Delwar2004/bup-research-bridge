import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <section className="panel">
      <h1>You cannot open this page</h1>
      <p>Your role does not include this part of BUP Research Bridge.</p>
      <Link className="button" to="/dashboard">Back to dashboard</Link>
    </section>
  );
}
