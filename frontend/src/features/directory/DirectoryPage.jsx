import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { listAlumni, listFaculty } from '../../api/people';
import { listDepartments, listResearchAreas } from '../../api/reference';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { PersonCard } from '../../components/PersonCard';

const CONFIG = {
  faculty: {
    title: 'Faculty',
    noun: 'faculty member',
    plural: 'faculty members',
    list: listFaculty,
    path: '/faculty',
    organization: false,
  },
  alumni: {
    title: 'Alumni',
    noun: 'alumnus',
    plural: 'alumni',
    list: listAlumni,
    path: '/alumni',
    organization: true,
  },
};

function readFilters(searchParams, organization) {
  const pageSize = searchParams.get('pageSize') || '20';
  return {
    q: searchParams.get('q') || '',
    departmentId: searchParams.get('departmentId') || '',
    researchAreaIds: searchParams.getAll('researchAreaId'),
    researchAreaMatch: searchParams.get('researchAreaMatch') === 'all' ? 'all' : 'any',
    mentoringAvailability: searchParams.get('mentoringAvailability') || '',
    organization: organization ? (searchParams.get('organization') || '') : '',
    sort: searchParams.get('sort') === 'updatedAt' ? 'updatedAt' : 'fullName',
    order: searchParams.get('order') === 'desc' ? 'desc' : 'asc',
    page: searchParams.get('page') || '1',
    pageSize,
  };
}

function writeFilters(filters, { organization, page = '1' }) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  filters.researchAreaIds.forEach((id) => params.append('researchAreaId', id));
  if (filters.researchAreaIds.length && filters.researchAreaMatch === 'all') {
    params.set('researchAreaMatch', 'all');
  }
  if (filters.mentoringAvailability === 'true' || filters.mentoringAvailability === 'false') {
    params.set('mentoringAvailability', filters.mentoringAvailability);
  }
  if (organization && filters.organization.trim()) params.set('organization', filters.organization.trim());
  if (filters.sort !== 'fullName') params.set('sort', filters.sort);
  if (filters.order !== 'asc') params.set('order', filters.order);
  if (filters.pageSize !== '20') params.set('pageSize', filters.pageSize);
  if (page !== '1') params.set('page', page);
  return params;
}

export function DirectoryPage({ kind }) {
  const config = CONFIG[kind];
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const filters = useMemo(
    () => readFilters(new URLSearchParams(queryKey), config.organization),
    [queryKey, config.organization],
  );
  const [draft, setDraft] = useState(filters);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [referenceError, setReferenceError] = useState('');
  const [people, setPeople] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    async function loadReference() {
      try {
        const [departmentPayload, areaPayload] = await Promise.all([
          listDepartments(),
          listResearchAreas(),
        ]);
        if (cancelled) return;
        setDepartments(departmentPayload.data || []);
        setAreas(areaPayload.data || []);
      } catch (err) {
        if (!cancelled) {
          setReferenceError(err instanceof ApiError ? err.message : 'Filters could not be loaded.');
        }
      }
    }
    loadReference();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPeople() {
      setLoading(true);
      setError('');
      const params = {
        q: filters.q.trim() || undefined,
        departmentId: filters.departmentId || undefined,
        researchAreaId: filters.researchAreaIds,
        researchAreaMatch: filters.researchAreaIds.length && filters.researchAreaMatch === 'all' ? 'all' : undefined,
        mentoringAvailability: filters.mentoringAvailability || undefined,
        organization: config.organization ? (filters.organization.trim() || undefined) : undefined,
        sort: filters.sort,
        order: filters.order,
        page: filters.page,
        pageSize: filters.pageSize,
      };
      try {
        const payload = await config.list(params);
        if (cancelled) return;
        setPeople(payload.data || []);
        setMeta(payload.meta || null);
      } catch (err) {
        if (!cancelled) {
          setPeople([]);
          setMeta(null);
          const fields = err instanceof ApiError && Array.isArray(err.details?.fields) ? err.details.fields : [];
        const detail = fields.map((item) => item.message).filter(Boolean).join(' ');
        setError(detail || (err instanceof ApiError ? err.message : 'The directory could not be loaded.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadPeople();
    return () => {
      cancelled = true;
    };
  }, [config, filters]);

  function update(name, value) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function toggleArea(id) {
    setDraft((current) => {
      const selected = current.researchAreaIds.includes(id)
        ? current.researchAreaIds.filter((item) => item !== id)
        : [...current.researchAreaIds, id];
      return { ...current, researchAreaIds: selected };
    });
  }

  function onSubmit(event) {
    event.preventDefault();
    if (draft.q.trim().length > 200) {
      setError('Name search must be at most 200 characters.');
      return;
    }
    if (config.organization && draft.organization.trim().length > 200) {
      setError('Organization search must be at most 200 characters.');
      return;
    }
    setSearchParams(writeFilters(draft, { organization: config.organization }));
  }

  function goToPage(page) {
    setSearchParams(writeFilters(filters, { organization: config.organization, page: String(page) }));
  }

  const total = meta?.totalItems ?? 0;
  const areaHref = (id) => `${config.path}?researchAreaId=${encodeURIComponent(id)}`;

  return (
    <section className="panel">
      <p className="eyebrow">Directory</p>
      <h1>{config.title}</h1>
      <p>Browse active {config.plural}. Results use the public profile: name, department, expertise, and mentorship availability.</p>
      {referenceError ? <Alert>{referenceError}</Alert> : null}
      <form className="filter-form" onSubmit={onSubmit}>
        <div className="filter-grid">
          <FormField id={`${kind}-q`} label="Name" hint="Matches the person's name.">
            <input id={`${kind}-q`} value={draft.q} onChange={(event) => update('q', event.target.value)} />
          </FormField>
          <FormField id={`${kind}-department`} label="Department">
            <select id={`${kind}-department`} value={draft.departmentId} onChange={(event) => update('departmentId', event.target.value)}>
              <option value="">Any department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.code} — {department.name}</option>
              ))}
            </select>
          </FormField>
          <FormField id={`${kind}-mentoring`} label="Mentorship">
            <select id={`${kind}-mentoring`} value={draft.mentoringAvailability} onChange={(event) => update('mentoringAvailability', event.target.value)}>
              <option value="">Available or not</option>
              <option value="true">Available</option>
              <option value="false">Not available</option>
            </select>
          </FormField>
          {config.organization ? (
            <FormField id={`${kind}-organization`} label="Organization" hint="Matches the current organization.">
              <input id={`${kind}-organization`} value={draft.organization} onChange={(event) => update('organization', event.target.value)} />
            </FormField>
          ) : null}
          <FormField id={`${kind}-sort`} label="Sort">
            <select id={`${kind}-sort`} value={draft.sort} onChange={(event) => update('sort', event.target.value)}>
              <option value="fullName">Name</option>
              <option value="updatedAt">Recently updated</option>
            </select>
          </FormField>
          <FormField id={`${kind}-order`} label="Order">
            <select id={`${kind}-order`} value={draft.order} onChange={(event) => update('order', event.target.value)}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </FormField>
          <FormField id={`${kind}-page-size`} label="Per page">
            <select id={`${kind}-page-size`} value={draft.pageSize} onChange={(event) => update('pageSize', event.target.value)}>
              {['5', '10', '20'].includes(draft.pageSize) ? null : <option value={draft.pageSize}>{draft.pageSize}</option>}
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </FormField>
        </div>
        <fieldset className="field">
          <legend>Research areas</legend>
          <p className="field-hint" id={`${kind}-areas-hint`}>Leave this empty to include every area.</p>
          {areas.length === 0 ? <p className="empty-state">No active research areas are available.</p> : (
            <ul className="choice-list" aria-describedby={`${kind}-areas-hint`}>
              {areas.map((area) => (
                <li key={area.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.researchAreaIds.includes(area.id)}
                      onChange={() => toggleArea(area.id)}
                    />
                    {area.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <FormField id={`${kind}-match`} label="Area match" hint="Used when at least one area is selected.">
          <select
            id={`${kind}-match`}
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
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setSearchParams(new URLSearchParams())}
          >
            Clear filters
          </button>
        </div>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <LoadingState label={`Loading ${config.plural}`} /> : null}
      {!loading && !error && people.length === 0 ? (
        <p className="empty-state">No {config.plural} match these filters.</p>
      ) : null}
      {!loading && !error && people.length > 0 ? (
        <>
          <p className="result-count" role="status">
            {total} {total === 1 ? config.noun : config.plural}
          </p>
          <div className="card-list">
            {people.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                href={`${config.path}/${person.id}`}
                areaHref={areaHref}
              />
            ))}
          </div>
          <Pagination page={meta?.page || 1} totalPages={meta?.totalPages || 0} onPage={goToPage} />
        </>
      ) : null}
    </section>
  );
}
