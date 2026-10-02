import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listDepartments, listResearchAreas } from '../../api/reference';
import { searchContent } from '../../api/search';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { PersonCard } from '../../components/PersonCard';
import { errorText } from '../opportunities/errors';

const TYPES = [
  { value: 'opportunities', label: 'Opportunities' },
  { value: 'research_projects', label: 'Research projects' },
  { value: 'publications', label: 'Publications' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'alumni', label: 'Alumni' },
];

function readFilters(searchParams) {
  const type = searchParams.get('type') || '';
  return {
    q: searchParams.get('q') || '',
    type,
    departmentId: type === 'publications' ? '' : (searchParams.get('departmentId') || ''),
    researchAreaIds: searchParams.getAll('researchAreaId'),
    researchAreaMatch: searchParams.get('researchAreaMatch') === 'all' ? 'all' : 'any',
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '20',
  };
}

function writeFilters(filters, page = '1') {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.type) params.set('type', filters.type);
  if (filters.type !== 'publications' && filters.departmentId) params.set('departmentId', filters.departmentId);
  filters.researchAreaIds.forEach((id) => params.append('researchAreaId', id));
  if (filters.researchAreaIds.length && filters.researchAreaMatch === 'all') params.set('researchAreaMatch', 'all');
  if (filters.pageSize !== '20') params.set('pageSize', filters.pageSize);
  if (page !== '1') params.set('page', page);
  return params;
}

function areaSearchHref(filters, areaId) {
  const params = writeFilters({ ...filters, researchAreaIds: [areaId], researchAreaMatch: 'any' });
  return `/search?${params.toString()}`;
}

function authorNames(authors) {
  return [...(authors || [])]
    .sort((left, right) => left.authorOrder - right.authorOrder)
    .map((author) => author.fullName)
    .join(', ');
}

function ResultList({ type, items, filters }) {
  if (type === 'faculty' || type === 'alumni') {
    const base = type === 'faculty' ? '/faculty' : '/alumni';
    return (
      <div className="card-list">
        {items.map((item) => (
          <PersonCard
            key={item.id}
            person={item}
            href={`${base}/${item.id}`}
            areaHref={(areaId) => areaSearchHref(filters, areaId)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="card-list">
      {items.map((item) => {
        if (type === 'opportunities') {
          const facultyHref = item.facultyAccountRole === 'faculty'
            ? `/faculty/${item.facultyUserId}`
            : item.facultyAccountRole === 'alumni'
              ? `/alumni/${item.facultyUserId}`
              : '';
          return (
            <article className="record-card" key={item.id}>
              <h2><Link to={`/opportunities/${item.id}`}>{item.title}</Link></h2>
              <p className="person-meta">
                {item.opportunityType}
                {' · '}
                {item.availabilityStatus}
                {item.moderationStatus && item.moderationStatus !== 'approved' ? ` · ${item.moderationStatus}` : ''}
              </p>
              <p className="person-meta">
                {facultyHref ? <Link to={facultyHref}>{item.facultyName}</Link> : item.facultyName}
                {item.department ? ` · ${item.department.code}` : ''}
              </p>
              {item.description ? <p className="clamp">{item.description}</p> : null}
              {item.researchAreas?.length ? (
                <ul className="tag-list">
                  {item.researchAreas.map((area) => (
                    <li key={area.id}><Link className="tag" to={areaSearchHref(filters, area.id)}>{area.name}</Link></li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        }
        if (type === 'research_projects') {
          return (
            <article className="record-card" key={item.id}>
              <h2><Link to={`/research-projects/${item.id}`}>{item.title}</Link></h2>
              <p className="person-meta">
                {item.projectType}
                {' · '}
                {item.projectYear}
                {item.department ? ` · ${item.department.code}` : ''}
                {item.moderationStatus && item.moderationStatus !== 'approved' ? ` · ${item.moderationStatus}` : ''}
              </p>
              {item.members?.length ? <p className="person-meta">{item.members.map((member) => member.fullName).join(', ')}</p> : null}
              {item.description ? <p className="clamp">{item.description}</p> : null}
              {item.researchAreas?.length ? (
                <ul className="tag-list">
                  {item.researchAreas.map((area) => (
                    <li key={area.id}><Link className="tag" to={areaSearchHref(filters, area.id)}>{area.name}</Link></li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        }
        return (
          <article className="record-card" key={item.id}>
            <h2><Link to={`/publications/${item.id}`}>{item.title}</Link></h2>
            <p className="person-meta">
              {[item.publicationYear, item.venue].filter(Boolean).join(' · ') || 'No year or venue listed'}
              {item.moderationStatus && item.moderationStatus !== 'approved' ? ` · ${item.moderationStatus}` : ''}
            </p>
            {item.authors?.length ? <p className="person-meta">{authorNames(item.authors)}</p> : null}
            {item.abstract ? <p className="clamp">{item.abstract}</p> : null}
            {item.researchAreas?.length ? (
              <ul className="tag-list">
                {item.researchAreas.map((area) => (
                  <li key={area.id}><Link className="tag" to={areaSearchHref(filters, area.id)}>{area.name}</Link></li>
                ))}
              </ul>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const filters = useMemo(() => readFilters(new URLSearchParams(queryKey)), [queryKey]);
  const [draft, setDraft] = useState(filters);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [referenceError, setReferenceError] = useState('');
  const [items, setItems] = useState([]);
  const [resultType, setResultType] = useState('');
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canSearch = Boolean(filters.q.trim() && filters.type);

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
        if (!cancelled) setReferenceError(errorText(err, 'Filters could not be loaded.'));
      }
    }
    loadReference();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canSearch) {
      setItems([]);
      setMeta(null);
      setResultType('');
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const payload = await searchContent({
          q: filters.q.trim(),
          type: filters.type,
          departmentId: filters.type === 'publications' ? undefined : (filters.departmentId || undefined),
          researchAreaId: filters.researchAreaIds,
          researchAreaMatch: filters.researchAreaIds.length && filters.researchAreaMatch === 'all' ? 'all' : undefined,
          page: filters.page,
          pageSize: filters.pageSize,
        });
        if (cancelled) return;
        setResultType(payload.data?.type || filters.type);
        setItems(payload.data?.items || []);
        setMeta(payload.meta || null);
      } catch (err) {
        if (!cancelled) {
          setItems([]);
          setMeta(null);
          setResultType('');
          setError(errorText(err, 'Search could not be completed.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [canSearch, filters]);

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
    if (!draft.q.trim()) {
      setError('A search query is required.');
      return;
    }
    if (draft.q.trim().length > 200) {
      setError('Search text must be at most 200 characters.');
      return;
    }
    if (!draft.type) {
      setError('Choose what to search.');
      return;
    }
    const next = { ...draft };
    if (next.type === 'publications') next.departmentId = '';
    setError('');
    setSearchParams(writeFilters(next));
  }

  const showDepartment = draft.type !== 'publications';
  const total = meta?.totalItems ?? 0;
  const noun = total === 1 ? 'result' : 'results';

  return (
    <section className="panel">
      <p className="eyebrow">Search</p>
      <h1>Research content</h1>
      <p>Search one kind of content at a time. Faculty and alumni match a name. Opportunities, projects, and publications match their text. Catalog filters for year, venue, and availability stay on those pages.</p>
      {referenceError ? <Alert>{referenceError}</Alert> : null}
      <form className="filter-form" onSubmit={onSubmit}>
        <div className="filter-grid">
          <FormField id="search-q" label="Keyword" hint="Required. At most 200 characters.">
            <input id="search-q" value={draft.q} onChange={(event) => update('q', event.target.value)} />
          </FormField>
          <FormField id="search-type" label="Search in">
            <select id="search-type" value={draft.type} onChange={(event) => update('type', event.target.value)}>
              <option value="">Choose a type</option>
              {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </FormField>
          {showDepartment ? (
            <FormField id="search-department" label="Department">
              <select id="search-department" value={draft.departmentId} onChange={(event) => update('departmentId', event.target.value)}>
                <option value="">Any department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.code} — {department.name}</option>
                ))}
              </select>
            </FormField>
          ) : null}
          <FormField id="search-page-size" label="Per page">
            <select id="search-page-size" value={draft.pageSize} onChange={(event) => update('pageSize', event.target.value)}>
              {['5', '10', '20'].includes(draft.pageSize) ? null : <option value={draft.pageSize}>{draft.pageSize}</option>}
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </FormField>
        </div>
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
        <FormField id="search-match" label="Area match" hint="Used when at least one area is selected.">
          <select
            id="search-match"
            value={draft.researchAreaMatch}
            onChange={(event) => update('researchAreaMatch', event.target.value)}
            disabled={draft.researchAreaIds.length === 0}
          >
            <option value="any">Any selected area</option>
            <option value="all">Every selected area</option>
          </select>
        </FormField>
        <div className="button-row">
          <button className="button" type="submit">Search</button>
          <button className="button button-secondary" type="button" onClick={() => setSearchParams(new URLSearchParams())}>Clear</button>
        </div>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {!canSearch && !error ? <p className="empty-state">Enter a keyword and choose what to search.</p> : null}
      {loading ? <LoadingState label="Searching" /> : null}
      {!loading && canSearch && !error && items.length === 0 ? <p className="empty-state">No results match this search.</p> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <p className="result-count" role="status">{total} {noun}</p>
          <ResultList type={resultType} items={items} filters={filters} />
          <Pagination
            page={meta?.page || 1}
            totalPages={meta?.totalPages || 0}
            onPage={(page) => setSearchParams(writeFilters(filters, String(page)))}
          />
        </>
      ) : null}
    </section>
  );
}
