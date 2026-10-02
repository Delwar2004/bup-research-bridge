import { cloneElement, isValidElement } from 'react';

export function FormField({ id, label, hint, error, children }) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
      'aria-describedby': describedBy,
      'aria-invalid': error ? true : undefined,
    })
    : children;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint ? <p className="field-hint" id={hintId}>{hint}</p> : null}
      {control}
      {error ? <p className="field-error" id={errorId}>{error}</p> : null}
    </div>
  );
}
