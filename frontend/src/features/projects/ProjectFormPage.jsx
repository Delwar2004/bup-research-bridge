import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { listOpportunities } from '../../api/opportunities';
import { listAlumni, listFaculty } from '../../api/people';
import { createProject, getProject, updateProject } from '../../api/projects';
import { listDepartments, listResearchAreas } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';

const TYPES = [
  { value: 'thesis', label: 'Thesis' },
  { value: 'research', label: 'Research' },
  { value: 'academic_project', label: 'Academic project' },
];

const MEMBER_ROLES = [
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'co_supervisor', label: 'Co-supervisor' },
  { value: 'author', label: 'Author' },
];

let memberSeq = 0;

function nextMember(partial = {}) {
  memberSeq += 1;
  return {
    key: `member-${memberSeq}`,
    userId: '',
    memberRole: 'supervisor',
    fullName: '',
    ...partial,
  };
}

const EMPTY = {
  departmentId: '',
  opportunityId: '',
  title: '',
  description: '',
  projectType: 'thesis',
  projectYear: '',
  externalLink: '',
  moderationStatus: 'draft',
  researchAreaIds: [],
  members: [],
};

function sameIds(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function memberSignature(members) {
  return [...members]
    .map((member) => `${member.userId}:${member.memberRole}`)
    .sort()
    .join('|');
}

function formFromProject(item) {
  return {
    departmentId: item.department?.id || '',
    opportunityId: item.opportunityId || '',
    title: item.title || '',
    description: item.description || '',
    projectType: item.projectType || 'thesis',
    projectYear: item.projectYear == null ? '' : String(item.projectYear),
    externalLink: item.externalLink || '',
    moderationStatus: item.moderationStatus || 'draft',
    researchAreaIds: (item.researchAreas || []).map((area) => area.id),
    members: (item.members || []).map((member) => nextMember({
      userId: member.userId,
      memberRole: member.memberRole,
      fullName: member.fullName,
    })),
  };
}

function yearValue(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return null;
  return year;
}

export function ProjectFormPage({ mode }) {
  const editing = mode === 'edit';
  const { projectId } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [form, setForm] = useState(EMPTY);
  const [original, setOriginal] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [people, setPeople] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
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
        const opportunityCalls = isAdmin
          ? [listOpportunities({ pageSize: 100, sort: 'title', order: 'asc' })]
          : [
            listOpportunities({ availabilityStatus: 'open', pageSize: 100, sort: 'title', order: 'asc' }),
            listOpportunities({ availabilityStatus: 'closed', pageSize: 100, sort: 'title', order: 'asc' }),
            listOpportunities({ availabilityStatus: 'filled', pageSize: 100, sort: 'title', order: 'asc' }),
          ];
        if (user?.role === 'faculty' || isAdmin) {
          opportunityCalls.push(listOpportunities({ mine: true, pageSize: 100, sort: 'title', order: 'asc' }));
        }
        const [departmentPayload, areaPayload, facultyPayload, alumniPayload, ...opportunityPayloads] = await Promise.all([
          listDepartments(),
          listResearchAreas(),
          listFaculty({ pageSize: 100, sort: 'fullName', order: 'asc' }),
          listAlumni({ pageSize: 100, sort: 'fullName', order: 'asc' }),
          ...opportunityCalls,
        ]);
        if (cancelled) return;
        setDepartments(departmentPayload.data || []);
        setAreas(areaPayload.data || []);
        const directory = [];
        const seenPeople = new Set();
        [...(facultyPayload.data || []), ...(alumniPayload.data || [])].forEach((person) => {
          if (seenPeople.has(person.id)) return;
          seenPeople.add(person.id);
          directory.push({ id: person.id, fullName: person.fullName });
        });
        if ((user?.role === 'faculty' || user?.role === 'alumni') && user.id && !seenPeople.has(user.id)) {
          directory.push({ id: user.id, fullName: user.fullName });
        }
        directory.sort((left, right) => left.fullName.localeCompare(right.fullName));
        setPeople(directory);
        const openings = [];
        const seenOpenings = new Set();
        opportunityPayloads.forEach((payload) => {
          (payload.data || []).forEach((item) => {
            if (seenOpenings.has(item.id)) return;
            seenOpenings.add(item.id);
            openings.push(item);
          });
        });
        openings.sort((left, right) => left.title.localeCompare(right.title));
        setOpportunities(openings);
        const notes = [];
        if ((facultyPayload.meta?.totalPages || 1) > 1 || (alumniPayload.meta?.totalPages || 1) > 1) {
          notes.push('The person list shows the first 100 faculty profiles and the first 100 alumni profiles.');
        }
        if (opportunityPayloads.some((payload) => (payload.meta?.totalPages || 1) > 1)) {
          notes.push('The opportunity list shows the first 100 matches for each requested status.');
        }
        notes.push('Students already listed on a project stay selectable. There is no student directory to add a new student member.');
        setDirectoryNote(notes.join(' '));
        if (!editing) return;
        const payload = await getProject(projectId);
        if (cancelled) return;
        const item = payload.data;
        const canEdit = isAdmin || user?.id === item.createdByUserId;
        if (!canEdit) {
          setForbidden(true);
          return;
        }
        setOriginal(item);
        setForm(formFromProject(item));
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
  }, [editing, isAdmin, projectId, user?.id, user?.role, user?.fullName]);

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

  function updateMember(key, name, value) {
    setForm((current) => ({
      ...current,
      members: current.members.map((member) => (member.key === key ? { ...member, [name]: value } : member)),
    }));
  }

  function clientErrors() {
    const errors = {};
    if (!form.departmentId) errors.departmentId = 'Choose a department.';
    if (!form.title.trim() || form.title.trim().length > 300) errors.title = 'Title is required and must be at most 300 characters.';
    if (form.description.trim().length > 20000) errors.description = 'Description must be at most 20000 characters.';
    if (yearValue(form.projectYear) == null) errors.projectYear = 'Year must be a whole number from 1990 through 2100.';
    if (form.externalLink.length > 2000) errors.externalLink = 'External link must be at most 2000 characters.';
    if (form.researchAreaIds.length > 25) errors.researchAreaIds = 'Select at most 25 research areas.';
    if (form.members.some((member) => !member.userId)) errors.members = 'Choose a person for every member row, or remove the row.';
    const ids = form.members.map((member) => member.userId).filter(Boolean);
    if (new Set(ids).size !== ids.length) errors.members = 'A person can be added only once.';
    const approved = editing && original?.moderationStatus === 'approved';
    if (approved && form.researchAreaIds.length === 0) {
      errors.researchAreaIds = 'An approved project must keep at least one research area.';
    }
    if (approved && form.members.length === 0) {
      errors.members = 'An approved project must keep at least one member.';
    }
    return errors;
  }

  function buildBody() {
    const members = form.members.map((member) => ({ userId: member.userId, memberRole: member.memberRole }));
    const link = form.externalLink.length ? form.externalLink : null;
    if (!editing) {
      const body = {
        departmentId: form.departmentId,
        title: form.title.trim(),
        projectType: form.projectType,
        projectYear: yearValue(form.projectYear),
      };
      if (form.opportunityId) body.opportunityId = form.opportunityId;
      if (form.description.trim()) body.description = form.description.trim();
      if (link) body.externalLink = link;
      if (form.moderationStatus === 'pending') body.moderationStatus = 'pending';
      if (form.researchAreaIds.length) body.researchAreaIds = form.researchAreaIds;
      if (members.length) body.members = members;
      return body;
    }
    const body = {};
    if (form.departmentId !== (original.department?.id || '')) body.departmentId = form.departmentId;
    if ((form.opportunityId || null) !== (original.opportunityId || null)) body.opportunityId = form.opportunityId || null;
    if (form.title.trim() !== original.title) body.title = form.title.trim();
    if ((form.description.trim() || null) !== (original.description || null)) body.description = form.description.trim() || null;
    if (form.projectType !== original.projectType) body.projectType = form.projectType;
    if (yearValue(form.projectYear) !== original.projectYear) body.projectYear = yearValue(form.projectYear);
    if (link !== (original.externalLink || null)) body.externalLink = link;
    if (!sameIds(form.researchAreaIds, (original.researchAreas || []).map((area) => area.id))) {
      body.researchAreaIds = form.researchAreaIds;
    }
    if (memberSignature(members) !== memberSignature(original.members || [])) body.members = members;
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
        ? await updateProject(projectId, body)
        : await createProject(body);
      navigate(`/research-projects/${payload.data.id}`, { state: { notice: payload.message } });
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setFormError(errorText(err, 'The research project could not be saved.'));
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label={editing ? 'Loading research project' : 'Loading the form'} />;
  if (missing) {
    return (
      <section className="panel">
        <h1>Edit research project</h1>
        <p>This research project is not available.</p>
        <Link className="button" to="/research-projects">Back to research projects</Link>
      </section>
    );
  }
  if (forbidden) {
    return (
      <section className="panel">
        <h1>Edit research project</h1>
        <Alert>You cannot edit this research project.</Alert>
        <Link className="button" to={`/research-projects/${projectId}`}>Back to the project</Link>
      </section>
    );
  }
  if (loadError) {
    return (
      <section className="panel">
        <h1>{editing ? 'Edit research project' : 'New research project'}</h1>
        <Alert>{loadError}</Alert>
      </section>
    );
  }

  const peopleOptions = [...people];
  form.members.forEach((member) => {
    if (member.userId && !peopleOptions.some((person) => person.id === member.userId)) {
      peopleOptions.push({ id: member.userId, fullName: member.fullName || 'Listed member' });
    }
  });
  const opportunityOptions = [...opportunities];
  if (form.opportunityId && !opportunityOptions.some((item) => item.id === form.opportunityId)) {
    opportunityOptions.push({ id: form.opportunityId, title: 'Current linked opportunity' });
  }

  return (
    <section className="panel">
      <p className="eyebrow">Research projects</p>
      <h1>{editing ? 'Edit research project' : 'New research project'}</h1>
      <p>
        {editing
          ? 'Moderation is changed from the project page.'
          : 'A new project starts as a draft unless you send it for review. Other people see it after an administrator approves it.'}
      </p>
      <p className="field-hint">An administrator can approve a project only when it has at least one research area and one member.</p>
      {directoryNote ? <p className="field-hint">{directoryNote}</p> : null}
      {formError ? <Alert>{formError}</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField id="departmentId" label="Department" error={fieldErrors.departmentId}>
          <select id="departmentId" value={form.departmentId} onChange={(event) => update('departmentId', event.target.value)}>
            <option value="">Choose a department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.code} — {department.name}</option>
            ))}
          </select>
        </FormField>
        <FormField id="title" label="Title" error={fieldErrors.title}>
          <input id="title" value={form.title} onChange={(event) => update('title', event.target.value)} />
        </FormField>
        <FormField id="projectType" label="Type" error={fieldErrors.projectType}>
          <select id="projectType" value={form.projectType} onChange={(event) => update('projectType', event.target.value)}>
            {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </FormField>
        <FormField id="projectYear" label="Year" error={fieldErrors.projectYear}>
          <input id="projectYear" inputMode="numeric" value={form.projectYear} onChange={(event) => update('projectYear', event.target.value)} />
        </FormField>
        <FormField id="description" label="Description" error={fieldErrors.description}>
          <textarea id="description" rows="6" value={form.description} onChange={(event) => update('description', event.target.value)} />
        </FormField>
        <FormField id="externalLink" label="External link" hint="Optional. Shown as a link when it starts with http:// or https://." error={fieldErrors.externalLink}>
          <input id="externalLink" value={form.externalLink} onChange={(event) => update('externalLink', event.target.value)} />
        </FormField>
        <FormField id="opportunityId" label="Linked opportunity" hint="Optional. Only openings you are allowed to see are listed." error={fieldErrors.opportunityId}>
          <select id="opportunityId" value={form.opportunityId} onChange={(event) => update('opportunityId', event.target.value)}>
            <option value="">None</option>
            {opportunityOptions.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
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
          <legend>Members</legend>
          <p className="field-hint">Faculty and alumni profiles can be added. A person can appear once.</p>
          {form.members.map((member) => (
            <div className="member-row" key={member.key}>
              <div className="field">
                <label htmlFor={`${member.key}-user`}>Person</label>
                <select id={`${member.key}-user`} value={member.userId} onChange={(event) => updateMember(member.key, 'userId', event.target.value)}>
                  <option value="">Choose a person</option>
                  {peopleOptions.map((person) => (
                    <option key={person.id} value={person.id}>{person.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${member.key}-role`}>Role</label>
                <select id={`${member.key}-role`} value={member.memberRole} onChange={(event) => updateMember(member.key, 'memberRole', event.target.value)}>
                  {MEMBER_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => update('members', form.members.filter((item) => item.key !== member.key))}
              >
                Remove
              </button>
            </div>
          ))}
          <button className="button button-secondary" type="button" onClick={() => update('members', [...form.members, nextMember()])}>
            Add member
          </button>
          {fieldErrors.members ? <p className="field-error">{fieldErrors.members}</p> : null}
        </fieldset>
        <div className="button-row">
          <button className="button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save project'}</button>
          <Link className="button button-secondary" to={editing ? `/research-projects/${projectId}` : '/research-projects'}>Cancel</Link>
        </div>
      </form>
    </section>
  );
}
