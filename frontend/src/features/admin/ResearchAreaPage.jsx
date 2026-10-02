import { useEffect, useState } from 'react';
import { createResearchArea, updateResearchArea } from '../../api/admin';
import { listResearchAreas } from '../../api/reference';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';
import { AdminNav } from './AdminNav';

function AreaEditor({ area, onSaved }) {
  const [name, setName] = useState(area.name || '');
  const [description, setDescription] = useState(area.description || '');
  const [isActive, setIsActive] = useState(area.isActive !== false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, setPending] = useState(false);

  async function save(event) {
    event.preventDefault();
    setError('');
    const body = {};
    if (name.trim() !== area.name) body.name = name.trim();
    const nextDescription = description.trim() || null;
    if (nextDescription !== (area.description ?? null)) body.description = nextDescription;
    if (isActive !== area.isActive) body.isActive = isActive;
    if (!Object.keys(body).length) {
      setError('No research-area changes to save.');
      return;
    }
    setPending(true);
    try {
      const payload = await updateResearchArea(area.id, body);
      onSaved(payload.data);
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(errorText(err, 'The research area could not be updated.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="record-card" onSubmit={save}>
      <h2>{area.name}</h2>
      <p className="person-meta">{area.slug} · {area.isActive ? 'Active' : 'Inactive'}</p>
      {error ? <Alert>{error}</Alert> : null}
      <FormField id={`area-name-${area.id}`} label="Name" error={fieldErrors.name}>
        <input id={`area-name-${area.id}`} value={name} onChange={(event) => setName(event.target.value)} />
      </FormField>
      <FormField id={`area-description-${area.id}`} label="Description" error={fieldErrors.description}>
        <textarea id={`area-description-${area.id}`} rows="3" value={description} onChange={(event) => setDescription(event.target.value)} />
      </FormField>
      <FormField id={`area-active-${area.id}`} label="Available for new links" error={fieldErrors.isActive}>
        <select id={`area-active-${area.id}`} value={isActive ? 'true' : 'false'} onChange={(event) => setIsActive(event.target.value === 'true')}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </FormField>
      <button className="button" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save research area'}</button>
    </form>
  );
}

export function ResearchAreaPage() {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '', description: '', isActive: true });

  async function load() {
    setLoading(true);
    setError('');
    try {
      const payload = await listResearchAreas({ includeInactive: true });
      setAreas(payload.data || []);
    } catch (err) {
      setError(errorText(err, 'Research areas could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function replace(next) {
    setAreas((current) => current.map((item) => (item.id === next.id ? next : item)));
    setNotice(`${next.name} saved.`);
  }

  async function create(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setFieldErrors({});
    const body = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      isActive: form.isActive,
    };
    if (form.description.trim()) body.description = form.description.trim();
    setPending(true);
    try {
      await createResearchArea(body);
      setForm({ slug: '', name: '', description: '', isActive: true });
      setNotice('Research area created.');
      await load();
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(errorText(err, 'The research area could not be created.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Administrator</p>
      <h1>Research areas</h1>
      <AdminNav />
      <p>Add a term or rename it. Deactivate a term instead of deleting it. Inactive terms stay on records that already use them and cannot be newly attached.</p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <form className="related-section" onSubmit={create}>
        <h2>New research area</h2>
        <FormField id="area-slug" label="Slug" hint="Lowercase words separated by hyphens. The slug cannot be changed later." error={fieldErrors.slug}>
          <input id="area-slug" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} />
        </FormField>
        <FormField id="area-name" label="Name" error={fieldErrors.name}>
          <input id="area-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        </FormField>
        <FormField id="area-description" label="Description" error={fieldErrors.description}>
          <textarea id="area-description" rows="3" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </FormField>
        <FormField id="area-active" label="Available for new links">
          <select id="area-active" value={form.isActive ? 'true' : 'false'} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === 'true' }))}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </FormField>
        <button className="button" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create research area'}</button>
      </form>
      {loading ? <LoadingState label="Loading research areas" /> : null}
      {!loading ? (
        <div className="card-list">
          {areas.map((area) => <AreaEditor key={`${area.id}-${area.updatedAt || area.name}`} area={area} onSaved={replace} />)}
        </div>
      ) : null}
    </section>
  );
}
