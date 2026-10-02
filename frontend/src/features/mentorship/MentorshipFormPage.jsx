import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { createMentorshipRequest } from '../../api/mentorship';
import { listOpportunities } from '../../api/opportunities';
import { getAlumni, getFaculty } from '../../api/people';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';

export function MentorshipFormPage() {
  const [searchParams] = useSearchParams();
  const mentorUserId = searchParams.get('mentorUserId') || '';
  const requestedOpportunityId = searchParams.get('opportunityId') || '';
  const navigate = useNavigate();
  const [mentor, setMentor] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [opportunityId, setOpportunityId] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [directoryNote, setDirectoryNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [missingMentor, setMissingMentor] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError('');
      setMissingMentor(false);
      if (!mentorUserId) {
        setLoading(false);
        setMissingMentor(true);
        return;
      }
      try {
        let profile = null;
        try {
          profile = (await getFaculty(mentorUserId)).data;
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 404) throw err;
        }
        if (!profile) {
          try {
            profile = (await getAlumni(mentorUserId)).data;
          } catch (err) {
            if (!(err instanceof ApiError) || err.status !== 404) throw err;
          }
        }
        if (cancelled) return;
        if (!profile || (profile.role !== 'faculty' && profile.role !== 'alumni')) {
          setMissingMentor(true);
          return;
        }
        setMentor(profile);
        const openings = await listOpportunities({ availabilityStatus: 'open', pageSize: 100, sort: 'title', order: 'asc' });
        if (cancelled) return;
        const choices = openings.data || [];
        setOpportunities(choices);
        if ((openings.meta?.totalPages || 1) > 1) {
          setDirectoryNote('The opportunity list shows the first 100 open opportunities.');
        }
        if (requestedOpportunityId && choices.some((item) => item.id === requestedOpportunityId)) {
          setOpportunityId(requestedOpportunityId);
        } else if (requestedOpportunityId) {
          setDirectoryNote((current) => [current, 'The selected opportunity is not an open approved opening, so it was not attached.'].filter(Boolean).join(' '));
        }
      } catch (err) {
        if (!cancelled) setLoadError(errorText(err, 'The mentorship form could not be loaded.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [mentorUserId, requestedOpportunityId]);

  async function onSubmit(event) {
    event.preventDefault();
    const errors = {};
    if (!subject.trim() || subject.trim().length > 200) errors.subject = 'Subject is required and must be at most 200 characters.';
    if (!message.trim() || message.trim().length > 10000) errors.message = 'Message is required and must be at most 10000 characters.';
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length) return;
    const body = {
      mentorUserId,
      subject: subject.trim(),
      message: message.trim(),
    };
    if (opportunityId) body.opportunityId = opportunityId;
    setSubmitting(true);
    try {
      const payload = await createMentorshipRequest(body);
      navigate(`/mentorship/${payload.data.id}`, { state: { notice: payload.message } });
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setFormError(errorText(err, 'The mentorship request could not be sent.'));
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState label="Loading the mentorship form" />;
  if (loadError) {
    return (
      <section className="panel">
        <h1>Request mentorship</h1>
        <Alert>{loadError}</Alert>
      </section>
    );
  }
  if (missingMentor || !mentor) {
    return (
      <section className="panel">
        <h1>Request mentorship</h1>
        <p>Choose a faculty member or alumnus before sending a request.</p>
        <div className="button-row">
          <Link className="button" to="/faculty">Faculty</Link>
          <Link className="button button-secondary" to="/alumni">Alumni</Link>
        </div>
      </section>
    );
  }

  const profilePath = mentor.role === 'faculty' ? `/faculty/${mentor.id}` : `/alumni/${mentor.id}`;

  return (
    <section className="panel">
      <p className="eyebrow">Mentorship</p>
      <h1>Request mentorship</h1>
      <p>Ask <Link to={profilePath}>{mentor.fullName}</Link> for mentorship. The message is stored as the first message in the request.</p>
      {mentor.mentoringAvailability === false ? (
        <p className="field-hint">This person is not marked available for mentorship. You can still send the request.</p>
      ) : null}
      {directoryNote ? <p className="field-hint">{directoryNote}</p> : null}
      {formError ? <Alert>{formError}</Alert> : null}
      <form onSubmit={onSubmit} noValidate>
        <FormField id="subject" label="Subject" error={fieldErrors.subject}>
          <input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </FormField>
        <FormField id="opportunityId" label="Opportunity" hint="Optional. Only an approved open opportunity can be attached." error={fieldErrors.opportunityId}>
          <select id="opportunityId" value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)}>
            <option value="">No opportunity</option>
            {opportunities.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </FormField>
        <FormField id="message" label="Message" error={fieldErrors.message}>
          <textarea id="message" rows="6" value={message} onChange={(event) => setMessage(event.target.value)} />
        </FormField>
        <div className="button-row">
          <button className="button" type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send request'}</button>
          <Link className="button button-secondary" to="/mentorship">Cancel</Link>
        </div>
      </form>
    </section>
  );
}
