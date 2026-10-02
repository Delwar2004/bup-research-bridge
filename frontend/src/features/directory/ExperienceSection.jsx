import { useState } from 'react';
import { createExperience, deleteExperience, updateExperience } from '../../api/experiences';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';

const EMPTY_FORM = {
  organization: '',
  positionTitle: '',
  description: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
};

function formFromItem(item) {
  return {
    organization: item.organization || '',
    positionTitle: item.positionTitle || '',
    description: item.description || '',
    startDate: item.startDate || '',
    endDate: item.endDate || '',
    isCurrent: Boolean(item.isCurrent),
  };
}

function nullableText(value) {
  const text = value.trim();
  return text || null;
}

function experienceBody(form) {
  return {
    organization: form.organization.trim(),
    positionTitle: nullableText(form.positionTitle),
    description: nullableText(form.description),
    startDate: form.startDate || null,
    endDate: form.isCurrent ? null : (form.endDate || null),
    isCurrent: Boolean(form.isCurrent),
  };
}

function changedBody(form, original) {
  const next = experienceBody(form);
  const previous = experienceBody(formFromItem(original));
  const body = {};
  Object.keys(next).forEach((key) => {
    if (next[key] !== previous[key]) body[key] = next[key];
  });
  if (body.isCurrent === true && previous.endDate && body.endDate === undefined) {
    body.endDate = null;
  }
  return body;
}

function clientErrors(form) {
  const errors = {};
  const organization = form.organization.trim();
  if (!organization || organization.length > 200) {
    errors.organization = 'Organization is required and must be at most 200 characters.';
  }
  if (form.positionTitle.trim().length > 200) {
    errors.positionTitle = 'Position title must be at most 200 characters.';
  }
  if (form.description.trim().length > 4000) {
    errors.description = 'Description must be at most 4000 characters.';
  }
  if (form.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.startDate)) {
    errors.startDate = 'Use a date in YYYY-MM-DD form.';
  }
  if (!form.isCurrent && form.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.endDate)) {
    errors.endDate = 'Use a date in YYYY-MM-DD form.';
  }
  if (form.isCurrent && form.endDate) {
    errors.endDate = 'A current experience cannot have an end date.';
  }
  if (!form.isCurrent && form.startDate && form.endDate && form.endDate < form.startDate) {
    errors.endDate = 'End date must be on or after the start date.';
  }
  return errors;
}

function ExperienceForm({ mode, initial, onCancel, onSaved, disabled }) {
  const editing = mode === 'edit';
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === 'isCurrent' && value) next.endDate = '';
      return next;
    });
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const errors = clientErrors(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    const body = editing ? changedBody(form, initial) : experienceBody(form);
    if (editing && !Object.keys(body).length) {
      setFormError('There are no changes to save.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = editing
        ? await updateExperience(initial.id, body)
        : await createExperience(body);
      onSaved(payload.message || (editing ? 'Experience updated.' : 'Experience created.'));
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setFormError(errorText(err, editing ? 'The experience could not be updated.' : 'The experience could not be saved.'));
      setSubmitting(false);
    }
  }

  const busy = submitting || disabled;

  return (
    <form onSubmit={onSubmit} noValidate>
      <h3>{editing ? 'Edit experience' : 'Add experience'}</h3>
      {formError ? <Alert>{formError}</Alert> : null}
      <FormField id="experience-organization" label="Organization" error={fieldErrors.organization}>
        <input
          id="experience-organization"
          value={form.organization}
          onChange={(event) => update('organization', event.target.value)}
          required
        />
      </FormField>
      <FormField id="experience-position" label="Position title" hint="Optional." error={fieldErrors.positionTitle}>
        <input
          id="experience-position"
          value={form.positionTitle}
          onChange={(event) => update('positionTitle', event.target.value)}
        />
      </FormField>
      <FormField id="experience-description" label="Description" hint="Optional. At most 4000 characters." error={fieldErrors.description}>
        <textarea
          id="experience-description"
          rows="4"
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
        />
      </FormField>
      <FormField id="experience-start" label="Start date" hint="Optional." error={fieldErrors.startDate}>
        <input
          id="experience-start"
          type="date"
          value={form.startDate}
          onChange={(event) => update('startDate', event.target.value)}
        />
      </FormField>
      <FormField id="experience-end" label="End date" hint="Optional. Leave empty when this experience is current." error={fieldErrors.endDate}>
        <input
          id="experience-end"
          type="date"
          value={form.isCurrent ? '' : form.endDate}
          disabled={form.isCurrent}
          onChange={(event) => update('endDate', event.target.value)}
        />
      </FormField>
      <div className="checkbox-field">
        <label htmlFor="experience-current">
          <input
            id="experience-current"
            type="checkbox"
            checked={form.isCurrent}
            onChange={(event) => update('isCurrent', event.target.checked)}
          />
          Current experience
        </label>
        {fieldErrors.isCurrent ? <p className="field-error">{fieldErrors.isCurrent}</p> : null}
      </div>
      <div className="button-row">
        <button className="button" type="submit" disabled={busy}>
          {submitting ? 'Saving…' : editing ? 'Save changes' : 'Save experience'}
        </button>
        <button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ExperienceSection({ loading, error, onRetry, total, items, canManage }) {
  const [editor, setEditor] = useState(null);
  const [success, setSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  function openCreate() {
    setSuccess('');
    setActionError('');
    setEditor({ mode: 'create', initial: EMPTY_FORM });
  }

  function openEdit(item) {
    setSuccess('');
    setActionError('');
    setEditor({ mode: 'edit', initial: { ...formFromItem(item), id: item.id } });
  }

  function closeEditor() {
    setEditor(null);
  }

  function saved(message) {
    setEditor(null);
    setActionError('');
    setSuccess(message);
    onRetry();
  }

  async function remove(item) {
    if (!window.confirm('Delete this experience?')) return;
    setSuccess('');
    setActionError('');
    setDeletingId(item.id);
    try {
      const payload = await deleteExperience(item.id);
      if (editor?.initial?.id === item.id) setEditor(null);
      setSuccess(payload.message || 'Experience deleted.');
      onRetry();
    } catch (err) {
      setActionError(errorText(err, 'The experience could not be deleted.'));
    } finally {
      setDeletingId('');
    }
  }

  const busy = Boolean(deletingId);
  const count = loading ? undefined : total;

  return (
    <section className="related-section">
      <h2>Experience{typeof count === 'number' ? <span className="count"> {count}</span> : null}</h2>
      {canManage && success ? <Alert tone="success">{success}</Alert> : null}
      {canManage && actionError ? <Alert>{actionError}</Alert> : null}
      {canManage && !editor ? (
        <button className="button" type="button" onClick={openCreate} disabled={busy}>Add experience</button>
      ) : null}
      {canManage && editor ? (
        <ExperienceForm
          key={editor.mode === 'edit' ? editor.initial.id : 'create'}
          mode={editor.mode}
          initial={editor.initial}
          onCancel={closeEditor}
          onSaved={saved}
          disabled={busy}
        />
      ) : null}
      {loading ? <LoadingState label="Loading experience" /> : null}
      {!loading && error ? (
        <>
          <Alert>{error}</Alert>
          {onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button> : null}
        </>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="empty-state">No academic or professional experience is listed.</p>
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <ul className="record-list">
          {items.map((item) => (
            <li key={item.id}>
              <h3>{item.organization}</h3>
              <p>
                {[item.positionTitle, item.isCurrent ? 'Current' : null, item.startDate, item.endDate].filter(Boolean).join(' · ')}
              </p>
              {item.description ? <p>{item.description}</p> : null}
              {canManage ? (
                <div className="button-row">
                  <button className="button button-secondary" type="button" onClick={() => openEdit(item)} disabled={busy}>
                    Edit
                  </button>
                  <button className="button button-secondary" type="button" onClick={() => remove(item)} disabled={busy}>
                    {deletingId === item.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
