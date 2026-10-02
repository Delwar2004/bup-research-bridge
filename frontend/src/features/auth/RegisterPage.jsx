import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { listDepartments, listResearchAreas } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'alumni', label: 'Alumni' },
];

const EMPTY = {
  fullName: '',
  email: '',
  password: '',
  role: 'student',
  departmentId: '',
  batch: '',
  designation: '',
  currentOrganization: '',
  mentoringAvailability: false,
  bio: '',
  profilePhotoUrl: '',
  researchAreaIds: [],
};

export function RegisterPage() {
  const { register } = useSession();
  const [form, setForm] = useState(EMPTY);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [referenceError, setReferenceError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(null);
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
        if (!cancelled) {
          setReferenceError(err instanceof ApiError ? err.message : 'Reference data could not be loaded.');
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function clientErrors() {
    const errors = {};
    if (!form.fullName.trim() || form.fullName.trim().length > 200) {
      errors.fullName = 'Name is required and must be at most 200 characters.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter an email address.';
    }
    if (form.password.length < 8 || form.password.length > 72) {
      errors.password = 'Password must be 8 to 72 characters.';
    }
    if (!form.departmentId) errors.departmentId = 'Choose a department.';
    if ((form.role === 'student' || form.role === 'alumni') && (!form.batch.trim() || form.batch.trim().length > 32)) {
      errors.batch = 'Batch is required and must be at most 32 characters.';
    }
    if (form.role === 'faculty' && (!form.designation.trim() || form.designation.trim().length > 200)) {
      errors.designation = 'Designation is required and must be at most 200 characters.';
    }
    return errors;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    setSuccess(null);
    const errors = clientErrors();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    const body = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      departmentId: form.departmentId,
    };
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

    setSubmitting(true);
    try {
      const payload = await register(body);
      setSuccess(payload);
      setForm((current) => ({ ...current, password: '' }));
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details?.fields)) {
        const next = {};
        err.details.fields.forEach((item) => {
          next[item.field] = item.message;
        });
        setFieldErrors(next);
      }
      setFormError(err instanceof ApiError ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel narrow">
      <h1>Create account</h1>
      <p>Students, faculty, and alumni can register. The account stays pending until an administrator activates it.</p>
      {referenceError ? <Alert>{referenceError}</Alert> : null}
      {formError ? <Alert>{formError}</Alert> : null}
      {success ? (
        <Alert tone="success">
          {success.message} Status: {success.data?.status}. You can sign in after an administrator activates the account.
        </Alert>
      ) : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField id="fullName" label="Full name" error={fieldErrors.fullName}>
          <input id="fullName" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} required />
        </FormField>
        <FormField id="email" label="Email" error={fieldErrors.email}>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} required />
        </FormField>
        <FormField id="password" label="Password" hint="8 to 72 characters." error={fieldErrors.password}>
          <input id="password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} required />
        </FormField>
        <FormField id="role" label="Role" error={fieldErrors.role}>
          <select id="role" value={form.role} onChange={(event) => update('role', event.target.value)}>
            {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
        </FormField>
        <FormField id="departmentId" label="Department" error={fieldErrors.departmentId}>
          <select id="departmentId" value={form.departmentId} onChange={(event) => update('departmentId', event.target.value)} required>
            <option value="">Select a department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.code} — {department.name}</option>
            ))}
          </select>
        </FormField>
        {form.role === 'student' || form.role === 'alumni' ? (
          <FormField id="batch" label="Batch" error={fieldErrors.batch}>
            <input id="batch" value={form.batch} onChange={(event) => update('batch', event.target.value)} required />
          </FormField>
        ) : null}
        {form.role === 'faculty' ? (
          <FormField id="designation" label="Designation" error={fieldErrors.designation}>
            <input id="designation" value={form.designation} onChange={(event) => update('designation', event.target.value)} required />
          </FormField>
        ) : null}
        {form.role === 'faculty' || form.role === 'alumni' ? (
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
        {form.role === 'alumni' ? (
          <FormField id="currentOrganization" label="Current organization" error={fieldErrors.currentOrganization}>
            <input id="currentOrganization" value={form.currentOrganization} onChange={(event) => update('currentOrganization', event.target.value)} />
          </FormField>
        ) : null}
        <FormField id="researchAreaIds" label="Research areas" hint="Optional. Hold Ctrl or Command to select more than one." error={fieldErrors.researchAreaIds}>
          <select
            id="researchAreaIds"
            multiple
            value={form.researchAreaIds}
            onChange={(event) => update('researchAreaIds', Array.from(event.target.selectedOptions, (option) => option.value))}
          >
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
        </FormField>
        <FormField id="bio" label="Bio" error={fieldErrors.bio}>
          <textarea id="bio" rows="4" value={form.bio} onChange={(event) => update('bio', event.target.value)} />
        </FormField>
        <FormField id="profilePhotoUrl" label="Profile photo URL" error={fieldErrors.profilePhotoUrl}>
          <input id="profilePhotoUrl" type="url" value={form.profilePhotoUrl} onChange={(event) => update('profilePhotoUrl', event.target.value)} />
        </FormField>
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="form-note">Already registered? <Link to="/login">Sign in</Link>.</p>
    </section>
  );
}
