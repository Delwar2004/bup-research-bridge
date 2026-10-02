import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { listAlumni, listFaculty } from '../../api/people';
import { listProjects } from '../../api/projects';
import { listDepartments, listResearchAreas } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { errorText } from '../opportunities/errors';

const TYPES = [
  { value: '', label: 'Any type' },
  { value: 'thesis', label: 'Thesis' },
  { value: 'research', label: 'Research' },
  { value: 'academic_project', label: 'Academic project' },
];

const MODERATION = ['draft', 'pending', 'approved', 'rejected', 'archived'];
const TYPE_LABELS = {
  thesis: 'Thesis',
  research: 'Research',
  academic_project: 'Academic project',
};

function readFilters(searchParams, { canMine, isAdmin }) {
  const mine = canMine && searchParams.get('mine') === 'true';
  const requestedModeration = searchParams.get('moderationStatus') || '';
  const knownModeration = MODERATION.includes(requestedModeration) ? requestedModeration : '';
  let moderationStatus = '';
  if (mine) moderationStatus = knownModeration;
  else if (isAdmin) moderationStatus = knownModeration || 'approved';
  const sort = searchParams.get('sort');
  return {
    q: searchParams.get('q') || '',
    departmentId: searchParams.get('departmentId') || '',
    projectType: TYPES.some((type) => type.value && type.value === searchParams.get('projectType'))
      ? searchParams.get('projectType')
      : '',
    projectYear: searchParams.get('projectYear') || '',
    yearFrom: searchParams.get('yearFrom') || '',
    yearTo: searchParams.get('yearTo') || '',
    memberUserId: searchParams.get('memberUserId') || '',
    researchAreaIds: searchParams.getAll('researchAreaId'),
    researchAreaMatch: searchParams.get('researchAreaMatch') === 'all' ? 'all' : 'any',
    moderationStatus,
    mine,
    sort: ['projectYear', 'title'].includes(sort) ? sort : 'createdAt',
    order: searchParams.get('order') === 'asc' || searchParams.get('order') === 'desc'
      ? searchParams.get('order')
      : (sort === 'title' ? 'asc' : 'desc'),
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '20',
  };
}

function writeFilters(filters, page = '1', { isAdmin }) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.projectType) params.set('projectType', filters.projectType);
  if (filters.projectYear) params.set('projectYear', filters.projectYear);
  if (filters.yearFrom) params.set('yearFrom', filters.yearFrom);
  if (filters.yearTo) params.set('yearTo', filters.yearTo);
  if (filters.memberUserId) params.set('memberUserId', filters.memberUserId);
  filters.researchAreaIds.forEach((id) => params.append('researchAreaId', id));
  if (filters.researchAreaIds.length && filters.researchAreaMatch === 'all') params.set('researchAreaMatch', 'all');
  if (filters.mine) {
    params.set('mine', 'true');
    if (filters.moderationStatus) params.set('moderationStatus', filters.moderationStatus);
  } else if (isAdmin && filters.moderationStatus && filters.moderationStatus !== 'approved') {
    params.set('moderationStatus', filters.moderationStatus);
  }
  if (filters.sort !== 'createdAt') params.set('sort', filters.sort);
  const defaultOrder = filters.sort === 'title' ? 'asc' : 'desc';
  if (filters.order !== defaultOrder) params.set('order', filters.order);
  if (filters.pageSize !== '20') params.set('pageSize', filters.pageSize);
  if (page !== '1') params.set('page', page);
  return params;
}

function yearOrBlank(value) {
  if (!String(value).trim()) return { ok: true, value: '' };
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return { ok: false };
  return { ok: true, value: String(year) };
}

export function ProjectListPage() {
  const { user } = useSession();
  const location = useLocation();
  const canManage = user?.role === 'faculty' || user?.role === 'alumni' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const filters = useMemo(
    () => readFilters(new URLSearchParams(queryKey), { canMine: canManage, isAdmin }),
    [queryKey, canManage, isAdmin],
  );
  const [draft, setDraft] = useState(filters);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [members, setMembers] = useState([]);
  const [referenceError, setReferenceError] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice] = useState(location.state?.notice || '');

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    async function loadReference() {
      try {
        const [departmentPayload, areaPayload, facultyPayload, alumniPayload] = await Promise.all([
          listDepartments(),
          listResearchAreas(),
          listFaculty({ pageSize: 100, sort: 'fullName', order: 'asc' }),
          listAlumni({ pageSize: 100, sort: 'fullName', order: 'asc' }),
        ]);
        if (cancelled) return;
        setDepartments(departmentPayload.data || []);
        setAreas(areaPayload.data || []);
        const people = [];
        const seen = new Set();
        [...(facultyPayload.data || []), ...(alumniPayload.data || [])].forEach((person) => {
          if (seen.has(person.id)) return;
          seen.add(person.id);
          people.push(person);
        });
        people.sort((left, right) => left.fullName.localeCompare(right.fullName));
        setMembers(people);
        const truncated = (facultyPayload.meta?.totalPages || 1) > 1 || (alumniPayload.meta?.totalPages || 1) > 1;
        if (truncated) {
          setReferenceNote('The member list shows the first 100 faculty profiles and the first 100 alumni profiles.');
        }
      } catch (err) {
        if (!cancelled) setReferenceError(errorText(err, 'Filters could not be loaded.'));
      }
    }
    loadReference();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const payload = await listProjects({
          q: filters.q.trim() || undefined,
          departmentId: filters.departmentId || undefined,
          projectType: filters.projectType || undefined,
          projectYear: filters.projectYear || undefined,
          yearFrom: filters.yearFrom || undefined,
          yearTo: filters.yearTo || undefined,
          memberUserId: filters.memberUserId || undefined,
          researchAreaId: filters.researchAreaIds,
          researchAreaMatch: filters.researchAreaIds.length && filters.researchAreaMatch === 'all' ? 'all' : undefined,
          moderationStatus: filters.moderationStatus || undefined,
          mine: filters.mine ? true : undefined,
          sort: filters.sort,
          order: filters.order,
          page: filters.page,
          pageSize: filters.pageSize,
        });
        if (cancelled) return;
        setItems(payload.data || []);
        setMeta(payload.meta || null);
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setMeta(null);
          setError(errorText(err, 'Research projects could not be loaded.'));
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

  function update(name, value) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function toggleArea(id) {
    setDraft((current) => ({
      ...current,
      researchAreaIds: current.researchAreaIds.includes(id)
        ? current.researchAreaIds.filter((item) => item !== id)
        : [...current.researchAreaIds, id],
    }));
  }

  function onSubmit(event) {
    event.preventDefault();
    if (draft.q.trim().length > 200) {
      setError('Search text must be at most 200 characters.');
      return;
    }
    const projectYear = yearOrBlank(draft.projectYear);
    const yearFrom = yearOrBlank(draft.yearFrom);
    const yearTo = yearOrBlank(draft.yearTo);
    if (!projectYear.ok || !yearFrom.ok || !yearTo.ok) {
      setError('Years must be whole numbers from 1990 through 2100.');
      return;
    }
    if (yearFrom.value && yearTo.value && Number(yearFrom.value) > Number(yearTo.value)) {
      setError('yearFrom must be less than or equal to yearTo.');
      return;
    }
    const next = {
      ...draft,
      projectYear: projectYear.value,
      yearFrom: yearFrom.value,
      yearTo: yearTo.value,
    };
    if (!next.mine && !isAdmin) next.moderationStatus = '';
    if (!next.mine && isAdmin && !next.moderationStatus) next.moderationStatus = 'approved';
    setError('');
    setSearchParams(writeFilters(next, '1', { isAdmin }));
  }

  const showModeration = isAdmin || draft.mine;
  const total = meta?.totalItems ?? 0;

  return (
    <section className="panel">
      <p className="eyebrow">Research projects</p>
      <h1>Previous research repository</h1>
      <p>Approved thesis, research, and academic projects are visible to every signed-in role. A draft stays with its author until an administrator approves it.</p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {referenceError ? <Alert>{referenceError}</Alert> : null}
      {referenceNote ? <p className="field-hint">{referenceNote}</p> : null}
      <div className="button-row">
        {canManage ? <Link className="button" to="/research-projects/new">New project</Link> : null}
        {canManage ? <Link className="button button-secondary" to="/research-projects?mine=true">My projects</Link> : null}
        {isAdmin ? <Link className="button button-secondary" to="/research-projects?moderationStatus=pending">Pending review</Link> : null}
      </div>
      <form className="filter-form" onSubmit={onSubmit}>
        <div className="filter-grid">
          <FormField id="project-q" label="Search" hint="Title or description.">
            <input id="project-q" value={draft.q} onChange={(event) => update('q', event.target.value)} />
          </FormField>
          <FormField id="project-type" label="Type">
            <select id="project-type" value={draft.projectType} onChange={(event) => update('projectType', event.target.value)}>
              {TYPES.map((type) => <option key={type.value || 'any'} value={type.value}>{type.label}</option>)}
            </select>
          </FormField>
          <FormField id="project-department" label="Department">
            <select id="project-department" value={draft.departmentId} onChange={(event) => update('departmentId', event.target.value)}>
              <option value="">Any department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.code} — {department.name}</option>
              ))}
            </select>
          </FormField>
          <FormField id="project-member" label="Member">
            <select id="project-member" value={draft.memberUserId} onChange={(event) => update('memberUserId', event.target.value)}>
              <option value="">Any member</option>
              {draft.memberUserId && !members.some((person) => person.id === draft.memberUserId) ? (
                <option value={draft.memberUserId}>Selected member</option>
              ) : null}
              {members.map((person) => (
                <option key={person.id} value={person.id}>{person.fullName}</option>
              ))}
            </select>
          </FormField>
          <FormField id="project-year" label="Year" hint="Exact year.">
            <input id="project-year" inputMode="numeric" value={draft.projectYear} onChange={(event) => update('projectYear', event.target.value)} />
          </FormField>
          <FormField id="project-year-from" label="Year from">
            <input id="project-year-from" inputMode="numeric" value={draft.yearFrom} onChange={(event) => update('yearFrom', event.target.value)} />
          </FormField>
          <FormField id="project-year-to" label="Year to">
            <input id="project-year-to" inputMode="numeric" value={draft.yearTo} onChange={(event) => update('yearTo', event.target.value)} />
          </FormField>
          {showModeration ? (
            <FormField id="project-moderation" label="Moderation">
              <select id="project-moderation" value={draft.moderationStatus} onChange={(event) => update('moderationStatus', event.target.value)}>
                {draft.mine ? <option value="">Any moderation status</option> : null}
                {MODERATION.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </FormField>
          ) : null}
          <FormField id="project-sort" label="Sort">
            <select id="project-sort" value={draft.sort} onChange={(event) => update('sort', event.target.value)}>
              <option value="createdAt">Newest</option>
              <option value="projectYear">Year</option>
              <option value="title">Title</option>
            </select>
          </FormField>
          <FormField id="project-order" label="Order">
            <select id="project-order" value={draft.order} onChange={(event) => update('order', event.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </FormField>
          <FormField id="project-page-size" label="Per page">
            <select id="project-page-size" value={draft.pageSize} onChange={(event) => update('pageSize', event.target.value)}>
              {['5', '10', '20'].includes(draft.pageSize) ? null : <option value={draft.pageSize}>{draft.pageSize}</option>}
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </FormField>
        </div>
        {canManage ? (
          <div className="field checkbox-field">
            <label htmlFor="project-mine">
              <input
                id="project-mine"
                type="checkbox"
                checked={draft.mine}
                onChange={(event) => update('mine', event.target.checked)}
              />
              Only projects I recorded
            </label>
          </div>
        ) : null}
        <fieldset className="field">
          <legend>Research areas</legend>
          {areas.length === 0 ? <p className="empty-state">No active research areas are available.</p> : (
            <ul className="choice-list">
              {areas.map((area) => (
                <li key={area.id}>
                  <label>
                    <input type="checkbox" checked={draft.researchAreaIds.includes(area.id)} onChange={() => toggleArea(area.id)} />
                    {area.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <FormField id="project-match" label="Area match" hint="Used when at least one area is selected.">
          <select
            id="project-match"
            value={draft.researchAreaMatch}
            onChange={(event) => update('researchAreaMatch', event.target.value)}
            disabled={draft.researchAreaIds.length === 0}
          >
            <option value="any">Any selected area</option>
            <option value="all">Every selected area</option>
          </select>
        </FormField>
        <div className="button-row">
          <button className="button" type="submit">Apply filters</button>
          <button className="button button-secondary" type="button" onClick={() => setSearchParams(new URLSearchParams())}>Clear filters</button>
        </div>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <LoadingState label="Loading research projects" /> : null}
      {!loading && !error && items.length === 0 ? <p className="empty-state">No research projects match these filters.</p> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <p className="result-count" role="status">{total} {total === 1 ? 'project' : 'projects'}</p>
          <div className="card-list">
            {items.map((item) => (
              <article className="record-card" key={item.id}>
                <h2><Link to={`/research-projects/${item.id}`}>{item.title}</Link></h2>
                <p className="person-meta">
                  {TYPE_LABELS[item.projectType] || item.projectType}
                  {' · '}
                  {item.projectYear}
                  {item.department ? ` · ${item.department.code}` : ''}
                  {item.moderationStatus && item.moderationStatus !== 'approved' ? ` · ${item.moderationStatus}` : ''}
                </p>
                {item.members?.length ? (
                  <p className="person-meta">{item.members.map((member) => member.fullName).join(', ')}</p>
                ) : null}
                {item.description ? <p className="clamp">{item.description}</p> : null}
                {item.researchAreas?.length ? (
                  <ul className="tag-list">
                    {item.researchAreas.map((area) => (
                      <li key={area.id}>
                        <Link className="tag" to={`/research-projects?researchAreaId=${encodeURIComponent(area.id)}`}>{area.name}</Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
          <Pagination page={meta?.page || 1} totalPages={meta?.totalPages || 0} onPage={(page) => setSearchParams(writeFilters(filters, String(page), { isAdmin }))} />
        </>
      ) : null}
    </section>
  );
}
