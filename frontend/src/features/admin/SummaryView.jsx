export function SummaryView({ summary }) {
  return (
    <div className="count-grid">
      {Object.entries(summary || {}).map(([name, value]) => (
        <article className="record-card" key={name}>
          <h2>{name}</h2>
          {value && typeof value === 'object' ? (
            <ul className="count-list">
              {Object.entries(value).map(([key, count]) => (
                <li key={key}>
                  <span>{key}</span>
                  <span>{count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>{String(value)}</p>
          )}
        </article>
      ))}
    </div>
  );
}
