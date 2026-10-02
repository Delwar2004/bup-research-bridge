import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="shell">
      <main id="main" className="site-main">
        <section className="panel">
          <h1>Page not found</h1>
          <p>That address is not part of BUP Research Bridge.</p>
          <Link className="button" to="/">Go to the home page</Link>
        </section>
      </main>
    </div>
  );
}
