import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import {
  createMentorshipMessage,
  getMentorshipRequest,
  listMentorshipMessages,
  updateMentorshipStatus,
} from '../../api/mentorship';
import { useSession } from '../../auth/session';
import { Alert } from '../../components/Alert';
import { FormField } from '../../components/FormField';
import { LoadingState } from '../../components/LoadingState';
import { Pagination } from '../../components/Pagination';
import { errorText, fieldErrorsFrom } from '../opportunities/errors';

const MESSAGE_PAGE_SIZE = 50;

function actionsFor(item, userId) {
  const isStudent = userId === item.studentUserId;
  const isMentor = userId === item.mentorUserId;
  if (item.status === 'pending' && isMentor) {
    return [
      { status: 'accepted', label: 'Accept', confirm: false },
      { status: 'rejected', label: 'Reject', confirm: true },
    ];
  }
  if (item.status === 'pending' && isStudent) {
    return [{ status: 'cancelled', label: 'Cancel request', confirm: true }];
  }
  if (item.status === 'accepted' && isMentor) {
    return [{ status: 'completed', label: 'Mark completed', confirm: true }];
  }
  if (item.status === 'accepted' && isStudent) {
    return [{ status: 'cancelled', label: 'Cancel mentorship', confirm: true }];
  }
  return [];
}

export function MentorshipDetailPage() {
  const { requestId } = useParams();
  const { user } = useSession();
  const location = useLocation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pendingAction, setPendingAction] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [messages, setMessages] = useState([]);
  const [messageMeta, setMessageMeta] = useState(null);
  const [messagePage, setMessagePage] = useState(1);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messageError, setMessageError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setMissing(false);
    try {
      const payload = await getMentorshipRequest(requestId);
      setItem(payload.data);
    } catch (err) {
      setItem(null);
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setError(errorText(err, 'This mentorship request could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  const loadMessages = useCallback(async (page) => {
    setMessagesLoading(true);
    setMessageError('');
    try {
      const payload = await listMentorshipMessages(requestId, { page, pageSize: MESSAGE_PAGE_SIZE });
      setMessages(payload.data || []);
      setMessageMeta(payload.meta || null);
    } catch (err) {
      setMessages([]);
      setMessageMeta(null);
      if (err instanceof ApiError && err.status === 404) setMessageError('These messages are not available.');
      else setMessageError(errorText(err, 'Messages could not be loaded.'));
    } finally {
      setMessagesLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load, attempt]);

  useEffect(() => {
    setMessagePage(1);
  }, [requestId]);

  useEffect(() => {
    if (missing) return undefined;
    loadMessages(messagePage);
    return undefined;
  }, [loadMessages, messagePage, missing, item?.id]);

  async function changeStatus(action) {
    if (action.confirm && !window.confirm(`${action.label}?`)) return;
    setNotice('');
    setError('');
    setFieldErrors({});
    setPendingAction(action.status);
    try {
      const payload = await updateMentorshipStatus(item.id, action.status);
      setItem(payload.data);
      setNotice(payload.message);
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(errorText(err, 'The mentorship request could not be updated.'));
    } finally {
      setPendingAction('');
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 10000) {
      setFieldErrors({ body: 'Message is required and must be at most 10000 characters.' });
      return;
    }
    setSending(true);
    setMessageError('');
    setFieldErrors({});
    try {
      await createMentorshipMessage(item.id, text);
      setDraft('');
      setNotice('Message sent.');
      const probe = await listMentorshipMessages(item.id, { page: messagePage, pageSize: MESSAGE_PAGE_SIZE });
      const lastPage = probe.meta?.totalPages || 1;
      if (lastPage !== messagePage) setMessagePage(lastPage);
      else {
        setMessages(probe.data || []);
        setMessageMeta(probe.meta || null);
      }
    } catch (err) {
      setMessageError(errorText(err, 'The message could not be sent.'));
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingState label="Loading mentorship request" />;

  if (missing) {
    return (
      <section className="panel">
        <h1>Mentorship</h1>
        <p>This mentorship request is not available.</p>
        <Link className="button" to="/mentorship">Back to mentorship</Link>
      </section>
    );
  }

  if (error && !item) {
    return (
      <section className="panel">
        <h1>Mentorship</h1>
        <Alert>{error}</Alert>
        <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
      </section>
    );
  }

  const actions = actionsFor(item, user?.id);
  const mentorPath = item.mentorRole === 'alumni' ? `/alumni/${item.mentorUserId}` : `/faculty/${item.mentorUserId}`;

  return (
    <article className="panel">
      <p className="eyebrow">Mentorship</p>
      <h1>{item.subject}</h1>
      <p><Link to="/mentorship">Back to mentorship</Link></p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <dl className="meta-list">
        <div>
          <dt>Status</dt>
          <dd>{item.status}</dd>
        </div>
        <div>
          <dt>Student</dt>
          <dd>{item.studentName}</dd>
        </div>
        <div>
          <dt>Mentor</dt>
          <dd><Link to={mentorPath}>{item.mentorName}</Link> · {item.mentorRole}</dd>
        </div>
        {item.opportunityId ? (
          <div>
            <dt>Opportunity</dt>
            <dd>
              {item.opportunityTitle
                ? <Link to={`/opportunities/${item.opportunityId}`}>{item.opportunityTitle}</Link>
                : 'An opportunity is attached, but it is not visible to you.'}
            </dd>
          </div>
        ) : null}
        {item.respondedAt ? (
          <div>
            <dt>Responded</dt>
            <dd>{new Date(item.respondedAt).toLocaleString()}</dd>
          </div>
        ) : null}
      </dl>
      {actions.length ? (
        <div className="button-row">
          {actions.map((action) => (
            <button
              key={action.status}
              className={action.status === 'accepted' ? 'button' : 'button button-secondary'}
              type="button"
              disabled={pendingAction === action.status}
              onClick={() => changeStatus(action)}
            >
              {pendingAction === action.status ? 'Saving…' : action.label}
            </button>
          ))}
        </div>
      ) : null}
      <section className="related-section">
        <h2>Messages</h2>
        {messageError ? <Alert>{messageError}</Alert> : null}
        {messagesLoading ? <LoadingState label="Loading messages" /> : null}
        {!messagesLoading && messages.length === 0 ? <p className="empty-state">No messages are listed.</p> : null}
        {messages.length ? (
          <ol className="message-list">
            {messages.map((message) => (
              <li className={message.senderUserId === user?.id ? 'message-item is-own' : 'message-item'} key={message.id}>
                <p className="person-meta">{message.senderName} · {new Date(message.createdAt).toLocaleString()}</p>
                <p>{message.body}</p>
              </li>
            ))}
          </ol>
        ) : null}
        <Pagination page={messageMeta?.page || 1} totalPages={messageMeta?.totalPages || 0} onPage={setMessagePage} />
        <form onSubmit={sendMessage} noValidate>
          <FormField id="message-body" label="Write a message" error={fieldErrors.body}>
            <textarea id="message-body" rows="4" value={draft} onChange={(event) => setDraft(event.target.value)} />
          </FormField>
          <button className="button" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button>
        </form>
      </section>
    </article>
  );
}
