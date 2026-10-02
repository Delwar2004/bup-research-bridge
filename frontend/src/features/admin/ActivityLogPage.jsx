import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listActivityLogs } from '../../api/admin';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { errorText } from '../opportunities/errors';
import { AdminNav } from './AdminNav';

const ACTIONS = [
  'user.created',
  'user.updated',
  'user.status_changed',
  'user.role_changed',
  'user.profile_updated',
  'opportunity.updated',
  'opportunity.deleted',
  'opportunity.moderated',
  'project.updated',
  'project.deleted',
  'project.moderated',
  'publication.updated',
  'publication.deleted',
  'publication.moderated',
  'research_area.created',
  'research_area.updated',
];

const ENTITY_TYPES = ['users', 'thesis_opportunities', 'research_projects', 'publications', 'research_areas'];

function readFilters(searchParams) {
  return {
    actorUserId: searchParams.get('actorUserId') || '',
    action: searchParams.get('action') || '',
    entityType: searchParams.get('entityType') || '',
    entityId: searchParams.get('entityId') || '',
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '20',
  };
}

function writeFilters(filters, page = '1') {
  const params = new URLSearchParams();
  ['actorUserId', 'action', 'entityType', 'entityId', 'from', 'to'].forEach((key) => {
    if (filters[key]) params.set(key, filters[key]);
  });
  if (filters.pageSize !== '20') params.set('pageSize', filters.pageSize);
  if (page !== '1') params.set('page', page);
  return params;
}

function toApiDate(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function entityHref(entityType, entityId) {
  if (!entityId) return '';
  if (entityType === 'users') return `/admin/users/${entityId}`;
  if (entityType === 'thesis_opportunities') return `/opportunities/${entityId}`;
  if (entityType === 'research_projects') return `/research-projects/${entityId}`;
  if (entityType === 'publications') return `/publications/${entityId}`;
  if (entityType === 'research_areas') return '/admin/research-areas';
  return '';
}

export function ActivityLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const filters = useMemo(() => readFilters(new URLSearchParams(queryKey)), [queryKey]);
  const [draft, setDraft] = useState(filters);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const payload = await listActivityLogs({
          actorUserId: filters.actorUserId || undefined,
          action: filters.action || undefined,
          entityType: filters.entityType || undefined,
          entityId: filters.entityId || undefined,
          from: toApiDate(filters.from),
          to: toApiDate(filters.to),
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
          setError(errorText(err, 'Activity logs could not be loaded.'));
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

  const total = meta?.totalItems ?? 0;
  const knownSize = ['5', '10', '20'].includes(draft.pageSize);

  return (
    <section className="panel">
      <p className="eyebrow">Administrator</p>
      <h1>Activity logs</h1>
      <AdminNav />
      <p>These rows are written by administration actions. The list is newest first.</p>
      <form className="filter-form" onSubmit={(event) => { event.preventDefault(); setSearchParams(writeFilters(draft)); }}>
        <div className="filter-grid">
          <FormField id="log-action" label="Action" hint="Exact action name.">
            <input id="log-action" list="log-actions" value={draft.action} onChange={(event) => update('action', event.target.value)} />
            <datalist id="log-actions">
              {ACTIONS.map((action) => <option key={action} value={action} />)}
            </datalist>
          </FormField>
          <FormField id="log-entity-type" label="Record type" hint="Exact table name.">
            <input id="log-entity-type" list="log-entity-types" value={draft.entityType} onChange={(event) => update('entityType', event.target.value)} />
            <datalist id="log-entity-types">
              {ENTITY_TYPES.map((type) => <option key={type} value={type} />)}
            </datalist>
          </FormField>
          <FormField id="log-actor" label="Actor user id">
            <input id="log-actor" value={draft.actorUserId} onChange={(event) => update('actorUserId', event.target.value)} />
          </FormField>
          <FormField id="log-entity" label="Record id">
            <input id="log-entity" value={draft.entityId} onChange={(event) => update('entityId', event.target.value)} />
          </FormField>
          <FormField id="log-from" label="From">
            <input id="log-from" type="datetime-local" value={draft.from} onChange={(event) => update('from', event.target.value)} />
          </FormField>
          <FormField id="log-to" label="To">
            <input id="log-to" type="datetime-local" value={draft.to} onChange={(event) => update('to', event.target.value)} />
          </FormField>
          <FormField id="log-page-size" label="Per page">
            <select id="log-page-size" value={draft.pageSize} onChange={(event) => update('pageSize', event.target.value)}>
              {knownSize ? null : <option value={draft.pageSize}>{draft.pageSize}</option>}
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </select>
          </FormField>
        </div>
        <div className="button-row">
          <button className="button" type="submit">Apply filters</button>
          <button className="button button-secondary" type="button" onClick={() => setSearchParams(new URLSearchParams())}>Clear filters</button>
        </div>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <LoadingState label="Loading activity logs" /> : null}
      {!loading && !error && items.length === 0 ? <p className="empty-state">No activity logs match these filters.</p> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <p className="result-count" role="status">{total} {total === 1 ? 'log' : 'logs'}</p>
          <div className="card-list">
            {items.map((item) => {
              const href = entityHref(item.entityType, item.entityId);
              const metadata = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
                ? item.metadata
                : null;
              return (
                <article className="record-card" key={item.id}>
                  <h2>{item.action}</h2>
                  {item.summary ? <p className="prose">{item.summary}</p> : null}
                  <p className="person-meta">
                    {item.actorUserId ? <Link to={`/admin/users/${item.actorUserId}`}>{item.actorName || 'Actor'}</Link> : (item.actorName || 'No actor')}
                    {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ''}
                  </p>
                  <p className="person-meta">
                    {item.entityType || 'record'}
                    {item.entityId ? ' · ' : ''}
                    {href ? <Link to={href}>{item.entityId}</Link> : item.entityId}
                  </p>
                  {metadata && Object.keys(metadata).length > 0 ? (
                    <p className="prose person-meta">{JSON.stringify(metadata)}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
          <Pagination page={meta?.page || 1} totalPages={meta?.totalPages || 0} onPage={(page) => setSearchParams(writeFilters(filters, String(page)))} />
        </>
      ) : null}
    </section>
  );
}
