import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { reportSummary } from '../../api/admin';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText } from '../opportunities/errors';
import { AdminNav } from './AdminNav';
import { SummaryView } from './SummaryView';

function toApiDate(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

export function ReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const filters = useMemo(() => ({
    from: new URLSearchParams(queryKey).get('from') || '',
    to: new URLSearchParams(queryKey).get('to') || '',
  }), [queryKey]);
  const [draft, setDraft] = useState(filters);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const payload = await reportSummary({
          from: toApiDate(filters.from),
          to: toApiDate(filters.to),
        });
        if (!cancelled) setSummary(payload.data || null);
      } catch (err) {
        if (!cancelled) {
          setSummary(null);
          setError(errorText(err, 'The report could not be loaded.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  function apply(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (draft.from) params.set('from', draft.from);
    if (draft.to) params.set('to', draft.to);
    setSearchParams(params);
  }

  return (
    <section className="panel">
      <p className="eyebrow">Administrator</p>
      <h1>Activity report</h1>
      <AdminNav />
      <p>Counts for accounts, content, mentorship, notifications, and activity logs. Leave both dates empty for all-time totals. The end date is exclusive.</p>
      <form className="filter-form" onSubmit={apply}>
        <div className="filter-grid">
          <FormField id="report-from" label="From">
            <input id="report-from" type="datetime-local" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} />
          </FormField>
          <FormField id="report-to" label="To">
            <input id="report-to" type="datetime-local" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} />
          </FormField>
        </div>
        <div className="button-row">
          <button className="button" type="submit">Apply dates</button>
          <button className="button button-secondary" type="button" onClick={() => setSearchParams(new URLSearchParams())}>All time</button>
        </div>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <LoadingState label="Loading the report" /> : null}
      {!loading && !error && summary ? <SummaryView summary={summary} /> : null}
    </section>
  );
}
