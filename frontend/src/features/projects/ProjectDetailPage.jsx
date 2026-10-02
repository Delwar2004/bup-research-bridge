import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { deleteProject, getProject, moderateProject, submitProject } from '../../api/projects';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';

const TYPE_LABELS = {
  thesis: 'Thesis',
  research: 'Research',
  academic_project: 'Academic project',
};

const ROLE_LABELS = {
  supervisor: 'Supervisor',
  co_supervisor: 'Co-supervisor',
  author: 'Author',
};

function departmentLabel(department) {
  if (!department) return 'No department listed';
  return `${department.code} — ${department.name}`;
}

function httpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

export function ProjectDetailPage() {
  const { projectId } = useParams();
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
      const payload = await getProject(projectId);
      setItem(payload.data);
    } catch (err) {
      setItem(null);
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setError(errorText(err, 'This research project could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  if (loading) return <LoadingState label="Loading research project" />;

  if (missing) {
    return (
      <section className="panel">
        <h1>Research project</h1>
        <p>This research project is not available.</p>
        <Link className="button" to="/research-projects">Back to research projects</Link>
      </section>
    );
  }

  if (error || !item) {
    return (
      <section className="panel">
        <h1>Research project</h1>
        <Alert>{error || 'This research project could not be loaded.'}</Alert>
        <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </section>
    );
  }

  const isCreator = user?.id === item.createdByUserId;
  const isAdmin = user?.role === 'admin';
  const canEdit = isCreator || isAdmin;
  const canSubmit = isCreator && (item.moderationStatus === 'draft' || item.moderationStatus === 'rejected');
  const canDelete = isAdmin || (isCreator && (item.moderationStatus === 'draft' || item.moderationStatus === 'rejected'));
  const link = httpUrl(item.externalLink);

  async function run(action, task) {
    setNotice('');
    setError('');
    setFieldErrors({});
    setPendingAction(action);
    try {
      const payload = await task();
      if (action === 'delete') {
        navigate('/research-projects', { state: { notice: payload.message } });
        return;
      }
      setNotice(payload.message);
      if (payload.data) setItem(payload.data);
      else await load();
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(errorText(err, 'The research project could not be updated.'));
    } finally {
      setPendingAction('');
    }
  }

  return (
    <article className="panel">
      <p className="eyebrow">Research project</p>
      <h1>{item.title}</h1>
      <p><Link to="/research-projects">Back to research projects</Link></p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <dl className="meta-list">
        <div>
          <dt>Type</dt>
          <dd>{TYPE_LABELS[item.projectType] || item.projectType}</dd>
        </div>
        <div>
          <dt>Year</dt>
          <dd>{item.projectYear}</dd>
        </div>
        <div>
          <dt>Moderation</dt>
          <dd>{item.moderationStatus}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{departmentLabel(item.department)}</dd>
        </div>
        {item.opportunityId ? (
          <div>
            <dt>Opportunity</dt>
            <dd><Link to={`/opportunities/${item.opportunityId}`}>View linked opportunity</Link></dd>
          </div>
        ) : null}
        {isCreator ? (
          <div>
            <dt>Recorded by</dt>
            <dd>You recorded this project.</dd>
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
            <dt>Published</dt>
            <dd>{new Date(item.publishedAt).toLocaleString()}</dd>
          </div>
        ) : null}
      </dl>
      <h2>Description</h2>
      {item.description ? <p className="prose">{item.description}</p> : <p className="empty-state">No description is listed.</p>}
      {item.externalLink ? (
        <>
          <h2>External link</h2>
          {link ? <p><a href={link} rel="noopener noreferrer">{link}</a></p> : <p className="prose">{item.externalLink}</p>}
        </>
      ) : null}
      <h2>Research areas</h2>
      {item.researchAreas?.length ? (
        <ul className="tag-list">
          {item.researchAreas.map((area) => (
            <li key={area.id}>
              <Link className="tag" to={`/research-projects?researchAreaId=${encodeURIComponent(area.id)}`}>{area.name}</Link>
            </li>
          ))}
        </ul>
      ) : <p className="empty-state">No research areas are listed.</p>}
      <h2>Members</h2>
      {item.members?.length ? (
        <ul className="record-list">
          {item.members.map((member) => (
            <li key={member.userId}>
              <h3>{member.fullName}</h3>
              <p>{ROLE_LABELS[member.memberRole] || member.memberRole}</p>
            </li>
          ))}
        </ul>
      ) : <p className="empty-state">No members are listed.</p>}
      {canEdit ? (
        <div className="button-row">
          <Link className="button" to={`/research-projects/${item.id}/edit`}>Edit details</Link>
        </div>
      ) : null}
      {canSubmit ? (
        <div className="related-section">
          <h2>Review</h2>
          <p>Submit this {item.moderationStatus} project for an administrator to approve. Approval requires at least one research area and one member.</p>
          <button className="button" type="button" disabled={pendingAction === 'submit'} onClick={() => run('submit', () => submitProject(item.id))}>
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
            run('moderate', () => moderateProject(item.id, body));
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
          <FormField id="note" label="Note" hint="Optional. Stored with the moderation record, not on the project." error={fieldErrors.note}>
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
              ? 'Administrators can delete a project in any status. Archive an approved project when the record should stay.'
              : 'A draft or rejected project can be deleted.'}
          </p>
          <button
            className="button button-secondary"
            type="button"
            disabled={pendingAction === 'delete'}
            onClick={() => {
              if (window.confirm('Delete this research project?')) {
                run('delete', () => deleteProject(item.id));
              }
            }}
          >
            {pendingAction === 'delete' ? 'Deleting…' : 'Delete project'}
          </button>
        </div>
      ) : null}
    </article>
  );
}
