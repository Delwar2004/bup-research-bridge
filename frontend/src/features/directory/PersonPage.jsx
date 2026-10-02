import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { listPublications } from '../../api/publications';
import { listProjects } from '../../api/projects';
import { listOpportunities } from '../../api/opportunities';
import { listExperiences } from '../../api/experiences';
import { getAlumni, getFaculty } from '../../api/people';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { LoadingState } from '../../components/LoadingState';
import { RelatedSection } from '../../components/RelatedSection';
import { ExperienceSection } from './ExperienceSection';

const CONFIG = {
  faculty: {
    title: 'Faculty profile',
    listPath: '/faculty',
    listLabel: 'Faculty',
    load: getFaculty,
    missing: 'This faculty profile is not available.',
  },
  alumni: {
    title: 'Alumni profile',
    listPath: '/alumni',
    listLabel: 'Alumni',
    load: getAlumni,
    missing: 'This alumni profile is not available.',
  },
};

function departmentLabel(department) {
  if (!department) return 'No department listed';
  return `${department.code} — ${department.name}`;
}

function httpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

function useRelated(loader, enabled) {
  const [state, setState] = useState({ loading: enabled, error: '', items: [], total: 0 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState({ loading: true, error: '', items: [], total: 0 });
    loader()
      .then((payload) => {
        if (cancelled) return;
        const items = payload.data || [];
        setState({
          loading: false,
          error: '',
          items,
          total: payload.meta?.totalItems ?? items.length,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: err instanceof ApiError ? err.message : 'This list could not be loaded.',
          items: [],
          total: 0,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, loader, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}

export function PersonPage({ kind }) {
  const config = CONFIG[kind];
  const { userId } = useParams();
  const { user } = useSession();
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setMissing(false);
    setPerson(null);
    config.load(userId)
      .then((payload) => {
        if (!cancelled) setPerson(payload.data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setMissing(true);
        else setError(err instanceof ApiError ? err.message : 'This profile could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config, userId, attempt]);

  const loadOpportunities = useCallback(
    () => listOpportunities({ facultyUserId: userId, availabilityStatus: 'open', pageSize: 20 }),
    [userId],
  );
  const loadProjects = useCallback(
    () => listProjects({ memberUserId: userId, pageSize: 20 }),
    [userId],
  );
  const loadPublications = useCallback(
    () => listPublications({ authorUserId: userId, pageSize: 20 }),
    [userId],
  );
  const loadExperienceList = useCallback(() => listExperiences(userId), [userId]);

  const ready = Boolean(person);
  const opportunities = useRelated(loadOpportunities, ready && kind === 'faculty');
  const projects = useRelated(loadProjects, ready);
  const publications = useRelated(loadPublications, ready);
  const experiences = useRelated(loadExperienceList, ready && kind === 'alumni');

  if (loading) return <LoadingState label="Loading profile" />;

  if (missing) {
    return (
      <section className="panel">
        <h1>{config.title}</h1>
        <p>{config.missing}</p>
        <Link className="button" to={config.listPath}>Back to {config.listLabel.toLowerCase()}</Link>
      </section>
    );
  }

  if (error || !person) {
    return (
      <section className="panel">
        <h1>{config.title}</h1>
        <Alert>{error || 'This profile could not be loaded.'}</Alert>
        <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </section>
    );
  }

  const photo = httpUrl(person.profilePhotoUrl);
  const areas = person.researchAreas || [];

  return (
    <article className="panel">
      <p className="eyebrow">{config.listLabel}</p>
      <h1>{person.fullName}</h1>
      <p><Link to={config.listPath}>Back to {config.listLabel.toLowerCase()}</Link></p>
      {photo ? <img className="profile-photo" src={photo} alt="" /> : null}
      <dl className="meta-list">
        <div>
          <dt>Department</dt>
          <dd>{departmentLabel(person.department)}</dd>
        </div>
        {person.designation ? (
          <div>
            <dt>Designation</dt>
            <dd>{person.designation}</dd>
          </div>
        ) : null}
        {person.batch ? (
          <div>
            <dt>Batch</dt>
            <dd>{person.batch}</dd>
          </div>
        ) : null}
        {person.currentOrganization ? (
          <div>
            <dt>Organization</dt>
            <dd>{person.currentOrganization}</dd>
          </div>
        ) : null}
        {person.mentoringAvailability !== null && person.mentoringAvailability !== undefined ? (
          <div>
            <dt>Mentorship</dt>
            <dd>{person.mentoringAvailability ? 'Available' : 'Not available'}</dd>
          </div>
        ) : null}
      </dl>
      {user?.id === person.id ? <p><Link to="/profile">Edit your profile</Link></p> : null}
      {user?.role === 'student' && user.id !== person.id ? (
        <p><Link className="button" to={`/mentorship/new?mentorUserId=${person.id}`}>Request mentorship</Link></p>
      ) : null}
      {person.bio ? <p>{person.bio}</p> : <p className="empty-state">No biography is listed.</p>}
      <section className="related-section">
        <h2>Research areas</h2>
        {areas.length === 0 ? <p className="empty-state">No research areas are listed.</p> : (
          <ul className="tag-list">
            {areas.map((area) => (
              <li key={area.id}>
                <Link className="tag" to={`${config.listPath}?researchAreaId=${encodeURIComponent(area.id)}`}>{area.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {kind === 'faculty' ? (
        <RelatedSection
          title="Open opportunities"
          loading={opportunities.loading}
          error={opportunities.error}
          onRetry={opportunities.retry}
          count={opportunities.loading ? undefined : opportunities.total}
          isEmpty={opportunities.items.length === 0}
          empty="No approved open opportunities are listed for this faculty member."
        >
          <ul className="record-list">
            {opportunities.items.map((item) => (
              <li key={item.id}>
                <h3><Link to={`/opportunities/${item.id}`}>{item.title}</Link></h3>
                <p>{item.opportunityType} · {item.availabilityStatus}{item.deadline ? ` · deadline ${item.deadline}` : ''}</p>
              </li>
            ))}
          </ul>
          {opportunities.total > opportunities.items.length ? (
            <p className="field-hint">Showing {opportunities.items.length} of {opportunities.total}.</p>
          ) : null}
        </RelatedSection>
      ) : null}
      <RelatedSection
        title="Research projects"
        loading={projects.loading}
        error={projects.error}
        onRetry={projects.retry}
        count={projects.loading ? undefined : projects.total}
        isEmpty={projects.items.length === 0}
        empty="No approved research projects list this person as a member."
      >
        <ul className="record-list">
          {projects.items.map((item) => (
            <li key={item.id}>
              <h3><Link to={`/research-projects/${item.id}`}>{item.title}</Link></h3>
              <p>{item.projectType} · {item.projectYear}{item.moderationStatus && item.moderationStatus !== 'approved' ? ` · ${item.moderationStatus}` : ''}</p>
            </li>
          ))}
        </ul>
        {projects.total > projects.items.length ? (
          <p className="field-hint">Showing {projects.items.length} of {projects.total}.</p>
        ) : null}
      </RelatedSection>
      <RelatedSection
        title="Publications"
        loading={publications.loading}
        error={publications.error}
        onRetry={publications.retry}
        count={publications.loading ? undefined : publications.total}
        isEmpty={publications.items.length === 0}
        empty="No approved publications list this person as an author."
      >
        <ul className="record-list">
          {publications.items.map((item) => {
            const link = httpUrl(item.url);
            return (
              <li key={item.id}>
                <h3><Link to={`/publications/${item.id}`}>{item.title}</Link></h3>
                <p>
                  {[item.publicationYear, item.venue].filter(Boolean).join(' · ') || 'No year or venue listed'}
                  {item.moderationStatus && item.moderationStatus !== 'approved' ? ` · ${item.moderationStatus}` : ''}
                </p>
                {link ? <p><a href={link}>Publication link</a></p> : null}
              </li>
            );
          })}
        </ul>
        {publications.total > publications.items.length ? (
          <p className="field-hint">Showing {publications.items.length} of {publications.total}.</p>
        ) : null}
      </RelatedSection>
      {kind === 'alumni' ? (
        <ExperienceSection
          loading={experiences.loading}
          error={experiences.error}
          onRetry={experiences.retry}
          total={experiences.total}
          items={experiences.items}
          canManage={user?.role === 'alumni' && user.id === person.id}
        />
      ) : null}
    </article>
  );
}
