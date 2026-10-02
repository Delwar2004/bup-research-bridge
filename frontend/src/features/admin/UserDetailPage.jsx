import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { changeUserRole, getUser, updateUser, updateUserProfile } from '../../api/admin';
import { listDepartments } from '../../api/reference';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';
import { AdminNav } from './AdminNav';

const ROLES = ['student', 'faculty', 'alumni', 'admin'];
const STATUSES = ['pending', 'active', 'suspended', 'rejected'];

function nullable(value) {
  const text = value.trim();
  return text || null;
}

function accountForm(account) {
  return {
    fullName: account.fullName || '',
    email: account.email || '',
    status: account.status || 'pending',
  };
}

function profileForm(account) {
  return {
    departmentId: account.department?.id || '',
    batch: account.batch || '',
    designation: account.designation || '',
    mentoringAvailability: Boolean(account.mentoringAvailability),
    currentOrganization: account.currentOrganization || '',
    profilePhotoUrl: account.profilePhotoUrl || '',
    bio: account.bio || '',
  };
}

function roleProfile(role, form) {
  const profile = { departmentId: form.departmentId };
  if (role === 'student' || role === 'alumni') profile.batch = form.batch.trim();
  if (role === 'faculty') {
    profile.designation = form.designation.trim();
    profile.mentoringAvailability = form.mentoringAvailability;
  }
  if (role === 'alumni') {
    profile.mentoringAvailability = form.mentoringAvailability;
    if (form.currentOrganization.trim()) profile.currentOrganization = form.currentOrganization.trim();
  }
  if (form.profilePhotoUrl.trim()) profile.profilePhotoUrl = form.profilePhotoUrl.trim();
  if (form.bio.trim()) profile.bio = form.bio.trim();
  return profile;
}

export function UserDetailPage() {
  const { userId } = useParams();
  const { user } = useSession();
  const [account, setAccount] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [accountDraft, setAccountDraft] = useState(null);
  const [profileDraft, setProfileDraft] = useState(null);
  const [role, setRole] = useState('student');
  const [roleDraft, setRoleDraft] = useState(profileForm({}));
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, setPending] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setMissing(false);
      setError('');
      setNotice('');
      try {
        const [userPayload, departmentPayload] = await Promise.all([
          getUser(userId),
          listDepartments(),
        ]);
        if (cancelled) return;
        const next = userPayload.data;
        setAccount(next);
        setAccountDraft(accountForm(next));
        setProfileDraft(profileForm(next));
        setRole(next.role);
        setRoleDraft(profileForm(next));
        setDepartments(departmentPayload.data || []);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setMissing(true);
        else setError(errorText(err, 'This account could not be loaded.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  function applyAccount(next, message) {
    setAccount(next);
    setAccountDraft(accountForm(next));
    setProfileDraft(profileForm(next));
    setRole(next.role);
    setRoleDraft(profileForm(next));
    setNotice(message);
    setFieldErrors({});
  }

  async function saveAccount(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const body = {};
    if (accountDraft.fullName.trim() !== account.fullName) body.fullName = accountDraft.fullName.trim();
    if (accountDraft.email.trim() !== account.email) body.email = accountDraft.email.trim();
    if (accountDraft.status !== account.status) body.status = accountDraft.status;
    if (!Object.keys(body).length) {
      setNotice('No account changes to save.');
      return;
    }
    setPending('account');
    try {
      const payload = await updateUser(account.id, body);
      applyAccount(payload.data, 'Account updated.');
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(errorText(err, 'The account could not be updated.'));
    } finally {
      setPending('');
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const body = {};
    if (profileDraft.departmentId !== (account.department?.id || '')) body.departmentId = profileDraft.departmentId;
    if ((account.role === 'student' || account.role === 'alumni') && profileDraft.batch.trim() !== (account.batch || '')) {
      body.batch = profileDraft.batch.trim();
    }
    if (account.role === 'faculty' && profileDraft.designation.trim() !== (account.designation || '')) {
      body.designation = profileDraft.designation.trim();
    }
    if ((account.role === 'faculty' || account.role === 'alumni') && profileDraft.mentoringAvailability !== Boolean(account.mentoringAvailability)) {
      body.mentoringAvailability = profileDraft.mentoringAvailability;
    }
    if (account.role === 'alumni' && nullable(profileDraft.currentOrganization) !== (account.currentOrganization ?? null)) {
      body.currentOrganization = nullable(profileDraft.currentOrganization);
    }
    if (nullable(profileDraft.profilePhotoUrl) !== (account.profilePhotoUrl ?? null)) {
      body.profilePhotoUrl = nullable(profileDraft.profilePhotoUrl);
    }
    if (nullable(profileDraft.bio) !== (account.bio ?? null)) body.bio = nullable(profileDraft.bio);
    if (!Object.keys(body).length) {
      setNotice('No profile changes to save.');
      return;
    }
    setPending('profile');
    try {
      const payload = await updateUserProfile(account.id, body);
      applyAccount(payload.data, 'Profile updated.');
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(errorText(err, 'The profile could not be updated.'));
    } finally {
      setPending('');
    }
  }

  async function saveRole(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const body = { role };
    if (role !== 'admin' && role !== account.role) body.profile = roleProfile(role, roleDraft);
    setPending('role');
    try {
      const payload = await changeUserRole(account.id, body);
      applyAccount(payload.data, payload.data.role === account.role ? 'The account already has that role.' : 'Role updated.');
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(errorText(err, 'The role could not be changed.'));
    } finally {
      setPending('');
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <AdminNav />
        <LoadingState label="Loading account" />
      </section>
    );
  }
  if (missing) {
    return (
      <section className="panel">
        <AdminNav />
        <h1>Account not found</h1>
        <p><Link to="/admin/users">Back to accounts</Link></p>
      </section>
    );
  }
  if (!account || !accountDraft || !profileDraft) {
    return (
      <section className="panel">
        <AdminNav />
        {error ? <Alert>{error}</Alert> : <Alert>This account could not be loaded.</Alert>}
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="eyebrow">Administrator</p>
      <h1>{account.fullName}</h1>
      <AdminNav />
      <p><Link to="/admin/users">Back to accounts</Link></p>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <dl className="meta-list">
        <div><dt>Email</dt><dd>{account.email}</dd></div>
        <div><dt>Role</dt><dd>{account.role}</dd></div>
        <div><dt>Status</dt><dd>{account.status}</dd></div>
        <div><dt>Department</dt><dd>{account.department ? `${account.department.code} · ${account.department.name}` : 'None'}</dd></div>
        <div><dt>Last login</dt><dd>{account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString() : 'None recorded'}</dd></div>
        {account.batch ? <div><dt>Batch</dt><dd>{account.batch}</dd></div> : null}
        {account.designation ? <div><dt>Designation</dt><dd>{account.designation}</dd></div> : null}
        {account.role === 'faculty' || account.role === 'alumni' ? (
          <div><dt>Mentoring</dt><dd>{account.mentoringAvailability ? 'Available' : 'Not available'}</dd></div>
        ) : null}
        {account.currentOrganization ? <div><dt>Organization</dt><dd>{account.currentOrganization}</dd></div> : null}
      </dl>
      {account.bio ? <p className="prose">{account.bio}</p> : null}
      {account.researchAreas?.length ? (
        <ul className="tag-list">
          {account.researchAreas.map((area) => <li key={area.id}><span className="tag">{area.name}</span></li>)}
        </ul>
      ) : null}
      <p className="field-hint">Research-area links on an existing account are changed by that person. This screen does not replace them.</p>
      {account.role === 'alumni' && Array.isArray(account.experiences) ? (
        <div className="related-section">
          <h2>Experiences</h2>
          {account.experiences.length === 0 ? <p className="empty-state">No experiences are recorded.</p> : (
            <ul className="record-list">
              {account.experiences.map((item) => (
                <li key={item.id}>
                  <h3>{item.organization}</h3>
                  <p className="person-meta">{item.positionTitle || 'No title'}{item.isCurrent ? ' · Current' : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <form className="related-section" onSubmit={saveAccount}>
        <h2>Account</h2>
        {user?.id === account.id ? <p>A status other than active revokes your own sign-in sessions.</p> : null}
        <FormField id="account-name" label="Full name" error={fieldErrors.fullName}>
          <input id="account-name" value={accountDraft.fullName} onChange={(event) => setAccountDraft((current) => ({ ...current, fullName: event.target.value }))} />
        </FormField>
        <FormField id="account-email" label="Email" error={fieldErrors.email}>
          <input id="account-email" type="email" value={accountDraft.email} onChange={(event) => setAccountDraft((current) => ({ ...current, email: event.target.value }))} />
        </FormField>
        <FormField id="account-status" label="Status" error={fieldErrors.status}>
          <select id="account-status" value={accountDraft.status} onChange={(event) => setAccountDraft((current) => ({ ...current, status: event.target.value }))}>
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </FormField>
        <button className="button" type="submit" disabled={pending === 'account'}>{pending === 'account' ? 'Saving…' : 'Save account'}</button>
      </form>

      {account.role !== 'admin' ? (
        <form className="related-section" onSubmit={saveProfile}>
          <h2>Role record</h2>
          <p>These fields belong to the current {account.role} record. Name and email are saved with the account form.</p>
          <FormField id="profile-department" label="Department" error={fieldErrors.departmentId}>
            <select id="profile-department" value={profileDraft.departmentId} onChange={(event) => setProfileDraft((current) => ({ ...current, departmentId: event.target.value }))}>
              <option value="">Choose a department</option>
              {departments.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
            </select>
          </FormField>
          {account.role === 'student' || account.role === 'alumni' ? (
            <FormField id="profile-batch" label="Batch" error={fieldErrors.batch}>
              <input id="profile-batch" value={profileDraft.batch} onChange={(event) => setProfileDraft((current) => ({ ...current, batch: event.target.value }))} />
            </FormField>
          ) : null}
          {account.role === 'faculty' ? (
            <FormField id="profile-designation" label="Designation" error={fieldErrors.designation}>
              <input id="profile-designation" value={profileDraft.designation} onChange={(event) => setProfileDraft((current) => ({ ...current, designation: event.target.value }))} />
            </FormField>
          ) : null}
          {account.role === 'alumni' ? (
            <FormField id="profile-organization" label="Current organization" error={fieldErrors.currentOrganization}>
              <input id="profile-organization" value={profileDraft.currentOrganization} onChange={(event) => setProfileDraft((current) => ({ ...current, currentOrganization: event.target.value }))} />
            </FormField>
          ) : null}
          {account.role === 'faculty' || account.role === 'alumni' ? (
            <FormField id="profile-mentoring" label="Mentoring availability" error={fieldErrors.mentoringAvailability}>
              <select id="profile-mentoring" value={profileDraft.mentoringAvailability ? 'true' : 'false'} onChange={(event) => setProfileDraft((current) => ({ ...current, mentoringAvailability: event.target.value === 'true' }))}>
                <option value="false">Not available</option>
                <option value="true">Available</option>
              </select>
            </FormField>
          ) : null}
          <FormField id="profile-photo" label="Profile photo URL" error={fieldErrors.profilePhotoUrl}>
            <input id="profile-photo" type="url" value={profileDraft.profilePhotoUrl} onChange={(event) => setProfileDraft((current) => ({ ...current, profilePhotoUrl: event.target.value }))} />
          </FormField>
          <FormField id="profile-bio" label="Bio" error={fieldErrors.bio}>
            <textarea id="profile-bio" rows="4" value={profileDraft.bio} onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))} />
          </FormField>
          <button className="button" type="submit" disabled={pending === 'profile'}>{pending === 'profile' ? 'Saving…' : 'Save role record'}</button>
        </form>
      ) : null}

      <form className="related-section" onSubmit={saveRole}>
        <h2>Role</h2>
        <p>The previous role record is kept. A new student, faculty, or alumni record is created only when that person does not already have one.</p>
        {user?.id === account.id ? <p>Changing your own role removes this administration access after the next sign-in.</p> : null}
        <FormField id="role-next" label="Role" error={fieldErrors.role}>
          <select id="role-next" value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </FormField>
        {role !== 'admin' && role !== account.role ? (
          <>
            <FormField id="role-department" label="Department" error={fieldErrors['profile.departmentId'] || fieldErrors.departmentId}>
              <select id="role-department" value={roleDraft.departmentId} onChange={(event) => setRoleDraft((current) => ({ ...current, departmentId: event.target.value }))}>
                <option value="">Choose a department</option>
                {departments.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
              </select>
            </FormField>
            {role === 'student' || role === 'alumni' ? (
              <FormField id="role-batch" label="Batch" error={fieldErrors['profile.batch'] || fieldErrors.batch}>
                <input id="role-batch" value={roleDraft.batch} onChange={(event) => setRoleDraft((current) => ({ ...current, batch: event.target.value }))} />
              </FormField>
            ) : null}
            {role === 'faculty' ? (
              <FormField id="role-designation" label="Designation" error={fieldErrors['profile.designation'] || fieldErrors.designation}>
                <input id="role-designation" value={roleDraft.designation} onChange={(event) => setRoleDraft((current) => ({ ...current, designation: event.target.value }))} />
              </FormField>
            ) : null}
            {role === 'alumni' ? (
              <FormField id="role-organization" label="Current organization" error={fieldErrors['profile.currentOrganization']}>
                <input id="role-organization" value={roleDraft.currentOrganization} onChange={(event) => setRoleDraft((current) => ({ ...current, currentOrganization: event.target.value }))} />
              </FormField>
            ) : null}
            {role === 'faculty' || role === 'alumni' ? (
              <FormField id="role-mentoring" label="Mentoring availability">
                <select id="role-mentoring" value={roleDraft.mentoringAvailability ? 'true' : 'false'} onChange={(event) => setRoleDraft((current) => ({ ...current, mentoringAvailability: event.target.value === 'true' }))}>
                  <option value="false">Not available</option>
                  <option value="true">Available</option>
                </select>
              </FormField>
            ) : null}
          </>
        ) : null}
        <button className="button" type="submit" disabled={pending === 'role'}>{pending === 'role' ? 'Saving…' : 'Save role'}</button>
      </form>
    </section>
  );
}
