export function Pagination({ page, totalPages, onPage }) {
  if (!totalPages || totalPages < 2) return null;

  return (
    <nav className="pager" aria-label="Pages">
      <button
        type="button"
        className="button button-secondary"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <p>Page {page} of {totalPages}</p>
      <button
        type="button"
        className="button button-secondary"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
