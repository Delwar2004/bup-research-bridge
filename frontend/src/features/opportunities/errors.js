import { ApiError } from '../../api/client';

export function fieldErrorsFrom(err) {
  const next = {};
  if (err instanceof ApiError && Array.isArray(err.details?.fields)) {
    err.details.fields.forEach((item) => {
      if (item.field && item.field !== 'body') next[item.field] = item.message;
    });
  }
  return next;
}

export function errorText(err, fallback) {
  if (!(err instanceof ApiError)) return fallback;
  const fields = Array.isArray(err.details?.fields) ? err.details.fields : [];
  const detail = fields.map((item) => item.message).filter(Boolean).join(' ');
  return detail || err.message || fallback;
}
