import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="panel hero">
      <p className="eyebrow">Bangladesh University of Professionals</p>
      <h1>Research collaboration for CSE and ICT</h1>
      <p className="lede">
        BUP Research Bridge connects students, faculty, and alumni so research
        interests, thesis opportunities, previous work, and mentorship sit in one place.
      </p>
      <p>
        Faculty profiles, opportunities, publications, and the previous-work repository
        are available after you sign in. Departments and research areas can be loaded
        while you create an account.
      </p>
      <div className="button-row">
        <Link className="button" to="/register">Create account</Link>
        <Link className="button button-secondary" to="/login">Sign in</Link>
      </div>
    </section>
  );
}
