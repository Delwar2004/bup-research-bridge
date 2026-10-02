const { query, withTransaction } = require('../db/pool');
const mentorshipRepository = require('../repositories/mentorshipRepository');
const { insertNotification } = require('../repositories/audit');
const { toMentorship, toMessage } = require('../utils/presenters');
const { forbidden, invalid, notFound, conflict, badRequest } = require('../utils/errors');
const { meta, parsePage, parseMessagePage, parseOrder, resolveSort } = require('../utils/pagination');
const {
  assertObject, rejectUnknown, asUuid, asOptionalUuid, asTrimmedString, asEnum, parseQueryEnum, parseQueryUuid,
} = require('../validators/common');
const { MENTORSHIP_STATUS } = require('../domain/constants');

const TRANSITIONS = {
  pending: { accepted: 'mentor', rejected: 'mentor', cancelled: 'student' },
  accepted: { completed: 'mentor', cancelled: 'student' },
};

function sideOf(user, row) {
  if (user.id === row.student_user_id) return 'student';
  if (user.id === row.mentor_user_id) return 'mentor';
  return null;
}

async function create(user, body) {
  if (user.role !== 'student') throw forbidden();
  const obj = assertObject(body);
  rejectUnknown(obj, ['mentorUserId', 'opportunityId', 'subject', 'message']);
  if (obj.mentorUserId === undefined) throw invalid('mentorUserId', 'required', 'This field is required.');
  if (obj.subject === undefined) throw invalid('subject', 'required', 'This field is required.');
  if (obj.message === undefined) throw invalid('message', 'required', 'This field is required.');
  const mentorUserId = asUuid(obj.mentorUserId, 'mentorUserId');
  const opportunityId = asOptionalUuid(obj.opportunityId, 'opportunityId');
  const subject = asTrimmedString(obj.subject, 'subject', { min: 1, max: 200 });
  const message = asTrimmedString(obj.message, 'message', { min: 1, max: 10000 });
  if (mentorUserId === user.id) {
    throw invalid('mentorUserId', 'distinct', 'You cannot request mentorship from yourself.');
  }
  const result = await withTransaction(async (db) => {
    const mentor = await mentorshipRepository.findMentor(db, mentorUserId);
    if (!mentor || mentor.status !== 'active' || !['faculty', 'alumni'].includes(mentor.role)) {
      throw notFound();
    }
    if (opportunityId) {
      const opportunity = await mentorshipRepository.findOpenApprovedOpportunity(db, opportunityId);
      if (!opportunity || opportunity.moderation_status !== 'approved' || opportunity.availability_status !== 'open') {
        throw notFound();
      }
    }
    const requestId = await mentorshipRepository.insertRequest(db, {
      studentUserId: user.id,
      mentorUserId,
      opportunityId: opportunityId ?? null,
      subject,
    });
    const stored = await mentorshipRepository.insertMessage(db, {
      requestId,
      senderUserId: user.id,
      body: message,
    });
    await insertNotification(db, {
      recipientUserId: mentorUserId,
      type: 'mentorship_requested',
      message: `You received a mentorship request: ${subject}.`.slice(0, 2000),
      mentorshipRequestId: requestId,
      payload: { requestId, subject },
    });
    return { requestId, messageId: stored.id };
  });
  const request = await mentorshipRepository.findForViewer({ query }, result.requestId, user);
  const { rows } = await query(
    `SELECT m.id, m.request_id, m.sender_user_id, u.full_name AS sender_name, m.body, m.created_at
     FROM mentorship_messages m JOIN users u ON u.id = m.sender_user_id WHERE m.id = $1`,
    [result.messageId],
  );
  return { ...toMentorship(request), initialMessage: toMessage(rows[0]) };
}

async function list(user, queryParams) {
  if (queryParams.role && !['student', 'mentor'].includes(queryParams.role)) {
    throw badRequest('Query parameter role must be student or mentor.');
  }
  const filters = {
    status: parseQueryEnum(queryParams.status, 'status', MENTORSHIP_STATUS),
    role: queryParams.role,
    opportunityId: parseQueryUuid(queryParams.opportunityId, 'opportunityId'),
  };
  const paging = parsePage(queryParams);
  paging.orderBy = resolveSort(queryParams.sort, parseOrder(queryParams.order), {
    createdAt: 'r.created_at',
    updatedAt: 'r.updated_at',
  }, { createdAt: 'desc', updatedAt: 'desc' });
  const result = await mentorshipRepository.listForViewer({ query }, user, filters, paging);
  return { data: result.rows.map(toMentorship), meta: meta(paging.page, paging.pageSize, result.total) };
}

async function get(user, id) {
  const raw = await mentorshipRepository.findRaw({ query }, id);
  if (!raw || !sideOf(user, raw)) throw notFound();
  const row = await mentorshipRepository.findForViewer({ query }, id, user);
  return toMentorship(row);
}

async function updateStatus(user, id, body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['status']);
  if (obj.status === undefined) throw invalid('status', 'required', 'This field is required.');
  const status = asEnum(obj.status, 'status', ['accepted', 'rejected', 'cancelled', 'completed']);
  const raw = await mentorshipRepository.findRaw({ query }, id);
  const side = raw && sideOf(user, raw);
  if (!raw || !side) throw notFound();
  const allowedSide = TRANSITIONS[raw.status] && TRANSITIONS[raw.status][status];
  if (!allowedSide) throw conflict('That status change is not allowed.');
  if (allowedSide !== side) throw forbidden();
  const recipient = side === 'student' ? raw.mentor_user_id : raw.student_user_id;
  await withTransaction(async (db) => {
    await mentorshipRepository.updateStatus(db, id, status);
    await insertNotification(db, {
      recipientUserId: recipient,
      type: 'mentorship_updated',
      message: `A mentorship request was updated to ${status}.`,
      mentorshipRequestId: id,
      payload: { requestId: id, status },
    });
  });
  const row = await mentorshipRepository.findForViewer({ query }, id, user);
  return toMentorship(row);
}

async function listMessages(user, id, queryParams) {
  const raw = await mentorshipRepository.findRaw({ query }, id);
  if (!raw || !sideOf(user, raw)) throw notFound();
  const paging = parseMessagePage(queryParams);
  const result = await mentorshipRepository.listMessages({ query }, id, paging);
  return { data: result.rows.map(toMessage), meta: meta(paging.page, paging.pageSize, result.total) };
}

async function createMessage(user, id, body) {
  const raw = await mentorshipRepository.findRaw({ query }, id);
  if (!raw || !sideOf(user, raw)) throw notFound();
  const obj = assertObject(body);
  rejectUnknown(obj, ['body']);
  if (obj.body === undefined) throw invalid('body', 'required', 'This field is required.');
  const text = asTrimmedString(obj.body, 'body', { min: 1, max: 10000 });
  const recipient = user.id === raw.student_user_id ? raw.mentor_user_id : raw.student_user_id;
  const messageId = await withTransaction(async (db) => {
    const stored = await mentorshipRepository.insertMessage(db, {
      requestId: id,
      senderUserId: user.id,
      body: text,
    });
    await insertNotification(db, {
      recipientUserId: recipient,
      type: 'message_received',
      message: 'You have a new mentorship message.',
      mentorshipRequestId: id,
      payload: { requestId: id, messageId: stored.id },
    });
    return stored.id;
  });
  const { rows } = await query(
    `SELECT m.id, m.request_id, m.sender_user_id, u.full_name AS sender_name, m.body, m.created_at
     FROM mentorship_messages m JOIN users u ON u.id = m.sender_user_id WHERE m.id = $1`,
    [messageId],
  );
  return toMessage(rows[0]);
}

module.exports = { create, list, get, updateStatus, listMessages, createMessage };
