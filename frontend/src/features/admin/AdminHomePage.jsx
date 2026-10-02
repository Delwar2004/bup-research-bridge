import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reportSummary } from '../../api/admin';
import { Alert } from '../../components/Alert';
import { LoadingState } from '../../components/LoadingState';
import { errorText } from '../opportunities/errors';
import { AdminNav } from './AdminNav';
import { SummaryView } from './SummaryView';

export function AdminHomePage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const payload = await reportSummary();
        if (!cancelled) setSummary(payload.data || null);
      } catch (err) {
        if (!cancelled) setError(errorText(err, 'The report could not be loaded.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel">
      <p className="eyebrow">Administrator</p>
      <h1>Administration</h1>
      <AdminNav />
      <p>Manage accounts, review content, and read the activity recorded by those actions.</p>
      <h2>Content review</h2>
      <div className="button-row">
        <Link className="button button-secondary" to="/opportunities?moderationStatus=pending">Pending opportunities</Link>
        <Link className="button button-secondary" to="/research-projects?moderationStatus=pending">Pending projects</Link>
        <Link className="button button-secondary" to="/publications?moderationStatus=pending">Pending publications</Link>
      </div>
      <p className="field-hint">Approve, reject, archive, edit, and delete stay on each record. Archive keeps the history. Delete is available only where that record allows it.</p>
      <h2>All-time summary</h2>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <LoadingState label="Loading the summary" /> : null}
      {!loading && !error && summary ? <SummaryView summary={summary} /> : null}
      <p><Link to="/admin/reports">Open a dated report</Link></p>
    </section>
  );
}
