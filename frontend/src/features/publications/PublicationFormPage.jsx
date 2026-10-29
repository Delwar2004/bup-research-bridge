import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { listPeopleDirectory, personLabel, withSelf } from '../../api/people';
import { createPublication, getPublication, updatePublication } from '../../api/publications';
import { listResearchAreas } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';
import {
  PUBLICATION_CATEGORIES, PUBLICATION_STATUSES, REVIEW_TYPES, categoryLabel,
} from './publicationCategories';

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
  category: '',
  title: '',
  abstract: '',
  publicationYear: '',
  journalName: '',
  conferenceName: '',
  proceedingsTitle: '',
  volume: '',
  issue: '',
  pageRange: '',
  publisher: '',
  keywords: '',
  reviewType: '',
  preprintServer: '',
  preprintId: '',
  version: '',
  publicationStatus: '',
  doi: '',
  url: '',
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
    category: item.category || '',
    title: item.title || '',
    abstract: item.abstract || '',
    publicationYear: item.publicationYear == null ? '' : String(item.publicationYear),
    journalName: item.journalName || '',
    conferenceName: item.conferenceName || '',
    proceedingsTitle: item.proceedingsTitle || '',
    volume: item.volume || '',
    issue: item.issue || '',
    pageRange: item.pageRange || '',
    publisher: item.publisher || '',
    keywords: (item.keywords || []).join(', '),
    reviewType: item.reviewType || '',
    preprintServer: item.preprintServer || '',
    preprintId: item.preprintId || '',
    version: item.version || '',
    publicationStatus: item.publicationStatus || '',
    doi: item.doi || '',
    url: item.url || '',
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

function keywordValues(value) {
  return value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function validHttpUrl(value) {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
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
        const [areaPayload, peoplePayload] = await Promise.all([
          listResearchAreas(),
          listPeopleDirectory(),
        ]);
        if (cancelled) return;
        setAreas(areaPayload.data || []);
        setPeople(withSelf(peoplePayload.people, user));
        setDirectoryNote(peoplePayload.truncated
          ? 'The person list shows the first 100 faculty, alumni, and student profiles.'
          : '');
        if (!editing) {
          if (user?.id && ['student', 'faculty', 'alumni'].includes(user.role)) {
            setForm((current) => (
              current.authors.length
                ? current
                : {
                  ...current,
                  authors: [nextAuthor({ userId: user.id, authorOrder: '1', fullName: user.fullName })],
                }
            ));
          }
          return;
        }
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
    if (!form.category) errors.category = 'Choose a publication category.';
    if (!form.title.trim() || form.title.trim().length > 500) errors.title = 'Title is required and must be at most 500 characters.';
    if (form.abstract.trim().length > 20000) errors.abstract = 'Abstract must be at most 20000 characters.';
    const year = yearValue(form.publicationYear);
    if (year === undefined || year == null) errors.publicationYear = 'Publication year is required and must be a whole number from 1950 through 2100.';
    if (form.category === 'journal_article' && !form.journalName.trim()) errors.journalName = 'Journal name is required.';
    if (form.category === 'conference_paper' && !form.conferenceName.trim()) errors.conferenceName = 'Conference name is required.';
    if (form.category === 'review_survey' && !form.reviewType) errors.reviewType = 'Review type is required.';
    if (form.category === 'preprint' && !form.preprintServer.trim()) errors.preprintServer = 'Preprint server is required.';
    if (form.category === 'preprint' && !form.publicationStatus) errors.publicationStatus = 'Publication status is required.';
    const limits = {
      journalName: 300,
      conferenceName: 300,
      proceedingsTitle: 500,
      volume: 100,
      issue: 100,
      pageRange: 100,
      publisher: 300,
      preprintServer: 200,
      preprintId: 200,
      version: 100,
    };
    Object.entries(limits).forEach(([field, max]) => {
      if (form[field].trim().length > max) errors[field] = `Must be at most ${max} characters.`;
    });
    const keywords = keywordValues(form.keywords);
    if (keywords.length > 25) errors.keywords = 'Add at most 25 comma-separated keywords.';
    else if (keywords.some((keyword) => keyword.length > 100)) errors.keywords = 'Each keyword must be at most 100 characters.';
    else if (new Set(keywords.map((keyword) => keyword.toLocaleLowerCase())).size !== keywords.length) errors.keywords = 'Keywords must be unique.';
    if (form.doi.trim().length > 255) errors.doi = 'DOI must be at most 255 characters.';
    if (form.url.length > 2000) errors.url = 'URL must be at most 2000 characters.';
    else if (form.category === 'preprint' && !form.url.trim()) errors.url = 'URL is required for a preprint.';
    else if (!validHttpUrl(form.url.trim())) errors.url = 'Enter a valid HTTP or HTTPS URL.';
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
    if (form.authors.length === 0 && !errors.authors) errors.authors = 'Add at least one author.';
    const approved = editing && original?.moderationStatus === 'approved';
    if (approved && form.researchAreaIds.length === 0) {
      errors.researchAreaIds = 'An approved publication must keep at least one research area.';
    }
    if (approved && form.authors.length === 0) {
      errors.authors = 'An approved publication must keep at least one author.';
    }
    if (!editing && form.moderationStatus === 'pending' && form.researchAreaIds.length === 0) {
      errors.researchAreaIds = 'Choose at least one research area before sending the publication for review.';
    }
    return errors;
  }

  function buildBody() {
    const authors = form.authors.map((author) => ({
      userId: author.userId,
      authorOrder: Number(author.authorOrder),
    }));
    const link = form.url.trim() || null;
    const year = yearValue(form.publicationYear);
    const textFields = [
      'abstract', 'journalName', 'conferenceName', 'proceedingsTitle', 'volume',
      'issue', 'pageRange', 'publisher', 'preprintServer', 'preprintId', 'version',
      'doi',
    ];
    if (!editing) {
      const body = {
        category: form.category,
        title: form.title.trim(),
        publicationYear: year,
        authors,
      };
      textFields.forEach((field) => {
        if (form[field].trim()) body[field] = form[field].trim();
      });
      const keywords = keywordValues(form.keywords);
      if (keywords.length) body.keywords = keywords;
      if (form.reviewType) body.reviewType = form.reviewType;
      if (form.publicationStatus) body.publicationStatus = form.publicationStatus;
      if (link) body.url = link;
      if (form.moderationStatus === 'pending') body.moderationStatus = 'pending';
      if (form.researchAreaIds.length) body.researchAreaIds = form.researchAreaIds;
      return body;
    }
    const body = {};
    if (!original.category && form.category) body.category = form.category;
    if (form.title.trim() !== original.title) body.title = form.title.trim();
    if (year !== (original.publicationYear ?? null)) body.publicationYear = year;
    textFields.forEach((field) => {
      if ((form[field].trim() || null) !== (original[field] || null)) body[field] = form[field].trim() || null;
    });
    const keywords = keywordValues(form.keywords);
    if (JSON.stringify(keywords) !== JSON.stringify(original.keywords || [])) body.keywords = keywords;
    if ((form.reviewType || null) !== (original.reviewType || null)) body.reviewType = form.reviewType || null;
    if ((form.publicationStatus || null) !== (original.publicationStatus || null)) {
      body.publicationStatus = form.publicationStatus || null;
    }
    if (link !== (original.url || null)) body.url = link;
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
        <h1>{editing ? 'Edit publication' : 'Add publication'}</h1>
        <Alert>{loadError}</Alert>
      </section>
    );
  }

  if (!form.category) {
    return (
      <section className="panel">
        <p className="eyebrow">Publications</p>
        <h1>Choose a publication category</h1>
        <p>Select the category first. The next form will show only the metadata fields that apply to it.</p>
        {fieldErrors.category ? <Alert>{fieldErrors.category}</Alert> : null}
        <div className="category-grid">
          {PUBLICATION_CATEGORIES.map((category) => (
            <article className="category-card" key={category.value}>
              <h2>{category.label}</h2>
              <p>{category.description}</p>
              <button className="button" type="button" onClick={() => update('category', category.value)}>
                Select {category.label}
              </button>
            </article>
          ))}
        </div>
        <p><Link to={editing ? `/publications/${publicationId}` : '/publications'}>Cancel</Link></p>
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
      <h1>{editing ? `Edit ${categoryLabel(form.category)}` : `New ${categoryLabel(form.category)}`}</h1>
      <p>
        {editing
          ? 'Moderation is changed from the publication page.'
          : 'The publication starts as a draft unless you send it for review. Other people see it after an administrator approves it.'}
      </p>
      <p className="field-hint">The API stores publication metadata and an optional link. It does not accept a paper file. An administrator can approve a record only when it has at least one research area and one author.</p>
      {directoryNote ? <p className="field-hint">{directoryNote}</p> : null}
      {formError ? <Alert>{formError}</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField id="category" label="Category">
          <input id="category" value={categoryLabel(form.category)} disabled />
        </FormField>
        <FormField id="title" label="Title" error={fieldErrors.title}>
          <input id="title" value={form.title} onChange={(event) => update('title', event.target.value)} />
        </FormField>
        <FormField id="publicationYear" label={form.category === 'preprint' ? 'Posting year' : 'Publication year'} hint="Required." error={fieldErrors.publicationYear}>
          <input id="publicationYear" inputMode="numeric" value={form.publicationYear} onChange={(event) => update('publicationYear', event.target.value)} />
        </FormField>
        {form.category === 'journal_article' || form.category === 'review_survey' ? (
          <FormField id="journalName" label="Journal name" hint={form.category === 'journal_article' ? 'Required.' : 'Optional.'} error={fieldErrors.journalName}>
            <input id="journalName" value={form.journalName} onChange={(event) => update('journalName', event.target.value)} />
          </FormField>
        ) : null}
        {form.category === 'conference_paper' || form.category === 'review_survey' ? (
          <FormField id="conferenceName" label="Conference name" hint={form.category === 'conference_paper' ? 'Required.' : 'Optional.'} error={fieldErrors.conferenceName}>
            <input id="conferenceName" value={form.conferenceName} onChange={(event) => update('conferenceName', event.target.value)} />
          </FormField>
        ) : null}
        {form.category === 'conference_paper' ? (
          <FormField id="proceedingsTitle" label="Proceedings title" error={fieldErrors.proceedingsTitle}>
            <input id="proceedingsTitle" value={form.proceedingsTitle} onChange={(event) => update('proceedingsTitle', event.target.value)} />
          </FormField>
        ) : null}
        {form.category === 'review_survey' ? (
          <FormField id="reviewType" label="Review type" hint="Required." error={fieldErrors.reviewType}>
            <select id="reviewType" value={form.reviewType} onChange={(event) => update('reviewType', event.target.value)}>
              <option value="">Choose a review type</option>
              {REVIEW_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </FormField>
        ) : null}
        {form.category === 'journal_article' || form.category === 'review_survey' ? (
          <>
            <FormField id="volume" label="Volume" error={fieldErrors.volume}>
              <input id="volume" value={form.volume} onChange={(event) => update('volume', event.target.value)} />
            </FormField>
            <FormField id="issue" label="Issue" error={fieldErrors.issue}>
              <input id="issue" value={form.issue} onChange={(event) => update('issue', event.target.value)} />
            </FormField>
          </>
        ) : null}
        {form.category !== 'preprint' ? (
          <FormField id="pageRange" label={form.category === 'review_survey' ? 'Page range or article number' : 'Page range'} error={fieldErrors.pageRange}>
            <input id="pageRange" value={form.pageRange} onChange={(event) => update('pageRange', event.target.value)} />
          </FormField>
        ) : null}
        {form.category !== 'preprint' ? (
          <FormField id="publisher" label="Publisher" error={fieldErrors.publisher}>
            <input id="publisher" value={form.publisher} onChange={(event) => update('publisher', event.target.value)} />
          </FormField>
        ) : null}
        {form.category === 'preprint' ? (
          <>
            <FormField id="preprintServer" label="Preprint server" hint="Required, for example arXiv, medRxiv, or bioRxiv." error={fieldErrors.preprintServer}>
              <input id="preprintServer" value={form.preprintServer} onChange={(event) => update('preprintServer', event.target.value)} />
            </FormField>
            <FormField id="preprintId" label="Preprint ID" error={fieldErrors.preprintId}>
              <input id="preprintId" value={form.preprintId} onChange={(event) => update('preprintId', event.target.value)} />
            </FormField>
            <FormField id="version" label="Version" error={fieldErrors.version}>
              <input id="version" value={form.version} onChange={(event) => update('version', event.target.value)} />
            </FormField>
            <FormField id="publicationStatus" label="Publication status" hint="Required." error={fieldErrors.publicationStatus}>
              <select id="publicationStatus" value={form.publicationStatus} onChange={(event) => update('publicationStatus', event.target.value)}>
                <option value="">Choose a status</option>
                {PUBLICATION_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </FormField>
          </>
        ) : null}
        <FormField id="doi" label="DOI" error={fieldErrors.doi}>
          <input id="doi" value={form.doi} onChange={(event) => update('doi', event.target.value)} />
        </FormField>
        <FormField id="url" label="URL" hint={form.category === 'preprint' ? 'Required. Use an HTTP or HTTPS URL.' : 'Optional. Use an HTTP or HTTPS URL.'} error={fieldErrors.url}>
          <input id="url" value={form.url} onChange={(event) => update('url', event.target.value)} />
        </FormField>
        <FormField id="abstract" label="Abstract" error={fieldErrors.abstract}>
          <textarea id="abstract" rows="6" value={form.abstract} onChange={(event) => update('abstract', event.target.value)} />
        </FormField>
        <FormField id="keywords" label="Keywords" hint="Optional. Separate keywords with commas." error={fieldErrors.keywords}>
          <input id="keywords" value={form.keywords} onChange={(event) => update('keywords', event.target.value)} />
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
          <p className="field-hint">Optional while this stays a draft. Required before an administrator can approve it, and required here if you send it for review.</p>
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
          <p className="field-hint">At least one author is required. Choose a student, faculty member, or alumnus who already has an account. A person and an author order can each appear once.</p>
          {form.authors.map((author) => (
            <div className="member-row" key={author.key}>
              <div className="field">
                <label htmlFor={`${author.key}-user`}>Person</label>
                <select id={`${author.key}-user`} value={author.userId} onChange={(event) => updateAuthor(author.key, 'userId', event.target.value)}>
                  <option value="">Choose a person</option>
                  {peopleOptions.map((person) => (
                    <option key={person.id} value={person.id}>{personLabel(person)}</option>
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
          <button className="button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : `Save ${categoryLabel(form.category).toLowerCase()}`}</button>
          <Link className="button button-secondary" to={editing ? `/publications/${publicationId}` : '/publications'}>Cancel</Link>
        </div>
      </form>
    </section>
  );
}
