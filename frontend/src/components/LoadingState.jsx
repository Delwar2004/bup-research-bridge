export function LoadingState({ label = 'Loading' }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  );
}
