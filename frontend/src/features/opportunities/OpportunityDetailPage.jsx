import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import {
  deleteOpportunity,
  getOpportunity,
  moderateOpportunity,
  submitOpportunity,
  updateOpportunityAvailability,
} from '../../api/opportunities';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from './errors';

function departmentLabel(department) {
  if (!department) return 'No department listed';
  return `${department.code} — ${department.name}`;
}

export function OpportunityDetailPage() {
  const { opportunityId } = useParams();
  const { user } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [availability, setAvailability] = useState('open');
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
      const payload = await getOpportunity(opportunityId);
      setItem(payload.data);
      setAvailability(payload.data.availabilityStatus || 'open');
    } catch (err) {
      setItem(null);
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setError(errorText(err, 'This opportunity could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  if (loading) return <LoadingState label="Loading opportunity" />;

  if (missing) {
    return (
      <section className="panel">
        <h1>Opportunity</h1>
        <p>This opportunity is not available.</p>
        <Link className="button" to="/opportunities">Back to opportunities</Link>
      </section>
    );
  }

  if (error || !item) {
    return (
      <section className="panel">
        <h1>Opportunity</h1>
        <Alert>{error || 'This opportunity could not be loaded.'}</Alert>
        <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </section>
    );
  }

  const isOwner = user?.id === item.facultyUserId;
  const isAdmin = user?.role === 'admin';
  const canEdit = isOwner || isAdmin;
  const canSetAvailability = isAdmin || (isOwner && user?.role === 'faculty');
  const canSubmit = isOwner && (item.moderationStatus === 'draft' || item.moderationStatus === 'rejected');
  const canDelete = isAdmin || (isOwner && (item.moderationStatus === 'draft' || item.moderationStatus === 'rejected'));
  const facultyHref = item.facultyAccountRole === 'faculty'
    ? `/faculty/${item.facultyUserId}`
    : item.facultyAccountRole === 'alumni'
      ? `/alumni/${item.facultyUserId}`
      : '';

  async function run(action, task) {
    setNotice('');
    setError('');
    setFieldErrors({});
    setPendingAction(action);
    try {
      const payload = await task();
      if (action === 'delete') {
        navigate('/opportunities', { state: { notice: payload.message } });
        return;
      }
      setNotice(payload.message);
      if (payload.data) {
        setItem(payload.data);
        setAvailability(payload.data.availabilityStatus || 'open');
      } else {
        await load();
      }
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(errorText(err, 'The opportunity could not be updated.'));
    } finally {
      setPendingAction('');
    }
  }

  return (
    <article className="panel">
      <p className="eyebrow">Opportunity</p>
      <h1>{item.title}</h1>
      <p><Link to="/opportunities">Back to opportunities</Link></p>
      {user?.role === 'student'
        && item.moderationStatus === 'approved'
        && item.availabilityStatus === 'open'
        && (item.facultyAccountRole === 'faculty' || item.facultyAccountRole === 'alumni') ? (
          <p>
            <Link className="button" to={`/mentorship/new?mentorUserId=${item.facultyUserId}&opportunityId=${item.id}`}>Request mentorship</Link>
          </p>
        ) : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <dl className="meta-list">
        <div>
          <dt>Type</dt>
          <dd>{item.opportunityType}</dd>
        </div>
        <div>
          <dt>Availability</dt>
          <dd>{item.availabilityStatus}</dd>
        </div>
        <div>
          <dt>Moderation</dt>
          <dd>{item.moderationStatus}</dd>
        </div>
        <div>
          <dt>Faculty</dt>
          <dd>{facultyHref ? <Link to={facultyHref}>{item.facultyName}</Link> : item.facultyName}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{departmentLabel(item.department)}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{item.deadline || 'None'}</dd>
        </div>
        <div>
          <dt>Slots</dt>
          <dd>{item.slots ?? 'Not specified'}</dd>
        </div>
        {item.publishedAt ? (
          <div>
            <dt>Published</dt>
            <dd>{new Date(item.publishedAt).toLocaleString()}</dd>
          </div>
        ) : null}
      </dl>
      <h2>Description</h2>
      <p className="prose">{item.description}</p>
      {item.requiredSkills ? (
        <>
          <h2>Required skills</h2>
          <p className="prose">{item.requiredSkills}</p>
        </>
      ) : null}
      {item.prerequisites ? (
        <>
          <h2>Prerequisites</h2>
          <p className="prose">{item.prerequisites}</p>
        </>
      ) : null}
      <h2>Research areas</h2>
      {item.researchAreas?.length ? (
        <ul className="tag-list">
          {item.researchAreas.map((area) => (
            <li key={area.id}>
              <Link className="tag" to={`/opportunities?researchAreaId=${encodeURIComponent(area.id)}`}>{area.name}</Link>
            </li>
          ))}
        </ul>
      ) : <p className="empty-state">No research areas are listed.</p>}
      {canEdit ? (
        <div className="button-row">
          <Link className="button" to={`/opportunities/${item.id}/edit`}>Edit details</Link>
        </div>
      ) : null}
      {canSetAvailability ? (
        <form
          className="related-section"
          onSubmit={(event) => {
            event.preventDefault();
            run('availability', () => updateOpportunityAvailability(item.id, availability));
          }}
        >
          <h2>Availability</h2>
          <FormField id="availabilityStatus" label="Status" error={fieldErrors.availabilityStatus}>
            <select id="availabilityStatus" value={availability} onChange={(event) => setAvailability(event.target.value)}>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="filled">Filled</option>
            </select>
          </FormField>
          <button className="button" type="submit" disabled={pendingAction === 'availability'}>
            {pendingAction === 'availability' ? 'Saving…' : 'Update availability'}
          </button>
        </form>
      ) : null}
      {canSubmit ? (
        <div className="related-section">
          <h2>Review</h2>
          <p>Submit this {item.moderationStatus} opening for an administrator to approve.</p>
          <button className="button" type="button" disabled={pendingAction === 'submit'} onClick={() => run('submit', () => submitOpportunity(item.id))}>
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
            run('moderate', () => moderateOpportunity(item.id, body));
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
          <FormField id="note" label="Note" hint="Optional. Stored with the moderation record, not on the opportunity." error={fieldErrors.note}>
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
              ? 'Administrators can delete an opening that is not referenced by a mentorship request. Archive it when that history must stay.'
              : 'A draft or rejected opening can be deleted while no mentorship request points at it.'}
          </p>
          <button
            className="button button-secondary"
            type="button"
            disabled={pendingAction === 'delete'}
            onClick={() => {
              if (window.confirm('Delete this opportunity?')) {
                run('delete', () => deleteOpportunity(item.id));
              }
            }}
          >
            {pendingAction === 'delete' ? 'Deleting…' : 'Delete opportunity'}
          </button>
        </div>
      ) : null}
    </article>
  );
}
