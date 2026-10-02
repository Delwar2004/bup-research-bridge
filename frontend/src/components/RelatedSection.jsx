import { Alert } from './Alert';
import { LoadingState } from './LoadingState';

export function RelatedSection({ title, loading, error, isEmpty, empty, onRetry, children, count }) {
  return (
    <section className="related-section">
      <h2>{title}{typeof count === 'number' ? <span className="count"> {count}</span> : null}</h2>
      {loading ? <LoadingState label={`Loading ${title.toLowerCase()}`} /> : null}
      {!loading && error ? (
        <>
          <Alert>{error}</Alert>
          {onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button> : null}
        </>
      ) : null}
      {!loading && !error && isEmpty ? <p className="empty-state">{empty}</p> : null}
      {!loading && !error && !isEmpty ? children : null}
    </section>
  );
}
