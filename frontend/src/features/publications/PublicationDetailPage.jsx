import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import {
  deletePublication,
  getPublication,
  moderatePublication,
  submitPublication,
} from '../../api/publications';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';

function httpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

export function PublicationDetailPage() {
  const { publicationId } = useParams();
  const { user } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [moderationStatus, setModerationStatus] = useState('approved');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pendingAction, setPendingAction] = useState('');
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMissing(false);
    try {
      const payload = await getPublication(publicationId);
      setItem(payload.data);
    } catch (err) {
      setItem(null);
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setError(errorText(err, 'This publication could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [publicationId]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  if (loading) return <LoadingState label="Loading publication" />;

  if (missing) {
    return (
      <section className="panel">
        <h1>Publication</h1>
        <p>This publication is not available.</p>
        <Link className="button" to="/publications">Back to publications</Link>
      </section>
    );
  }

  if (error || !item) {
    return (
      <section className="panel">
        <h1>Publication</h1>
        <Alert>{error || 'This publication could not be loaded.'}</Alert>
        <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </section>
    );
  }

  const isCreator = user?.id === item.createdByUserId;
  const isAdmin = user?.role === 'admin';
  const canEdit = isCreator || isAdmin;
  const canSubmit = isCreator && (item.moderationStatus === 'draft' || item.moderationStatus === 'rejected');
  const canDelete = isAdmin || (isCreator && (item.moderationStatus === 'draft' || item.moderationStatus === 'rejected'));
  const link = httpUrl(item.url);
  const authors = [...(item.authors || [])].sort((left, right) => left.authorOrder - right.authorOrder);

  async function run(action, task) {
    setNotice('');
    setError('');
    setFieldErrors({});
    setPendingAction(action);
    try {
      const payload = await task();
      if (action === 'delete') {
        navigate('/publications', { state: { notice: payload.message } });
        return;
      }
      setNotice(payload.message);
      if (payload.data) setItem(payload.data);
      else await load();
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(errorText(err, 'The publication could not be updated.'));
    } finally {
      setPendingAction('');
    }
  }

  return (
    <article className="panel">
      <p className="eyebrow">Publication</p>
      <h1>{item.title}</h1>
      <p><Link to="/publications">Back to publications</Link></p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <dl className="meta-list">
        <div>
          <dt>Year</dt>
          <dd>{item.publicationYear ?? 'Not listed'}</dd>
        </div>
        <div>
          <dt>Venue</dt>
          <dd>{item.venue || 'Not listed'}</dd>
        </div>
        <div>
          <dt>Published on</dt>
          <dd>{item.publishedOn || 'Not listed'}</dd>
        </div>
        <div>
          <dt>DOI</dt>
          <dd>{item.doi || 'Not listed'}</dd>
        </div>
        <div>
          <dt>Moderation</dt>
          <dd>{item.moderationStatus}</dd>
        </div>
        {isCreator ? (
          <div>
            <dt>Recorded by</dt>
            <dd>You recorded this publication.</dd>
          </div>
        ) : null}
        {isAdmin && !isCreator ? (
          <div>
            <dt>Recorded by</dt>
            <dd>{item.createdByUserId}</dd>
          </div>
        ) : null}
        {item.publishedAt ? (
          <div>
            <dt>Approved</dt>
            <dd>{new Date(item.publishedAt).toLocaleString()}</dd>
          </div>
        ) : null}
      </dl>
      <h2>Abstract</h2>
      {item.abstract ? <p className="prose">{item.abstract}</p> : <p className="empty-state">No abstract is listed.</p>}
      {item.url ? (
        <>
          <h2>Link</h2>
          {link ? <p><a href={link} rel="noopener noreferrer">{link}</a></p> : <p className="prose">{item.url}</p>}
        </>
      ) : null}
      <h2>Research areas</h2>
      {item.researchAreas?.length ? (
        <ul className="tag-list">
          {item.researchAreas.map((area) => (
            <li key={area.id}>
              <Link className="tag" to={`/publications?researchAreaId=${encodeURIComponent(area.id)}`}>{area.name}</Link>
            </li>
          ))}
        </ul>
      ) : <p className="empty-state">No research areas are listed.</p>}
      <h2>Authors</h2>
      {authors.length ? (
        <ul className="record-list">
          {authors.map((author) => (
            <li key={author.userId}>
              <h3>{author.fullName}</h3>
              <p>Author order {author.authorOrder}</p>
            </li>
          ))}
        </ul>
      ) : <p className="empty-state">No authors are listed.</p>}
      {canEdit ? (
        <div className="button-row">
          <Link className="button" to={`/publications/${item.id}/edit`}>Edit details</Link>
        </div>
      ) : null}
      {canSubmit ? (
        <div className="related-section">
          <h2>Review</h2>
          <p>Submit this {item.moderationStatus} publication for an administrator to approve. Approval requires at least one research area and one author.</p>
          <button className="button" type="button" disabled={pendingAction === 'submit'} onClick={() => run('submit', () => submitPublication(item.id))}>
            {pendingAction === 'submit' ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      ) : null}
      {isAdmin ? (
        <form
          className="related-section"
          onSubmit={(event) => {
            event.preventDefault();
            if (note.trim().length > 500) {
              setFieldErrors({ note: 'Note must be at most 500 characters.' });
              return;
            }
            const body = { moderationStatus };
            if (note.trim()) body.note = note.trim();
            run('moderate', () => moderatePublication(item.id, body));
          }}
        >
          <h2>Moderation</h2>
          <FormField id="moderationStatus" label="Decision" error={fieldErrors.moderationStatus}>
            <select id="moderationStatus" value={moderationStatus} onChange={(event) => setModerationStatus(event.target.value)}>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
            </select>
          </FormField>
          <FormField id="note" label="Note" hint="Optional. Stored with the moderation record, not on the publication." error={fieldErrors.note}>
            <textarea id="note" rows="3" value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
          <button className="button" type="submit" disabled={pendingAction === 'moderate'}>
            {pendingAction === 'moderate' ? 'Saving…' : 'Save moderation'}
          </button>
        </form>
      ) : null}
      {canDelete ? (
        <div className="related-section">
          <h2>Delete</h2>
          <p>
            {isAdmin
              ? 'Administrators can delete a publication in any status. Archive an approved publication when the record should stay.'
              : 'A draft or rejected publication can be deleted.'}
          </p>
          <button
            className="button button-secondary"
            type="button"
            disabled={pendingAction === 'delete'}
            onClick={() => {
              if (window.confirm('Delete this publication?')) {
                run('delete', () => deletePublication(item.id));
              }
            }}
          >
            {pendingAction === 'delete' ? 'Deleting…' : 'Delete publication'}
          </button>
        </div>
      ) : null}
    </article>
  );
}
