import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { listAlumni, listFaculty } from '../../api/people';
import { createPublication, getPublication, updatePublication } from '../../api/publications';
import { listResearchAreas } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';

let authorSeq = 0;

function nextAuthor(partial = {}) {
  authorSeq += 1;
  return {
    key: `author-${authorSeq}`,
    userId: '',
    authorOrder: '',
    fullName: '',
    ...partial,
  };
}

const EMPTY = {
  title: '',
  abstract: '',
  venue: '',
  publicationYear: '',
  doi: '',
  url: '',
  publishedOn: '',
  moderationStatus: 'draft',
  researchAreaIds: [],
  authors: [],
};

function sameIds(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function authorSignature(authors) {
  return [...authors]
    .map((author) => `${author.userId}:${author.authorOrder}`)
    .sort()
    .join('|');
}

function formFromPublication(item) {
  return {
    title: item.title || '',
    abstract: item.abstract || '',
    venue: item.venue || '',
    publicationYear: item.publicationYear == null ? '' : String(item.publicationYear),
    doi: item.doi || '',
    url: item.url || '',
    publishedOn: item.publishedOn || '',
    moderationStatus: item.moderationStatus || 'draft',
    researchAreaIds: (item.researchAreas || []).map((area) => area.id),
    authors: (item.authors || []).map((author) => nextAuthor({
      userId: author.userId,
      authorOrder: String(author.authorOrder),
      fullName: author.fullName,
    })),
  };
}

function yearValue(value) {
  if (!String(value).trim()) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1950 || year > 2100) return undefined;
  return year;
}

function realDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

export function PublicationFormPage({ mode }) {
  const editing = mode === 'edit';
  const { publicationId } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [form, setForm] = useState(EMPTY);
  const [original, setOriginal] = useState(null);
  const [areas, setAreas] = useState([]);
  const [people, setPeople] = useState([]);
  const [directoryNote, setDirectoryNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [missing, setMissing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const [areaPayload, facultyPayload, alumniPayload] = await Promise.all([
          listResearchAreas(),
          listFaculty({ pageSize: 100, sort: 'fullName', order: 'asc' }),
          listAlumni({ pageSize: 100, sort: 'fullName', order: 'asc' }),
        ]);
        if (cancelled) return;
        setAreas(areaPayload.data || []);
        const directory = [];
        const seen = new Set();
        [...(facultyPayload.data || []), ...(alumniPayload.data || [])].forEach((person) => {
          if (seen.has(person.id)) return;
          seen.add(person.id);
          directory.push({ id: person.id, fullName: person.fullName });
        });
        if ((user?.role === 'faculty' || user?.role === 'alumni') && user.id && !seen.has(user.id)) {
          directory.push({ id: user.id, fullName: user.fullName });
        }
        directory.sort((left, right) => left.fullName.localeCompare(right.fullName));
        setPeople(directory);
        const notes = [];
        if ((facultyPayload.meta?.totalPages || 1) > 1 || (alumniPayload.meta?.totalPages || 1) > 1) {
          notes.push('The person list shows the first 100 faculty profiles and the first 100 alumni profiles.');
        }
        notes.push('Students already listed as authors stay selectable. There is no student directory to add a new student author.');
        setDirectoryNote(notes.join(' '));
        if (!editing) return;
        const payload = await getPublication(publicationId);
        if (cancelled) return;
        const item = payload.data;
        if (!isAdmin && user?.id !== item.createdByUserId) {
          setForbidden(true);
          return;
        }
        setOriginal(item);
        setForm(formFromPublication(item));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setMissing(true);
        else setLoadError(errorText(err, 'The form could not be loaded.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [editing, isAdmin, publicationId, user?.id, user?.role, user?.fullName]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggleArea(id) {
    setForm((current) => ({
      ...current,
      researchAreaIds: current.researchAreaIds.includes(id)
        ? current.researchAreaIds.filter((item) => item !== id)
        : [...current.researchAreaIds, id],
    }));
  }

  function updateAuthor(key, name, value) {
    setForm((current) => ({
      ...current,
      authors: current.authors.map((author) => (author.key === key ? { ...author, [name]: value } : author)),
    }));
  }

  function clientErrors() {
    const errors = {};
    if (!form.title.trim() || form.title.trim().length > 500) errors.title = 'Title is required and must be at most 500 characters.';
    if (form.abstract.trim().length > 20000) errors.abstract = 'Abstract must be at most 20000 characters.';
    if (form.venue.trim().length > 300) errors.venue = 'Venue must be at most 300 characters.';
    if (yearValue(form.publicationYear) === undefined) errors.publicationYear = 'Year must be empty or a whole number from 1950 through 2100.';
    if (form.doi.trim().length > 255) errors.doi = 'DOI must be at most 255 characters.';
    if (form.url.length > 2000) errors.url = 'Link must be at most 2000 characters.';
    if (!realDate(form.publishedOn)) errors.publishedOn = 'Use a real date in YYYY-MM-DD form.';
    if (form.researchAreaIds.length > 25) errors.researchAreaIds = 'Select at most 25 research areas.';
    const orders = [];
    const ids = [];
    form.authors.forEach((author) => {
      if (!author.userId) errors.authors = 'Choose a person for every author row, or remove the row.';
      const order = Number(author.authorOrder);
      if (!Number.isInteger(order) || order < 1 || order > 32767) {
        errors.authors = 'Each author order must be a whole number from 1 through 32767.';
      } else orders.push(order);
      if (author.userId) ids.push(author.userId);
    });
    if (new Set(ids).size !== ids.length) errors.authors = 'A person can be listed only once.';
    if (new Set(orders).size !== orders.length) errors.authors = 'Author order must be unique within the publication.';
    const approved = editing && original?.moderationStatus === 'approved';
    if (approved && form.researchAreaIds.length === 0) {
      errors.researchAreaIds = 'An approved publication must keep at least one research area.';
    }
    if (approved && form.authors.length === 0) {
      errors.authors = 'An approved publication must keep at least one author.';
    }
    return errors;
  }

  function buildBody() {
    const authors = form.authors.map((author) => ({
      userId: author.userId,
      authorOrder: Number(author.authorOrder),
    }));
    const link = form.url.length ? form.url : null;
    const year = yearValue(form.publicationYear);
    if (!editing) {
      const body = { title: form.title.trim() };
      if (form.abstract.trim()) body.abstract = form.abstract.trim();
      if (form.venue.trim()) body.venue = form.venue.trim();
      if (year != null) body.publicationYear = year;
      if (form.doi.trim()) body.doi = form.doi.trim();
      if (link) body.url = link;
      if (form.publishedOn) body.publishedOn = form.publishedOn;
      if (form.moderationStatus === 'pending') body.moderationStatus = 'pending';
      if (form.researchAreaIds.length) body.researchAreaIds = form.researchAreaIds;
      if (authors.length) body.authors = authors;
      return body;
    }
    const body = {};
    if (form.title.trim() !== original.title) body.title = form.title.trim();
    if ((form.abstract.trim() || null) !== (original.abstract || null)) body.abstract = form.abstract.trim() || null;
    if ((form.venue.trim() || null) !== (original.venue || null)) body.venue = form.venue.trim() || null;
    if (year !== (original.publicationYear ?? null)) body.publicationYear = year;
    if ((form.doi.trim() || null) !== (original.doi || null)) body.doi = form.doi.trim() || null;
    if (link !== (original.url || null)) body.url = link;
    if ((form.publishedOn || null) !== (original.publishedOn || null)) body.publishedOn = form.publishedOn || null;
    if (!sameIds(form.researchAreaIds, (original.researchAreas || []).map((area) => area.id))) {
      body.researchAreaIds = form.researchAreaIds;
    }
    if (authorSignature(authors) !== authorSignature(original.authors || [])) body.authors = authors;
    return body;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const errors = clientErrors();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    const body = buildBody();
    if (editing && !Object.keys(body).length) {
      setFormError('There are no changes to save.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = editing
        ? await updatePublication(publicationId, body)
        : await createPublication(body);
      navigate(`/publications/${payload.data.id}`, { state: { notice: payload.message } });
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setFormError(errorText(err, 'The publication could not be saved.'));
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label={editing ? 'Loading publication' : 'Loading the form'} />;
  if (missing) {
    return (
      <section className="panel">
        <h1>Edit publication</h1>
        <p>This publication is not available.</p>
        <Link className="button" to="/publications">Back to publications</Link>
      </section>
    );
  }
  if (forbidden) {
    return (
      <section className="panel">
        <h1>Edit publication</h1>
        <Alert>You cannot edit this publication.</Alert>
        <Link className="button" to={`/publications/${publicationId}`}>Back to the publication</Link>
      </section>
    );
  }
  if (loadError) {
    return (
      <section className="panel">
        <h1>{editing ? 'Edit publication' : 'New publication'}</h1>
        <Alert>{loadError}</Alert>
      </section>
    );
  }

  const peopleOptions = [...people];
  form.authors.forEach((author) => {
    if (author.userId && !peopleOptions.some((person) => person.id === author.userId)) {
      peopleOptions.push({ id: author.userId, fullName: author.fullName || 'Listed author' });
    }
  });

  return (
    <section className="panel">
      <p className="eyebrow">Publications</p>
      <h1>{editing ? 'Edit publication' : 'New publication'}</h1>
      <p>
        {editing
          ? 'Moderation is changed from the publication page.'
          : 'A new publication starts as a draft unless you send it for review. Other people see it after an administrator approves it.'}
      </p>
      <p className="field-hint">The API stores publication metadata and an optional link. It does not accept a paper file. An administrator can approve a record only when it has at least one research area and one author.</p>
      {directoryNote ? <p className="field-hint">{directoryNote}</p> : null}
      {formError ? <Alert>{formError}</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField id="title" label="Title" error={fieldErrors.title}>
          <input id="title" value={form.title} onChange={(event) => update('title', event.target.value)} />
        </FormField>
        <FormField id="abstract" label="Abstract" error={fieldErrors.abstract}>
          <textarea id="abstract" rows="6" value={form.abstract} onChange={(event) => update('abstract', event.target.value)} />
        </FormField>
        <FormField id="venue" label="Venue" error={fieldErrors.venue}>
          <input id="venue" value={form.venue} onChange={(event) => update('venue', event.target.value)} />
        </FormField>
        <FormField id="publicationYear" label="Year" error={fieldErrors.publicationYear}>
          <input id="publicationYear" inputMode="numeric" value={form.publicationYear} onChange={(event) => update('publicationYear', event.target.value)} />
        </FormField>
        <FormField id="publishedOn" label="Published on" error={fieldErrors.publishedOn}>
          <input id="publishedOn" type="date" value={form.publishedOn} onChange={(event) => update('publishedOn', event.target.value)} />
        </FormField>
        <FormField id="doi" label="DOI" error={fieldErrors.doi}>
          <input id="doi" value={form.doi} onChange={(event) => update('doi', event.target.value)} />
        </FormField>
        <FormField id="url" label="Link" hint="Optional. Shown as a link when it starts with http:// or https://." error={fieldErrors.url}>
          <input id="url" value={form.url} onChange={(event) => update('url', event.target.value)} />
        </FormField>
        {!editing ? (
          <FormField id="moderationStatus" label="Moderation" hint="Approved, rejected, and archived are set by an administrator." error={fieldErrors.moderationStatus}>
            <select id="moderationStatus" value={form.moderationStatus} onChange={(event) => update('moderationStatus', event.target.value)}>
              <option value="draft">Draft</option>
              <option value="pending">Submit for review</option>
            </select>
          </FormField>
        ) : null}
        <fieldset className="field">
          <legend>Research areas</legend>
          {areas.length === 0 ? <p className="empty-state">No active research areas are available.</p> : (
            <ul className="choice-list">
              {areas.map((area) => (
                <li key={area.id}>
                  <label>
                    <input type="checkbox" checked={form.researchAreaIds.includes(area.id)} onChange={() => toggleArea(area.id)} />
                    {area.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {fieldErrors.researchAreaIds ? <p className="field-error">{fieldErrors.researchAreaIds}</p> : null}
        </fieldset>
        <fieldset className="field">
          <legend>Authors</legend>
          <p className="field-hint">Faculty and alumni profiles can be added. A person and an author order can each appear once.</p>
          {form.authors.map((author) => (
            <div className="member-row" key={author.key}>
              <div className="field">
                <label htmlFor={`${author.key}-user`}>Person</label>
                <select id={`${author.key}-user`} value={author.userId} onChange={(event) => updateAuthor(author.key, 'userId', event.target.value)}>
                  <option value="">Choose a person</option>
                  {peopleOptions.map((person) => (
                    <option key={person.id} value={person.id}>{person.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${author.key}-order`}>Order</label>
                <input
                  id={`${author.key}-order`}
                  inputMode="numeric"
                  value={author.authorOrder}
                  onChange={(event) => updateAuthor(author.key, 'authorOrder', event.target.value)}
                />
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => update('authors', form.authors.filter((item) => item.key !== author.key))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              const nextOrder = form.authors.reduce((max, author) => Math.max(max, Number(author.authorOrder) || 0), 0) + 1;
              update('authors', [...form.authors, nextAuthor({ authorOrder: String(nextOrder) })]);
            }}
          >
            Add author
          </button>
          {fieldErrors.authors ? <p className="field-error">{fieldErrors.authors}</p> : null}
        </fieldset>
        <div className="button-row">
          <button className="button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save publication'}</button>
          <Link className="button button-secondary" to={editing ? `/publications/${publicationId}` : '/publications'}>Cancel</Link>
        </div>
      </form>
    </section>
  );
}
