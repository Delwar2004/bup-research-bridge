import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { currentUser } from '../../api/auth';
import { replaceResearchAreas, updateProfile } from '../../api/profile';
import { listDepartments, listResearchAreas } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;

function formFromAccount(account) {
  return {
    fullName: account.fullName || '',
    email: account.email || '',
    departmentId: account.department?.id || '',
    batch: account.batch || '',
    designation: account.designation || '',
    mentoringAvailability: Boolean(account.mentoringAvailability),
    currentOrganization: account.currentOrganization || '',
    profilePhotoUrl: account.profilePhotoUrl || '',
    bio: account.bio || '',
    researchAreaIds: (account.researchAreas || []).map((area) => area.id),
  };
}

function nullableText(value) {
  const text = value.trim();
  return text || null;
}

function sameIds(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function fieldMap(err) {
  const next = {};
  if (err instanceof ApiError && Array.isArray(err.details?.fields)) {
    err.details.fields.forEach((item) => {
      next[item.field] = item.message;
    });
  }
  return next;
}

export function ProfilePage() {
  const { applyAccount } = useSession();
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setFormError('');
    setSuccess('');
    try {
      const me = await currentUser();
      const nextAccount = me.data;
      const departmentPayload = await listDepartments();
      let nextAreas = [];
      if (nextAccount.role !== 'admin') {
        const areaPayload = await listResearchAreas();
        nextAreas = areaPayload.data || [];
      }
      setAccount(nextAccount);
      applyAccount(nextAccount);
      setDepartments(departmentPayload.data || []);
      setAreas(nextAreas);
      setForm(formFromAccount(nextAccount));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Your profile could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [applyAccount]);

  useEffect(() => {
    load();
  }, [load]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function toggleArea(id) {
    setForm((current) => {
      const selected = current.researchAreaIds.includes(id)
        ? current.researchAreaIds.filter((item) => item !== id)
        : [...current.researchAreaIds, id];
      return { ...current, researchAreaIds: selected };
    });
  }

  function clientErrors(role) {
    const errors = {};
    const name = form.fullName.trim();
    if (!name || name.length > 200) {
      errors.fullName = 'Name is required and must be at most 200 characters.';
    }
    const email = form.email.trim();
    if (email.length < 3 || email.length > 320 || !EMAIL_RE.test(email)) {
      errors.email = 'Enter an email address.';
    }
    if (role === 'admin') return errors;
    if (!form.departmentId) errors.departmentId = 'Choose a department.';
    if ((role === 'student' || role === 'alumni') && (!form.batch.trim() || form.batch.trim().length > 32)) {
      errors.batch = 'Batch is required and must be at most 32 characters.';
    }
    if (role === 'faculty' && (!form.designation.trim() || form.designation.trim().length > 200)) {
      errors.designation = 'Designation is required and must be at most 200 characters.';
    }
    if (form.currentOrganization.trim().length > 200) {
      errors.currentOrganization = 'Organization must be at most 200 characters.';
    }
    if (form.profilePhotoUrl.trim().length > 2000) {
      errors.profilePhotoUrl = 'Photo URL must be at most 2000 characters.';
    }
    if (form.bio.trim().length > 5000) {
      errors.bio = 'Bio must be at most 5000 characters.';
    }
    if (form.researchAreaIds.length > 25) {
      errors.researchAreaIds = 'Select at most 25 research areas.';
    }
    return errors;
  }

  function buildPatch(role) {
    const patch = {};
    if (form.fullName.trim() !== account.fullName) patch.fullName = form.fullName.trim();
    if (form.email.trim() !== account.email) patch.email = form.email.trim();
    if (role === 'admin') return patch;
    if (form.departmentId !== (account.department?.id || '')) patch.departmentId = form.departmentId;
    if (role === 'student' || role === 'alumni') {
      if (form.batch.trim() !== (account.batch || '')) patch.batch = form.batch.trim();
    }
    if (role === 'faculty' && form.designation.trim() !== (account.designation || '')) {
      patch.designation = form.designation.trim();
    }
    if (role === 'faculty' || role === 'alumni') {
      if (form.mentoringAvailability !== Boolean(account.mentoringAvailability)) {
        patch.mentoringAvailability = form.mentoringAvailability;
      }
    }
    if (role === 'alumni' && nullableText(form.currentOrganization) !== (account.currentOrganization ?? null)) {
      patch.currentOrganization = nullableText(form.currentOrganization);
    }
    if (nullableText(form.profilePhotoUrl) !== (account.profilePhotoUrl ?? null)) {
      patch.profilePhotoUrl = nullableText(form.profilePhotoUrl);
    }
    if (nullableText(form.bio) !== (account.bio ?? null)) {
      patch.bio = nullableText(form.bio);
    }
    return patch;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    setSuccess('');
    const role = account.role;
    const errors = clientErrors(role);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    const patch = buildPatch(role);
    const currentAreaIds = (account.researchAreas || []).map((area) => area.id);
    const areasChanged = role !== 'admin' && !sameIds(form.researchAreaIds, currentAreaIds);
    if (!Object.keys(patch).length && !areasChanged) {
      setSuccess('There are no changes to save.');
      return;
    }

    setSubmitting(true);
    try {
      const messages = [];
      if (Object.keys(patch).length) {
        const payload = await updateProfile(patch);
        messages.push(payload.message);
      }
      if (areasChanged) {
        const payload = await replaceResearchAreas(form.researchAreaIds);
        messages.push(payload.message);
      }
      const me = await currentUser();
      setAccount(me.data);
      applyAccount(me.data);
      setForm(formFromAccount(me.data));
      setSuccess(messages.filter(Boolean).join(' '));
    } catch (err) {
      setFieldErrors(fieldMap(err));
      setFormError(err instanceof ApiError ? err.message : 'The profile could not be saved.');
      try {
        const me = await currentUser();
        setAccount(me.data);
        applyAccount(me.data);
      } catch {
        // The form keeps the values the user entered.
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Loading your profile" />;

  if (loadError) {
    return (
      <section className="panel">
        <h1>Your profile</h1>
        <Alert>{loadError}</Alert>
        <button className="button" type="button" onClick={load}>Try again</button>
      </section>
    );
  }

  if (!account || !form) {
    return (
      <section className="panel">
        <h1>Your profile</h1>
        <p>No profile was returned for this account.</p>
      </section>
    );
  }

  const role = account.role;
  const knownDepartment = account.department
    && !departments.some((department) => department.id === account.department.id);
  const catalogIds = new Set(areas.map((area) => area.id));
  const areaChoices = [
    ...areas,
    ...(account.researchAreas || []).filter((area) => !catalogIds.has(area.id)),
  ];
  const photo = account.profilePhotoUrl;
  const showPhoto = typeof photo === 'string' && /^https?:\/\//i.test(photo);

  return (
    <section className="panel">
      <p className="eyebrow">Account</p>
      <h1>Your profile</h1>
      <p>Update the details this role is allowed to change. Role and account status stay with the administrator.</p>
      {showPhoto ? <img className="profile-photo" src={photo} alt="" /> : null}
      <dl className="meta-list">
        <div>
          <dt>Role</dt>
          <dd>{role}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{account.status}</dd>
        </div>
        <div>
          <dt>Last sign-in</dt>
          <dd>{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : 'None recorded'}</dd>
        </div>
      </dl>
      {formError ? <Alert>{formError}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField id="fullName" label="Full name" error={fieldErrors.fullName}>
          <input id="fullName" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} required />
        </FormField>
        <FormField id="email" label="Email" error={fieldErrors.email}>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} required />
        </FormField>
        {role !== 'admin' ? (
          <FormField id="departmentId" label="Department" error={fieldErrors.departmentId}>
            <select id="departmentId" value={form.departmentId} onChange={(event) => update('departmentId', event.target.value)} required>
              <option value="">Select a department</option>
              {knownDepartment ? (
                <option value={account.department.id}>{account.department.code} — {account.department.name}</option>
              ) : null}
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.code} — {department.name}</option>
              ))}
            </select>
          </FormField>
        ) : null}
        {departments.length === 0 && role !== 'admin' ? <p>No departments are available.</p> : null}
        {role === 'student' || role === 'alumni' ? (
          <FormField id="batch" label="Batch" error={fieldErrors.batch}>
            <input id="batch" value={form.batch} onChange={(event) => update('batch', event.target.value)} required />
          </FormField>
        ) : null}
        {role === 'faculty' ? (
          <FormField id="designation" label="Designation" error={fieldErrors.designation}>
            <input id="designation" value={form.designation} onChange={(event) => update('designation', event.target.value)} required />
          </FormField>
        ) : null}
        {role === 'faculty' || role === 'alumni' ? (
          <div className="field checkbox-field">
            <label htmlFor="mentoringAvailability">
              <input
                id="mentoringAvailability"
                type="checkbox"
                checked={form.mentoringAvailability}
                onChange={(event) => update('mentoringAvailability', event.target.checked)}
              />
              Available for mentorship
            </label>
          </div>
        ) : null}
        {role === 'alumni' ? (
          <FormField id="currentOrganization" label="Current organization" error={fieldErrors.currentOrganization}>
            <input id="currentOrganization" value={form.currentOrganization} onChange={(event) => update('currentOrganization', event.target.value)} />
          </FormField>
        ) : null}
        {role !== 'admin' ? (
          <>
            <FormField id="profilePhotoUrl" label="Profile photo URL" hint="A web address. This app does not upload files." error={fieldErrors.profilePhotoUrl}>
              <input id="profilePhotoUrl" type="url" value={form.profilePhotoUrl} onChange={(event) => update('profilePhotoUrl', event.target.value)} />
            </FormField>
            <FormField id="bio" label="Bio" error={fieldErrors.bio}>
              <textarea id="bio" rows="4" value={form.bio} onChange={(event) => update('bio', event.target.value)} />
            </FormField>
            <fieldset className="field">
              <legend>Research areas</legend>
              <p className="field-hint" id="research-areas-hint">Saving replaces the current list. You can clear every area.</p>
              {areaChoices.length === 0 ? (
                <p>No active research areas are available.</p>
              ) : (
                <ul className="choice-list" aria-describedby="research-areas-hint">
                  {areaChoices.map((area) => (
                    <li key={area.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={form.researchAreaIds.includes(area.id)}
                          onChange={() => toggleArea(area.id)}
                        />
                        {area.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {fieldErrors.researchAreaIds ? <p className="field-error">{fieldErrors.researchAreaIds}</p> : null}
            </fieldset>
          </>
        ) : (
          <p>Administrator accounts do not have a department, biography, or research-area list.</p>
        )}
        <div className="button-row">
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save profile'}
          </button>
          <Link className="button button-secondary" to="/account/password">Change password</Link>
        </div>
      </form>
    </section>
  );
}
