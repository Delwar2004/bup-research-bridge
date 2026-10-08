import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="welcome">
      <div>
        <p className="eyebrow">Bangladesh University of Professionals</p>
        <h1>Research collaboration for CSE and ICT</h1>
        <p>
          BUP Research Bridge connects students, faculty, and alumni so research
          interests, thesis opportunities, previous work, and mentorship sit in one place.
        </p>
        <div className="welcome-actions">
          <Link className="button" to="/register">Create account</Link>
          <Link className="button button-secondary" to="/login">Sign in</Link>
        </div>
      </div>
    </section>
  );
}
