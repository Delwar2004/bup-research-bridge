import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { listOpportunities } from '../../api/opportunities';
import { listFaculty } from '../../api/people';
import { listDepartments, listResearchAreas } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { errorText } from './errors';

const TYPES = [
  { value: '', label: 'Thesis or research' },
  { value: 'thesis', label: 'Thesis' },
  { value: 'research', label: 'Research' },
];

const MODERATION = ['draft', 'pending', 'approved', 'rejected', 'archived'];

function readFilters(searchParams, { canMine, isAdmin }) {
  const mine = canMine && searchParams.get('mine') === 'true';
  const allowAnyAvailability = isAdmin || mine;
  const requestedAvailability = searchParams.get('availabilityStatus');
  return {
    q: searchParams.get('q') || '',
    departmentId: searchParams.get('departmentId') || '',
    facultyUserId: searchParams.get('facultyUserId') || '',
    opportunityType: searchParams.get('opportunityType') || '',
    researchAreaIds: searchParams.getAll('researchAreaId'),
    researchAreaMatch: searchParams.get('researchAreaMatch') === 'all' ? 'all' : 'any',
    availabilityStatus: requestedAvailability || (allowAnyAvailability ? '' : 'open'),
    moderationStatus: (isAdmin || mine) ? (searchParams.get('moderationStatus') || '') : '',
    mine,
    sort: ['deadline', 'title'].includes(searchParams.get('sort')) ? searchParams.get('sort') : 'createdAt',
    order: searchParams.get('order') === 'asc' || searchParams.get('order') === 'desc'
      ? searchParams.get('order')
      : (searchParams.get('sort') === 'title' ? 'asc' : 'desc'),
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '20',
  };
}

function writeFilters(filters, page = '1') {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.facultyUserId) params.set('facultyUserId', filters.facultyUserId);
  if (filters.opportunityType) params.set('opportunityType', filters.opportunityType);
  filters.researchAreaIds.forEach((id) => params.append('researchAreaId', id));
  if (filters.researchAreaIds.length && filters.researchAreaMatch === 'all') params.set('researchAreaMatch', 'all');
  if (filters.availabilityStatus) params.set('availabilityStatus', filters.availabilityStatus);
  if (filters.moderationStatus) params.set('moderationStatus', filters.moderationStatus);
  if (filters.mine) params.set('mine', 'true');
  if (filters.sort !== 'createdAt') params.set('sort', filters.sort);
  const defaultOrder = filters.sort === 'title' ? 'asc' : 'desc';
  if (filters.order !== defaultOrder) params.set('order', filters.order);
  if (filters.pageSize !== '20') params.set('pageSize', filters.pageSize);
  if (page !== '1') params.set('page', page);
  return params;
}

export function OpportunityListPage() {
  const { user } = useSession();
  const location = useLocation();
  const canManage = user?.role === 'faculty' || user?.role === 'admin';
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
  const [faculty, setFaculty] = useState([]);
  const [referenceError, setReferenceError] = useState('');
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
        const [departmentPayload, areaPayload, facultyPayload] = await Promise.all([
          listDepartments(),
          listResearchAreas(),
          listFaculty({ pageSize: 100, sort: 'fullName', order: 'asc' }),
        ]);
        if (cancelled) return;
        setDepartments(departmentPayload.data || []);
        setAreas(areaPayload.data || []);
        setFaculty(facultyPayload.data || []);
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
        const payload = await listOpportunities({
          q: filters.q.trim() || undefined,
          departmentId: filters.departmentId || undefined,
          facultyUserId: filters.facultyUserId || undefined,
          opportunityType: filters.opportunityType || undefined,
          researchAreaId: filters.researchAreaIds,
          researchAreaMatch: filters.researchAreaIds.length && filters.researchAreaMatch === 'all' ? 'all' : undefined,
          availabilityStatus: filters.availabilityStatus || undefined,
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
          setError(errorText(err, 'Opportunities could not be loaded.'));
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
    const next = { ...draft };
    if (!next.mine && !isAdmin) next.moderationStatus = '';
    setSearchParams(writeFilters(next));
  }

  const allowAnyAvailability = isAdmin || draft.mine;
  const showModeration = isAdmin || draft.mine;
  const total = meta?.totalItems ?? 0;

  return (
    <section className="panel">
      <p className="eyebrow">Opportunities</p>
      <h1>Thesis and research openings</h1>
      <p>Approved openings are visible to every signed-in role. A faculty draft stays private until an administrator approves it.</p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {referenceError ? <Alert>{referenceError}</Alert> : null}
      <div className="button-row">
        {canManage ? <Link className="button" to="/opportunities/new">New opportunity</Link> : null}
        {canManage ? <Link className="button button-secondary" to="/opportunities?mine=true">My opportunities</Link> : null}
        {isAdmin ? <Link className="button button-secondary" to="/opportunities?moderationStatus=pending">Pending review</Link> : null}
      </div>
      <form className="filter-form" onSubmit={onSubmit}>
        <div className="filter-grid">
          <FormField id="opportunity-q" label="Search" hint="Title, description, skills, or prerequisites.">
            <input id="opportunity-q" value={draft.q} onChange={(event) => update('q', event.target.value)} />
          </FormField>
          <FormField id="opportunity-type" label="Type">
            <select id="opportunity-type" value={draft.opportunityType} onChange={(event) => update('opportunityType', event.target.value)}>
              {TYPES.map((type) => <option key={type.value || 'any'} value={type.value}>{type.label}</option>)}
            </select>
          </FormField>
          <FormField id="opportunity-department" label="Department">
            <select id="opportunity-department" value={draft.departmentId} onChange={(event) => update('departmentId', event.target.value)}>
              <option value="">Any department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.code} — {department.name}</option>
              ))}
            </select>
          </FormField>
          <FormField id="opportunity-faculty" label="Faculty">
            <select id="opportunity-faculty" value={draft.facultyUserId} onChange={(event) => update('facultyUserId', event.target.value)}>
              <option value="">Any faculty member</option>
              {faculty.map((person) => (
                <option key={person.id} value={person.id}>{person.fullName}</option>
              ))}
            </select>
          </FormField>
          <FormField id="opportunity-availability" label="Availability">
            <select id="opportunity-availability" value={draft.availabilityStatus} onChange={(event) => update('availabilityStatus', event.target.value)}>
              {allowAnyAvailability ? <option value="">Any availability</option> : null}
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="filled">Filled</option>
            </select>
          </FormField>
          {showModeration ? (
            <FormField id="opportunity-moderation" label="Moderation">
              <select id="opportunity-moderation" value={draft.moderationStatus} onChange={(event) => update('moderationStatus', event.target.value)}>
                <option value="">Any moderation status</option>
                {MODERATION.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </FormField>
          ) : null}
          <FormField id="opportunity-sort" label="Sort">
            <select id="opportunity-sort" value={draft.sort} onChange={(event) => update('sort', event.target.value)}>
              <option value="createdAt">Newest</option>
              <option value="deadline">Deadline</option>
              <option value="title">Title</option>
            </select>
          </FormField>
          <FormField id="opportunity-order" label="Order">
            <select id="opportunity-order" value={draft.order} onChange={(event) => update('order', event.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </FormField>
          <FormField id="opportunity-page-size" label="Per page">
            <select id="opportunity-page-size" value={draft.pageSize} onChange={(event) => update('pageSize', event.target.value)}>
              {['5', '10', '20'].includes(draft.pageSize) ? null : <option value={draft.pageSize}>{draft.pageSize}</option>}
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </FormField>
        </div>
        {canManage ? (
          <div className="field checkbox-field">
            <label htmlFor="opportunity-mine">
              <input
                id="opportunity-mine"
                type="checkbox"
                checked={draft.mine}
                onChange={(event) => update('mine', event.target.checked)}
              />
              Only opportunities I own or created
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
        <FormField id="opportunity-match" label="Area match" hint="Used when at least one area is selected.">
          <select
            id="opportunity-match"
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
      {loading ? <LoadingState label="Loading opportunities" /> : null}
      {!loading && !error && items.length === 0 ? <p className="empty-state">No opportunities match these filters.</p> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <p className="result-count" role="status">{total} {total === 1 ? 'opportunity' : 'opportunities'}</p>
          <div className="card-list">
            {items.map((item) => (
              <article className="record-card" key={item.id}>
                <h2><Link to={`/opportunities/${item.id}`}>{item.title}</Link></h2>
                <p className="person-meta">
                  {item.opportunityType}
                  {' · '}
                  {item.availabilityStatus}
                  {item.moderationStatus && item.moderationStatus !== 'approved' ? ` · ${item.moderationStatus}` : ''}
                  {item.deadline ? ` · deadline ${item.deadline}` : ''}
                </p>
                <p className="person-meta">
                  {item.facultyAccountRole === 'faculty'
                    ? <Link to={`/faculty/${item.facultyUserId}`}>{item.facultyName}</Link>
                    : item.facultyName}
                  {item.department ? ` · ${item.department.code}` : ''}
                </p>
                {item.description ? <p className="clamp">{item.description}</p> : null}
                {item.researchAreas?.length ? (
                  <ul className="tag-list">
                    {item.researchAreas.map((area) => (
                      <li key={area.id}>
                        <Link className="tag" to={`/opportunities?researchAreaId=${encodeURIComponent(area.id)}`}>{area.name}</Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
          <Pagination page={meta?.page || 1} totalPages={meta?.totalPages || 0} onPage={(page) => setSearchParams(writeFilters(filters, String(page)))} />
        </>
      ) : null}
    </section>
  );
}
