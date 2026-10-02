import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listUsers } from '../../api/admin';
import { listDepartments } from '../../api/reference';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { errorText } from '../opportunities/errors';
import { AdminNav } from './AdminNav';

const ROLES = ['student', 'faculty', 'alumni', 'admin'];
const STATUSES = ['pending', 'active', 'suspended', 'rejected'];
const SORTS = ['createdAt', 'fullName', 'email', 'lastLoginAt'];

function readFilters(searchParams) {
  return {
    q: searchParams.get('q') || '',
    role: searchParams.get('role') || '',
    status: searchParams.get('status') || '',
    departmentId: searchParams.get('departmentId') || '',
    sort: searchParams.get('sort') || 'createdAt',
    order: searchParams.get('order') || 'desc',
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '20',
  };
}

function writeFilters(filters, page = '1') {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  if (filters.departmentId) params.set('departmentId', filters.departmentId);
  if (filters.sort && filters.sort !== 'createdAt') params.set('sort', filters.sort);
  if (filters.order && filters.order !== 'desc') params.set('order', filters.order);
  if (filters.pageSize !== '20') params.set('pageSize', filters.pageSize);
  if (page !== '1') params.set('page', page);
  return params;
}

export function UserListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const filters = useMemo(() => readFilters(new URLSearchParams(queryKey)), [queryKey]);
  const [draft, setDraft] = useState(filters);
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    listDepartments()
      .then((payload) => { if (!cancelled) setDepartments(payload.data || []); })
      .catch(() => { if (!cancelled) setDepartments([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const payload = await listUsers({
          q: filters.q.trim() || undefined,
          role: filters.role || undefined,
          status: filters.status || undefined,
          departmentId: filters.departmentId || undefined,
          sort: filters.sort || undefined,
          order: filters.order || undefined,
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
          setError(errorText(err, 'Accounts could not be loaded.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filters]);

  function update(name, value) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  const total = meta?.totalItems ?? 0;
  const knownSize = ['5', '10', '20'].includes(draft.pageSize);
  const knownSort = SORTS.includes(draft.sort);

  return (
    <section className="panel">
      <p className="eyebrow">Administrator</p>
      <h1>Accounts</h1>
      <AdminNav />
      <p>Search accounts by name or email. There is no account deletion.</p>
      <p><Link className="button" to="/admin/users/new">Create account</Link></p>
      <form className="filter-form" onSubmit={(event) => { event.preventDefault(); setSearchParams(writeFilters(draft)); }}>
        <div className="filter-grid">
          <FormField id="user-q" label="Name or email">
            <input id="user-q" value={draft.q} onChange={(event) => update('q', event.target.value)} />
          </FormField>
          <FormField id="user-role" label="Role">
            <select id="user-role" value={draft.role} onChange={(event) => update('role', event.target.value)}>
              <option value="">Any role</option>
              {ROLES.includes(draft.role) || !draft.role ? null : <option value={draft.role}>{draft.role}</option>}
              {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </FormField>
          <FormField id="user-status" label="Status">
            <select id="user-status" value={draft.status} onChange={(event) => update('status', event.target.value)}>
              <option value="">Any status</option>
              {STATUSES.includes(draft.status) || !draft.status ? null : <option value={draft.status}>{draft.status}</option>}
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </FormField>
          <FormField id="user-department" label="Department">
            <select id="user-department" value={draft.departmentId} onChange={(event) => update('departmentId', event.target.value)}>
              <option value="">Any department</option>
              {draft.departmentId && !departments.some((item) => item.id === draft.departmentId) ? <option value={draft.departmentId}>{draft.departmentId}</option> : null}
              {departments.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
            </select>
          </FormField>
          <FormField id="user-sort" label="Sort">
            <select id="user-sort" value={draft.sort} onChange={(event) => update('sort', event.target.value)}>
              {knownSort ? null : <option value={draft.sort}>{draft.sort}</option>}
              <option value="createdAt">Created</option>
              <option value="fullName">Name</option>
              <option value="email">Email</option>
              <option value="lastLoginAt">Last login</option>
            </select>
          </FormField>
          <FormField id="user-order" label="Order">
            <select id="user-order" value={draft.order} onChange={(event) => update('order', event.target.value)}>
              {draft.order === 'asc' || draft.order === 'desc' ? null : <option value={draft.order}>{draft.order}</option>}
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </FormField>
          <FormField id="user-page-size" label="Per page">
            <select id="user-page-size" value={draft.pageSize} onChange={(event) => update('pageSize', event.target.value)}>
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
      {loading ? <LoadingState label="Loading accounts" /> : null}
      {!loading && !error && items.length === 0 ? <p className="empty-state">No accounts match these filters.</p> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <p className="result-count" role="status">{total} {total === 1 ? 'account' : 'accounts'}</p>
          <div className="card-list">
            {items.map((item) => (
              <article className="record-card" key={item.id}>
                <h2><Link to={`/admin/users/${item.id}`}>{item.fullName}</Link></h2>
                <p className="person-meta">{item.email}</p>
                <p className="person-meta">
                  {item.role} · {item.status}
                  {item.department?.code ? ` · ${item.department.code}` : ''}
                  {item.lastLoginAt ? ` · Last login ${new Date(item.lastLoginAt).toLocaleString()}` : ''}
                </p>
              </article>
            ))}
          </div>
          <Pagination page={meta?.page || 1} totalPages={meta?.totalPages || 0} onPage={(page) => setSearchParams(writeFilters(filters, String(page)))} />
        </>
      ) : null}
    </section>
  );
}
