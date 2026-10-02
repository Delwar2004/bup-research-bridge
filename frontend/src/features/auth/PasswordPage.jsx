import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { changePassword } from '../../api/auth';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';

export function PasswordPage() {
  const { endSession } = useSession();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function clientErrors() {
    const errors = {};
    if (!currentPassword) errors.currentPassword = 'Enter your current password.';
    if (newPassword.length < 8 || newPassword.length > 72) {
      errors.newPassword = 'Password must be 8 to 72 characters.';
    } else if (newPassword === currentPassword) {
      errors.newPassword = 'New password must be different from the current password.';
    }
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Enter the same new password again.';
    }
    return errors;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    const errors = clientErrors();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      const payload = await changePassword({ currentPassword, newPassword });
      endSession(payload.message || 'Password updated. Please log in again.');
      navigate('/login', { replace: true });
    } catch (err) {
      const next = {};
      if (err instanceof ApiError && Array.isArray(err.details?.fields)) {
        err.details.fields.forEach((item) => {
          next[item.field] = item.message;
        });
      }
      setFieldErrors(next);
      setFormError(err instanceof ApiError ? err.message : 'The password could not be changed.');
      setSubmitting(false);
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">Account</p>
      <h1>Change password</h1>
      <p>A successful change signs you out everywhere. You will need to sign in again.</p>
      {formError ? <Alert>{formError}</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField id="currentPassword" label="Current password" error={fieldErrors.currentPassword}>
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </FormField>
        <FormField id="newPassword" label="New password" hint="8 to 72 characters." error={fieldErrors.newPassword}>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </FormField>
        <FormField id="confirmPassword" label="Confirm new password" error={fieldErrors.confirmPassword}>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </FormField>
        <button className="button" type="submit" disabled={submitting}>
          {submitting ? 'Updating password…' : 'Update password'}
        </button>
      </form>
    </section>
  );
}
