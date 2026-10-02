import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listMentorshipRequests } from '../../api/mentorship';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { errorText } from '../opportunities/errors';

const STATUSES = ['pending', 'accepted', 'rejected', 'cancelled', 'completed'];

function readFilters(searchParams) {
  const status = searchParams.get('status') || '';
  const role = searchParams.get('role') || '';
  const sort = searchParams.get('sort');
  return {
    status: STATUSES.includes(status) ? status : '',
    role: role === 'student' || role === 'mentor' ? role : '',
    sort: sort === 'updatedAt' ? 'updatedAt' : 'createdAt',
    order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '20',
  };
}

function writeFilters(filters, page = '1') {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.role) params.set('role', filters.role);
  if (filters.sort !== 'createdAt') params.set('sort', filters.sort);
  if (filters.order !== 'desc') params.set('order', filters.order);
  if (filters.pageSize !== '20') params.set('pageSize', filters.pageSize);
  if (page !== '1') params.set('page', page);
  return params;
}

function otherParty(item, userId) {
  if (userId && userId === item.studentUserId) {
    return { label: 'Mentor', name: item.mentorName, role: item.mentorRole };
  }
  return { label: 'Student', name: item.studentName, role: 'student' };
}

export function MentorshipListPage() {
  const { user } = useSession();
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
        const payload = await listMentorshipRequests({
          status: filters.status || undefined,
          role: filters.role || undefined,
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
          setError(errorText(err, 'Mentorship requests could not be loaded.'));
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

  return (
    <section className="panel">
      <p className="eyebrow">Mentorship</p>
      <h1>Mentorship requests</h1>
      <p>This list shows requests where you are the student or the mentor. A request starts from a faculty or alumni profile, and it can name an open opportunity.</p>
      {user?.role === 'student' ? (
        <p>Choose a <Link to="/faculty">faculty member</Link> or <Link to="/alumni">alumnus</Link> to ask for mentorship.</p>
      ) : null}
      <form className="filter-form" onSubmit={(event) => { event.preventDefault(); setSearchParams(writeFilters(draft)); }}>
        <div className="filter-grid">
          <FormField id="mentorship-status" label="Status">
            <select id="mentorship-status" value={draft.status} onChange={(event) => update('status', event.target.value)}>
              <option value="">Any status</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </FormField>
          <FormField id="mentorship-role" label="My role">
            <select id="mentorship-role" value={draft.role} onChange={(event) => update('role', event.target.value)}>
              <option value="">Student or mentor</option>
              <option value="student">Requests I sent</option>
              <option value="mentor">Requests I received</option>
            </select>
          </FormField>
          <FormField id="mentorship-sort" label="Sort">
            <select id="mentorship-sort" value={draft.sort} onChange={(event) => update('sort', event.target.value)}>
              <option value="createdAt">Created</option>
              <option value="updatedAt">Updated</option>
            </select>
          </FormField>
          <FormField id="mentorship-order" label="Order">
            <select id="mentorship-order" value={draft.order} onChange={(event) => update('order', event.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </FormField>
          <FormField id="mentorship-page-size" label="Per page">
            <select id="mentorship-page-size" value={draft.pageSize} onChange={(event) => update('pageSize', event.target.value)}>
              {['5', '10', '20'].includes(draft.pageSize) ? null : <option value={draft.pageSize}>{draft.pageSize}</option>}
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
      {loading ? <LoadingState label="Loading mentorship requests" /> : null}
      {!loading && !error && items.length === 0 ? <p className="empty-state">No mentorship requests match these filters.</p> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <p className="result-count" role="status">{total} {total === 1 ? 'request' : 'requests'}</p>
          <div className="card-list">
            {items.map((item) => {
              const party = otherParty(item, user?.id);
              return (
                <article className="record-card" key={item.id}>
                  <h2><Link to={`/mentorship/${item.id}`}>{item.subject}</Link></h2>
                  <p className="person-meta">{item.status} · {party.label}: {party.name}{party.role ? ` · ${party.role}` : ''}</p>
                  {item.opportunityId && item.opportunityTitle ? (
                    <p className="person-meta">
                      Opportunity: <Link to={`/opportunities/${item.opportunityId}`}>{item.opportunityTitle}</Link>
                    </p>
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
