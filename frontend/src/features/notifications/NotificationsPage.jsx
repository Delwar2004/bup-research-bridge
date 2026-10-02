import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listNotifications, markAllNotificationsRead, updateNotification } from '../../api/notifications';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { errorText } from '../opportunities/errors';

const TYPES = [
  'opportunity_published',
  'mentorship_requested',
  'mentorship_updated',
  'message_received',
  'content_moderated',
  'account_updated',
];

const TYPE_LABELS = {
  opportunity_published: 'Opportunity published',
  mentorship_requested: 'Mentorship requested',
  mentorship_updated: 'Mentorship updated',
  message_received: 'Message received',
  content_moderated: 'Content moderated',
  account_updated: 'Account updated',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readFilters(searchParams) {
  return {
    isRead: searchParams.get('isRead') || '',
    notificationType: searchParams.get('notificationType') || '',
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '20',
  };
}

function writeFilters(filters, page = '1') {
  const params = new URLSearchParams();
  if (filters.isRead) params.set('isRead', filters.isRead);
  if (filters.notificationType) params.set('notificationType', filters.notificationType);
  if (filters.pageSize !== '20') params.set('pageSize', filters.pageSize);
  if (page !== '1') params.set('page', page);
  return params;
}

function relatedLinks(item) {
  const links = [];
  const seen = new Set();
  function add(to, label) {
    if (!to || seen.has(to)) return;
    seen.add(to);
    links.push({ to, label });
  }
  if (typeof item.mentorshipRequestId === 'string' && UUID.test(item.mentorshipRequestId)) {
    add(`/mentorship/${item.mentorshipRequestId}`, 'Open mentorship');
  }
  if (typeof item.opportunityId === 'string' && UUID.test(item.opportunityId)) {
    add(`/opportunities/${item.opportunityId}`, 'Open opportunity');
  }
  const payload = item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
    ? item.payload
    : null;
  const entityId = payload?.entityId;
  if (typeof entityId === 'string' && UUID.test(entityId)) {
    if (payload.entityType === 'research_projects') add(`/research-projects/${entityId}`, 'Open project');
    if (payload.entityType === 'publications') add(`/publications/${entityId}`, 'Open publication');
    if (payload.entityType === 'thesis_opportunities') add(`/opportunities/${entityId}`, 'Open opportunity');
  }
  return links;
}

function typeLabel(value) {
  return TYPE_LABELS[value] || value || 'Notification';
}

export function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const filters = useMemo(() => readFilters(new URLSearchParams(queryKey)), [queryKey]);
  const [draft, setDraft] = useState(filters);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [busyAll, setBusyAll] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const payload = await listNotifications({
          isRead: filters.isRead || undefined,
          notificationType: filters.notificationType || undefined,
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
          setError(errorText(err, 'Notifications could not be loaded.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters, reloadKey]);

  function update(name, value) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function changed() {
    window.dispatchEvent(new Event('notifications-changed'));
    setReloadKey((value) => value + 1);
  }

  async function setRead(item, isRead) {
    setActionError('');
    setBusyId(item.id);
    try {
      await updateNotification(item.id, isRead);
      changed();
    } catch (err) {
      setActionError(errorText(err, 'The notification could not be updated.'));
    } finally {
      setBusyId('');
    }
  }

  async function markAll() {
    setActionError('');
    setBusyAll(true);
    try {
      await markAllNotificationsRead();
      changed();
    } catch (err) {
      setActionError(errorText(err, 'Notifications could not be marked as read.'));
    } finally {
      setBusyAll(false);
    }
  }

  const total = meta?.totalItems ?? 0;
  const knownType = TYPES.includes(draft.notificationType);
  const knownRead = draft.isRead === '' || draft.isRead === 'true' || draft.isRead === 'false';
  const knownSize = ['5', '10', '20'].includes(draft.pageSize);

  return (
    <section className="panel">
      <p className="eyebrow">Notifications</p>
      <h1>Notifications</h1>
      <p>These are the notices sent to your account. Marking one read or unread is saved on the server.</p>
      <form className="filter-form" onSubmit={(event) => { event.preventDefault(); setSearchParams(writeFilters(draft)); }}>
        <div className="filter-grid">
          <FormField id="notification-read" label="Read state">
            <select id="notification-read" value={draft.isRead} onChange={(event) => update('isRead', event.target.value)}>
              <option value="">Any</option>
              {knownRead ? null : <option value={draft.isRead}>{draft.isRead}</option>}
              <option value="false">Unread</option>
              <option value="true">Read</option>
            </select>
          </FormField>
          <FormField id="notification-type" label="Type">
            <select id="notification-type" value={draft.notificationType} onChange={(event) => update('notificationType', event.target.value)}>
              <option value="">Any type</option>
              {knownType || !draft.notificationType ? null : <option value={draft.notificationType}>{draft.notificationType}</option>}
              {TYPES.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
            </select>
          </FormField>
          <FormField id="notification-page-size" label="Per page">
            <select id="notification-page-size" value={draft.pageSize} onChange={(event) => update('pageSize', event.target.value)}>
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
          <button className="button button-secondary" type="button" disabled={busyAll} onClick={markAll}>
            {busyAll ? 'Marking all read' : 'Mark all read'}
          </button>
        </div>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {actionError ? <Alert>{actionError}</Alert> : null}
      {loading ? <LoadingState label="Loading notifications" /> : null}
      {!loading && !error && items.length === 0 ? <p className="empty-state">No notifications match these filters.</p> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <p className="result-count" role="status">{total} {total === 1 ? 'notification' : 'notifications'}</p>
          <div className="card-list">
            {items.map((item) => {
              const links = relatedLinks(item);
              return (
                <article className={item.isRead ? 'record-card notification-item' : 'record-card notification-item unread'} key={item.id}>
                  <h2>{typeLabel(item.notificationType)}</h2>
                  <p className="prose">{item.message}</p>
                  <p className="person-meta">
                    {item.isRead ? 'Read' : 'Unread'}
                    {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ''}
                    {item.isRead && item.readAt ? ` · Read ${new Date(item.readAt).toLocaleString()}` : ''}
                  </p>
                  {links.length > 0 ? (
                    <p className="person-meta">
                      {links.map((link, index) => (
                        <span key={link.to}>
                          {index > 0 ? ' · ' : ''}
                          <Link to={link.to}>{link.label}</Link>
                        </span>
                      ))}
                    </p>
                  ) : null}
                  <div className="button-row">
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setRead(item, !item.isRead)}
                    >
                      {item.isRead ? 'Mark unread' : 'Mark read'}
                    </button>
                  </div>
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
