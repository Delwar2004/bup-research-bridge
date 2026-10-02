import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { createOpportunity, getOpportunity, updateOpportunity } from '../../api/opportunities';
import { listFaculty } from '../../api/people';
import { listDepartments, listResearchAreas } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from './errors';

const EMPTY = {
  facultyUserId: '',
  departmentId: '',
  opportunityType: 'thesis',
  title: '',
  description: '',
  deadline: '',
  slots: '',
  requiredSkills: '',
  prerequisites: '',
  availabilityStatus: 'open',
  moderationStatus: 'draft',
  researchAreaIds: [],
};

function sameIds(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function formFromOpportunity(item) {
  return {
    facultyUserId: item.facultyUserId || '',
    departmentId: item.department?.id || '',
    opportunityType: item.opportunityType || 'thesis',
    title: item.title || '',
    description: item.description || '',
    deadline: item.deadline || '',
    slots: item.slots == null ? '' : String(item.slots),
    requiredSkills: item.requiredSkills || '',
    prerequisites: item.prerequisites || '',
    availabilityStatus: item.availabilityStatus || 'open',
    moderationStatus: item.moderationStatus || 'draft',
    researchAreaIds: (item.researchAreas || []).map((area) => area.id),
  };
}

export function OpportunityFormPage({ mode }) {
  const editing = mode === 'edit';
  const { opportunityId } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [form, setForm] = useState(EMPTY);
  const [original, setOriginal] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [faculty, setFaculty] = useState([]);
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
        const [departmentPayload, areaPayload, facultyPayload] = await Promise.all([
          listDepartments(),
          listResearchAreas(),
          isAdmin ? listFaculty({ pageSize: 100, sort: 'fullName', order: 'asc' }) : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;
        setDepartments(departmentPayload.data || []);
        setAreas(areaPayload.data || []);
        setFaculty(facultyPayload.data || []);
        if (!editing) return;
        const payload = await getOpportunity(opportunityId);
        if (cancelled) return;
        const item = payload.data;
        const canEdit = isAdmin || user?.id === item.facultyUserId;
        if (!canEdit) {
          setForbidden(true);
          return;
        }
        setOriginal(item);
        setForm(formFromOpportunity(item));
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
  }, [editing, isAdmin, opportunityId, user?.id]);

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

  function clientErrors() {
    const errors = {};
    if (isAdmin && !editing && !form.facultyUserId) errors.facultyUserId = 'Choose the faculty owner.';
    if (!form.title.trim() || form.title.trim().length > 300) errors.title = 'Title is required and must be at most 300 characters.';
    if (!form.description.trim() || form.description.trim().length > 20000) {
      errors.description = 'Description is required and must be at most 20000 characters.';
    }
    if (form.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(form.deadline)) errors.deadline = 'Use a date in YYYY-MM-DD form.';
    if (form.slots !== '') {
      const slots = Number(form.slots);
      if (!Number.isInteger(slots) || slots < 1) errors.slots = 'Slots must be empty or an integer greater than 0.';
    }
    if (form.requiredSkills.trim().length > 4000) errors.requiredSkills = 'Required skills must be at most 4000 characters.';
    if (form.prerequisites.trim().length > 4000) errors.prerequisites = 'Prerequisites must be at most 4000 characters.';
    if (form.researchAreaIds.length > 25) errors.researchAreaIds = 'Select at most 25 research areas.';
    if (editing && original?.moderationStatus === 'approved' && form.researchAreaIds.length === 0) {
      errors.researchAreaIds = 'An approved opportunity must keep at least one research area.';
    }
    return errors;
  }

  function nullable(value) {
    const text = value.trim();
    return text || null;
  }

  function buildBody() {
    if (!editing) {
      const body = {
        opportunityType: form.opportunityType,
        title: form.title.trim(),
        description: form.description.trim(),
      };
      if (isAdmin) body.facultyUserId = form.facultyUserId;
      if (form.departmentId) body.departmentId = form.departmentId;
      if (form.deadline) body.deadline = form.deadline;
      if (form.slots !== '') body.slots = Number(form.slots);
      if (form.requiredSkills.trim()) body.requiredSkills = form.requiredSkills.trim();
      if (form.prerequisites.trim()) body.prerequisites = form.prerequisites.trim();
      if (form.availabilityStatus !== 'open') body.availabilityStatus = form.availabilityStatus;
      if (form.moderationStatus === 'pending') body.moderationStatus = 'pending';
      if (form.researchAreaIds.length) body.researchAreaIds = form.researchAreaIds;
      return body;
    }
    const body = {};
    if (isAdmin && form.facultyUserId !== original.facultyUserId) body.facultyUserId = form.facultyUserId;
    if (form.departmentId !== (original.department?.id || '')) body.departmentId = form.departmentId;
    if (form.opportunityType !== original.opportunityType) body.opportunityType = form.opportunityType;
    if (form.title.trim() !== original.title) body.title = form.title.trim();
    if (form.description.trim() !== original.description) body.description = form.description.trim();
    if ((form.deadline || null) !== (original.deadline || null)) body.deadline = form.deadline || null;
    const nextSlots = form.slots === '' ? null : Number(form.slots);
    if (nextSlots !== (original.slots ?? null)) body.slots = nextSlots;
    if (nullable(form.requiredSkills) !== (original.requiredSkills ?? null)) body.requiredSkills = nullable(form.requiredSkills);
    if (nullable(form.prerequisites) !== (original.prerequisites ?? null)) body.prerequisites = nullable(form.prerequisites);
    if (!sameIds(form.researchAreaIds, (original.researchAreas || []).map((area) => area.id))) {
      body.researchAreaIds = form.researchAreaIds;
    }
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
        ? await updateOpportunity(opportunityId, body)
        : await createOpportunity(body);
      navigate(`/opportunities/${payload.data.id}`, { state: { notice: payload.message } });
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setFormError(errorText(err, 'The opportunity could not be saved.'));
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label={editing ? 'Loading opportunity' : 'Loading the form'} />;
  if (missing) {
    return (
      <section className="panel">
        <h1>Edit opportunity</h1>
        <p>This opportunity is not available.</p>
        <Link className="button" to="/opportunities">Back to opportunities</Link>
      </section>
    );
  }
  if (forbidden) {
    return (
      <section className="panel">
        <h1>Edit opportunity</h1>
        <Alert>You cannot edit this opportunity.</Alert>
        <Link className="button" to={`/opportunities/${opportunityId}`}>Back to the opportunity</Link>
      </section>
    );
  }
  if (loadError) {
    return (
      <section className="panel">
        <h1>{editing ? 'Edit opportunity' : 'New opportunity'}</h1>
        <Alert>{loadError}</Alert>
      </section>
    );
  }

  const knownOwner = original && !faculty.some((person) => person.id === original.facultyUserId);

  return (
    <section className="panel">
      <p className="eyebrow">Opportunities</p>
      <h1>{editing ? 'Edit opportunity' : 'New opportunity'}</h1>
      <p>
        {editing
          ? 'Availability and moderation are changed from the opportunity page.'
          : 'A new opening starts as a draft unless you send it for review. Students see it after an administrator approves it.'}
      </p>
      {formError ? <Alert>{formError}</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        {isAdmin ? (
          <FormField id="facultyUserId" label="Faculty owner" error={fieldErrors.facultyUserId}>
            <select id="facultyUserId" value={form.facultyUserId} onChange={(event) => update('facultyUserId', event.target.value)} required={!editing}>
              <option value="">Select a faculty member</option>
              {knownOwner ? <option value={original.facultyUserId}>{original.facultyName}</option> : null}
              {faculty.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          </FormField>
        ) : null}
        <FormField id="opportunityType" label="Type" error={fieldErrors.opportunityType}>
          <select id="opportunityType" value={form.opportunityType} onChange={(event) => update('opportunityType', event.target.value)}>
            <option value="thesis">Thesis</option>
            <option value="research">Research</option>
          </select>
        </FormField>
        <FormField id="title" label="Title" error={fieldErrors.title}>
          <input id="title" value={form.title} onChange={(event) => update('title', event.target.value)} required />
        </FormField>
        <FormField id="description" label="Description" error={fieldErrors.description}>
          <textarea id="description" rows="6" value={form.description} onChange={(event) => update('description', event.target.value)} required />
        </FormField>
        <FormField id="departmentId" label="Department" hint="Leave this empty on a new opening to use the faculty member's department." error={fieldErrors.departmentId}>
          <select id="departmentId" value={form.departmentId} onChange={(event) => update('departmentId', event.target.value)}>
            {!editing || !form.departmentId ? (
              <option value="">{editing ? 'No department listed' : "Faculty member's department"}</option>
            ) : null}
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.code} — {department.name}</option>
            ))}
          </select>
        </FormField>
        <FormField id="deadline" label="Deadline" hint="Optional. A past date is allowed." error={fieldErrors.deadline}>
          <input id="deadline" type="date" value={form.deadline} onChange={(event) => update('deadline', event.target.value)} />
        </FormField>
        <FormField id="slots" label="Slots" hint="Optional. Leave empty, or enter a number greater than 0." error={fieldErrors.slots}>
          <input id="slots" inputMode="numeric" value={form.slots} onChange={(event) => update('slots', event.target.value)} />
        </FormField>
        <FormField id="requiredSkills" label="Required skills" error={fieldErrors.requiredSkills}>
          <textarea id="requiredSkills" rows="3" value={form.requiredSkills} onChange={(event) => update('requiredSkills', event.target.value)} />
        </FormField>
        <FormField id="prerequisites" label="Prerequisites" error={fieldErrors.prerequisites}>
          <textarea id="prerequisites" rows="3" value={form.prerequisites} onChange={(event) => update('prerequisites', event.target.value)} />
        </FormField>
        {!editing ? (
          <>
            <FormField id="availabilityStatus" label="Availability" error={fieldErrors.availabilityStatus}>
              <select id="availabilityStatus" value={form.availabilityStatus} onChange={(event) => update('availabilityStatus', event.target.value)}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="filled">Filled</option>
              </select>
            </FormField>
            <FormField id="moderationStatus" label="Moderation" hint="Approved, rejected, and archived are set by an administrator." error={fieldErrors.moderationStatus}>
              <select id="moderationStatus" value={form.moderationStatus} onChange={(event) => update('moderationStatus', event.target.value)}>
                <option value="draft">Draft</option>
                <option value="pending">Submit for review</option>
              </select>
            </FormField>
          </>
        ) : null}
        <fieldset className="field">
          <legend>Research areas</legend>
          <p className="field-hint" id="opportunity-areas-hint">Approval requires at least one active research area.</p>
          {areas.length === 0 ? <p className="empty-state">No active research areas are available.</p> : (
            <ul className="choice-list" aria-describedby="opportunity-areas-hint">
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
        <div className="button-row">
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create opportunity'}
          </button>
          <Link className="button button-secondary" to={editing ? `/opportunities/${opportunityId}` : '/opportunities'}>Cancel</Link>
        </div>
      </form>
    </section>
  );
}
