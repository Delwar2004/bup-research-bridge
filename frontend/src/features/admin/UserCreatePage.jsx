import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUser } from '../../api/admin';
import { listDepartments, listResearchAreas } from '../../api/reference';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';
import { AdminNav } from './AdminNav';

const ROLES = ['student', 'faculty', 'alumni', 'admin'];
const STATUSES = ['pending', 'active', 'suspended', 'rejected'];
const EMPTY = {
  fullName: '',
  email: '',
  password: '',
  role: 'student',
  status: 'pending',
  departmentId: '',
  batch: '',
  designation: '',
  currentOrganization: '',
  mentoringAvailability: false,
  bio: '',
  profilePhotoUrl: '',
  researchAreaIds: [],
};

export function UserCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [referenceError, setReferenceError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [departmentPayload, areaPayload] = await Promise.all([
          listDepartments(),
          listResearchAreas(),
        ]);
        if (cancelled) return;
        setDepartments(departmentPayload.data || []);
        setAreas(areaPayload.data || []);
      } catch (err) {
        if (!cancelled) setReferenceError(errorText(err, 'Reference data could not be loaded.'));
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

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

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    setFieldErrors({});
    const body = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      status: form.status,
    };
    if (form.role !== 'admin') {
      body.departmentId = form.departmentId;
      if (form.bio.trim()) body.bio = form.bio.trim();
      if (form.profilePhotoUrl.trim()) body.profilePhotoUrl = form.profilePhotoUrl.trim();
      if (form.researchAreaIds.length) body.researchAreaIds = form.researchAreaIds;
      if (form.role === 'student' || form.role === 'alumni') body.batch = form.batch.trim();
      if (form.role === 'faculty') {
        body.designation = form.designation.trim();
        body.mentoringAvailability = form.mentoringAvailability;
      }
      if (form.role === 'alumni') {
        if (form.currentOrganization.trim()) body.currentOrganization = form.currentOrganization.trim();
        body.mentoringAvailability = form.mentoringAvailability;
      }
    }
    setSubmitting(true);
    try {
      const payload = await createUser(body);
      navigate(`/admin/users/${payload.data.id}`, { replace: true });
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setFormError(errorText(err, 'The account could not be created.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Administrator</p>
      <h1>Create account</h1>
      <AdminNav />
      <p><Link to="/admin/users">Back to accounts</Link></p>
      <p>The password is stored as a hash and is not shown again. There is no password-reset action. A new account stays pending unless you choose another status.</p>
      {referenceError ? <Alert>{referenceError}</Alert> : null}
      {formError ? <Alert>{formError}</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField id="create-name" label="Full name" error={fieldErrors.fullName}>
          <input id="create-name" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} required />
        </FormField>
        <FormField id="create-email" label="Email" error={fieldErrors.email}>
          <input id="create-email" type="email" autoComplete="off" value={form.email} onChange={(event) => update('email', event.target.value)} required />
        </FormField>
        <FormField id="create-password" label="Password" hint="8 to 72 characters." error={fieldErrors.password}>
          <input id="create-password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} required />
        </FormField>
        <FormField id="create-role" label="Role" error={fieldErrors.role}>
          <select id="create-role" value={form.role} onChange={(event) => update('role', event.target.value)}>
            {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        </FormField>
        <FormField id="create-status" label="Status" error={fieldErrors.status}>
          <select id="create-status" value={form.status} onChange={(event) => update('status', event.target.value)}>
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </FormField>
        {form.role !== 'admin' ? (
          <>
            <FormField id="create-department" label="Department" error={fieldErrors.departmentId}>
              <select id="create-department" value={form.departmentId} onChange={(event) => update('departmentId', event.target.value)}>
                <option value="">Choose a department</option>
                {departments.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
              </select>
            </FormField>
            {form.role === 'student' || form.role === 'alumni' ? (
              <FormField id="create-batch" label="Batch" error={fieldErrors.batch}>
                <input id="create-batch" value={form.batch} onChange={(event) => update('batch', event.target.value)} />
              </FormField>
            ) : null}
            {form.role === 'faculty' ? (
              <FormField id="create-designation" label="Designation" error={fieldErrors.designation}>
                <input id="create-designation" value={form.designation} onChange={(event) => update('designation', event.target.value)} />
              </FormField>
            ) : null}
            {form.role === 'alumni' ? (
              <FormField id="create-organization" label="Current organization" error={fieldErrors.currentOrganization}>
                <input id="create-organization" value={form.currentOrganization} onChange={(event) => update('currentOrganization', event.target.value)} />
              </FormField>
            ) : null}
            {form.role === 'faculty' || form.role === 'alumni' ? (
              <FormField id="create-mentoring" label="Mentoring availability">
                <select id="create-mentoring" value={form.mentoringAvailability ? 'true' : 'false'} onChange={(event) => update('mentoringAvailability', event.target.value === 'true')}>
                  <option value="false">Not available</option>
                  <option value="true">Available</option>
                </select>
              </FormField>
            ) : null}
            <FormField id="create-bio" label="Bio" error={fieldErrors.bio}>
              <textarea id="create-bio" rows="4" value={form.bio} onChange={(event) => update('bio', event.target.value)} />
            </FormField>
            <FormField id="create-photo" label="Profile photo URL" error={fieldErrors.profilePhotoUrl}>
              <input id="create-photo" type="url" value={form.profilePhotoUrl} onChange={(event) => update('profilePhotoUrl', event.target.value)} />
            </FormField>
            <fieldset className="field">
              <legend>Research areas</legend>
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
              {fieldErrors.researchAreaIds ? <p className="field-error">{fieldErrors.researchAreaIds}</p> : null}
            </fieldset>
          </>
        ) : null}
        <div className="button-row">
          <button className="button" type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create account'}</button>
        </div>
      </form>
    </section>
  );
}
