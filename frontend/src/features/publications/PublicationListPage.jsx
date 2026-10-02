import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { listAlumni, listFaculty } from '../../api/people';
import { listPublications } from '../../api/publications';
import { listResearchAreas } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { errorText } from '../opportunities/errors';

const MODERATION = ['draft', 'pending', 'approved', 'rejected', 'archived'];

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
    venue: searchParams.get('venue') || '',
    authorUserId: searchParams.get('authorUserId') || '',
    yearFrom: searchParams.get('yearFrom') || '',
    yearTo: searchParams.get('yearTo') || '',
    researchAreaIds: searchParams.getAll('researchAreaId'),
    researchAreaMatch: searchParams.get('researchAreaMatch') === 'all' ? 'all' : 'any',
    moderationStatus,
    mine,
    sort: ['publicationYear', 'title'].includes(sort) ? sort : 'createdAt',
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
  if (filters.venue.trim()) params.set('venue', filters.venue.trim());
  if (filters.authorUserId) params.set('authorUserId', filters.authorUserId);
  if (filters.yearFrom) params.set('yearFrom', filters.yearFrom);
  if (filters.yearTo) params.set('yearTo', filters.yearTo);
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
  if (!Number.isInteger(year) || year < 1950 || year > 2100) return { ok: false };
  return { ok: true, value: String(year) };
}

function authorNames(authors) {
  return [...(authors || [])]
    .sort((left, right) => left.authorOrder - right.authorOrder)
    .map((author) => author.fullName)
    .join(', ');
}

export function PublicationListPage() {
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
  const [areas, setAreas] = useState([]);
  const [authors, setAuthors] = useState([]);
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
        const [areaPayload, facultyPayload, alumniPayload] = await Promise.all([
          listResearchAreas(),
          listFaculty({ pageSize: 100, sort: 'fullName', order: 'asc' }),
          listAlumni({ pageSize: 100, sort: 'fullName', order: 'asc' }),
        ]);
        if (cancelled) return;
        setAreas(areaPayload.data || []);
        const people = [];
        const seen = new Set();
        [...(facultyPayload.data || []), ...(alumniPayload.data || [])].forEach((person) => {
          if (seen.has(person.id)) return;
          seen.add(person.id);
          people.push(person);
        });
        people.sort((left, right) => left.fullName.localeCompare(right.fullName));
        setAuthors(people);
        if ((facultyPayload.meta?.totalPages || 1) > 1 || (alumniPayload.meta?.totalPages || 1) > 1) {
          setReferenceNote('The author list shows the first 100 faculty profiles and the first 100 alumni profiles.');
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
        const payload = await listPublications({
          q: filters.q.trim() || undefined,
          venue: filters.venue.trim() || undefined,
          authorUserId: filters.authorUserId || undefined,
          yearFrom: filters.yearFrom || undefined,
          yearTo: filters.yearTo || undefined,
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
          setError(errorText(err, 'Publications could not be loaded.'));
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
    if (draft.venue.trim().length > 300) {
      setError('Venue text must be at most 300 characters.');
      return;
    }
    const yearFrom = yearOrBlank(draft.yearFrom);
    const yearTo = yearOrBlank(draft.yearTo);
    if (!yearFrom.ok || !yearTo.ok) {
      setError('Years must be whole numbers from 1950 through 2100.');
      return;
    }
    if (yearFrom.value && yearTo.value && Number(yearFrom.value) > Number(yearTo.value)) {
      setError('yearFrom must be less than or equal to yearTo.');
      return;
    }
    const next = { ...draft, yearFrom: yearFrom.value, yearTo: yearTo.value };
    if (!next.mine && !isAdmin) next.moderationStatus = '';
    if (!next.mine && isAdmin && !next.moderationStatus) next.moderationStatus = 'approved';
    setError('');
    setSearchParams(writeFilters(next, '1', { isAdmin }));
  }

  const showModeration = isAdmin || draft.mine;
  const total = meta?.totalItems ?? 0;

  return (
    <section className="panel">
      <p className="eyebrow">Publications</p>
      <h1>Publication records</h1>
      <p>Approved publication records are visible to every signed-in role. A draft stays with the person who recorded it until an administrator approves it. These records are metadata, not uploaded files.</p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {referenceError ? <Alert>{referenceError}</Alert> : null}
      {referenceNote ? <p className="field-hint">{referenceNote}</p> : null}
      <div className="button-row">
        {canManage ? <Link className="button" to="/publications/new">New publication</Link> : null}
        {canManage ? <Link className="button button-secondary" to="/publications?mine=true">My publications</Link> : null}
        {isAdmin ? <Link className="button button-secondary" to="/publications?moderationStatus=pending">Pending review</Link> : null}
      </div>
      <form className="filter-form" onSubmit={onSubmit}>
        <div className="filter-grid">
          <FormField id="publication-q" label="Search" hint="Title, abstract, or venue.">
            <input id="publication-q" value={draft.q} onChange={(event) => update('q', event.target.value)} />
          </FormField>
          <FormField id="publication-venue" label="Venue" hint="Matches part of the venue name.">
            <input id="publication-venue" value={draft.venue} onChange={(event) => update('venue', event.target.value)} />
          </FormField>
          <FormField id="publication-author" label="Author">
            <select id="publication-author" value={draft.authorUserId} onChange={(event) => update('authorUserId', event.target.value)}>
              <option value="">Any author</option>
              {draft.authorUserId && !authors.some((person) => person.id === draft.authorUserId) ? (
                <option value={draft.authorUserId}>Selected author</option>
              ) : null}
              {authors.map((person) => (
                <option key={person.id} value={person.id}>{person.fullName}</option>
              ))}
            </select>
          </FormField>
          <FormField id="publication-year-from" label="Year from">
            <input id="publication-year-from" inputMode="numeric" value={draft.yearFrom} onChange={(event) => update('yearFrom', event.target.value)} />
          </FormField>
          <FormField id="publication-year-to" label="Year to">
            <input id="publication-year-to" inputMode="numeric" value={draft.yearTo} onChange={(event) => update('yearTo', event.target.value)} />
          </FormField>
          {showModeration ? (
            <FormField id="publication-moderation" label="Moderation">
              <select id="publication-moderation" value={draft.moderationStatus} onChange={(event) => update('moderationStatus', event.target.value)}>
                {draft.mine ? <option value="">Any moderation status</option> : null}
                {MODERATION.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </FormField>
          ) : null}
          <FormField id="publication-sort" label="Sort">
            <select id="publication-sort" value={draft.sort} onChange={(event) => update('sort', event.target.value)}>
              <option value="createdAt">Newest</option>
              <option value="publicationYear">Year</option>
              <option value="title">Title</option>
            </select>
          </FormField>
          <FormField id="publication-order" label="Order">
            <select id="publication-order" value={draft.order} onChange={(event) => update('order', event.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </FormField>
          <FormField id="publication-page-size" label="Per page">
            <select id="publication-page-size" value={draft.pageSize} onChange={(event) => update('pageSize', event.target.value)}>
              {['5', '10', '20'].includes(draft.pageSize) ? null : <option value={draft.pageSize}>{draft.pageSize}</option>}
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </FormField>
        </div>
        {canManage ? (
          <div className="field checkbox-field">
            <label htmlFor="publication-mine">
              <input
                id="publication-mine"
                type="checkbox"
                checked={draft.mine}
                onChange={(event) => update('mine', event.target.checked)}
              />
              Only publications I recorded
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
        <FormField id="publication-match" label="Area match" hint="Used when at least one area is selected.">
          <select
            id="publication-match"
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
      {loading ? <LoadingState label="Loading publications" /> : null}
      {!loading && !error && items.length === 0 ? <p className="empty-state">No publications match these filters.</p> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <p className="result-count" role="status">{total} {total === 1 ? 'publication' : 'publications'}</p>
          <div className="card-list">
            {items.map((item) => (
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
                      <li key={area.id}>
                        <Link className="tag" to={`/publications?researchAreaId=${encodeURIComponent(area.id)}`}>{area.name}</Link>
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
