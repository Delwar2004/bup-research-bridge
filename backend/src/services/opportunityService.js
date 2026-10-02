const { query, withTransaction } = require('../db/pool');
const opportunityRepository = require('../repositories/opportunityRepository');
const userRepository = require('../repositories/userRepository');
const { insertActivity } = require('../repositories/audit');
const { toOpportunity } = require('../utils/presenters');
const { forbidden, invalid, notFound, conflict, badRequest } = require('../utils/errors');
const { meta, parsePage, parseOrder, resolveSort } = require('../utils/pagination');
const {
  assertObject, rejectUnknown, asTrimmedString, asOptionalString, asUuid, asEnum,
  asInteger, asDate, asUuidArray, parseQueryBool, parseQueryUuid, parseQueryUuidList,
  parseOptionalText, parseQueryEnum, assertEmptyBody,
} = require('../validators/common');
const { OPPORTUNITY_TYPES, AVAILABILITY, MODERATION } = require('../domain/constants');
const {
  assertDepartment, assertActiveAreas, assertKnownAreas, requireVisible, assertModerationCreate,
  assertSubmitTransition,
} = require('./rules');

function parseOpportunityBody(body, { partial, isAdmin }) {
  const obj = assertObject(body);
  const allowed = [
    'departmentId', 'opportunityType', 'title', 'description', 'deadline', 'slots',
    'requiredSkills', 'prerequisites', 'availabilityStatus', 'moderationStatus', 'researchAreaIds',
  ];
  if (!partial || isAdmin) allowed.push('facultyUserId');
  rejectUnknown(obj, allowed);
  if (partial && !Object.keys(obj).length) throw invalid('body', 'required', 'At least one field is required.');
  const parsed = {};
  if (!partial) {
    if (obj.opportunityType === undefined) throw invalid('opportunityType', 'required', 'This field is required.');
    if (obj.title === undefined) throw invalid('title', 'required', 'This field is required.');
    if (obj.description === undefined) throw invalid('description', 'required', 'This field is required.');
  }
  if (obj.facultyUserId !== undefined) parsed.facultyUserId = asUuid(obj.facultyUserId, 'facultyUserId');
  if (obj.departmentId !== undefined) parsed.departmentId = asUuid(obj.departmentId, 'departmentId');
  if (obj.opportunityType !== undefined) parsed.opportunityType = asEnum(obj.opportunityType, 'opportunityType', OPPORTUNITY_TYPES);
  if (obj.title !== undefined) parsed.title = asTrimmedString(obj.title, 'title', { min: 1, max: 300 });
  if (obj.description !== undefined) parsed.description = asTrimmedString(obj.description, 'description', { min: 1, max: 20000 });
  if (obj.deadline !== undefined) parsed.deadline = asDate(obj.deadline, 'deadline', { nullable: true });
  if (obj.slots !== undefined) {
    parsed.slots = obj.slots === null ? null : asInteger(obj.slots, 'slots', { min: 1 });
  }
  if (obj.requiredSkills !== undefined) {
    parsed.requiredSkills = asOptionalString(obj.requiredSkills, 'requiredSkills', { max: 4000, nullable: true, min: 0 });
  }
  if (obj.prerequisites !== undefined) {
    parsed.prerequisites = asOptionalString(obj.prerequisites, 'prerequisites', { max: 4000, nullable: true, min: 0 });
  }
  if (obj.availabilityStatus !== undefined) parsed.availabilityStatus = asEnum(obj.availabilityStatus, 'availabilityStatus', AVAILABILITY);
  if (obj.moderationStatus !== undefined) parsed.moderationStatus = asEnum(obj.moderationStatus, 'moderationStatus', MODERATION);
  if (obj.researchAreaIds !== undefined) parsed.researchAreaIds = asUuidArray(obj.researchAreaIds, 'researchAreaIds');
  return parsed;
}

async function create(user, body) {
  if (user.role !== 'faculty' && user.role !== 'admin') throw forbidden();
  const obj = assertObject(body);
  if (user.role === 'faculty' && Object.prototype.hasOwnProperty.call(obj, 'facultyUserId')) throw forbidden();
  const parsed = parseOpportunityBody(body, { partial: false, isAdmin: user.role === 'admin' });
  if (user.role === 'admin' && !parsed.facultyUserId) {
    throw invalid('facultyUserId', 'required', 'Administrators must name the faculty owner.');
  }
  parsed.moderationStatus = assertModerationCreate(parsed.moderationStatus);
  const facultyUserId = user.role === 'faculty' ? user.id : parsed.facultyUserId;
  const id = await withTransaction(async (db) => {
    const departmentId = parsed.departmentId || await userRepository.facultyDepartmentId(db, facultyUserId);
    if (!departmentId) throw invalid('departmentId', 'required', 'Department is required.');
    await assertDepartment(db, departmentId);
    await assertActiveAreas(db, parsed.researchAreaIds || []);
    const createdId = await opportunityRepository.insertOpportunity(db, {
      facultyUserId,
      departmentId,
      createdByUserId: user.id,
      opportunityType: parsed.opportunityType,
      title: parsed.title,
      description: parsed.description,
      deadline: parsed.deadline ?? null,
      slots: parsed.slots ?? null,
      requiredSkills: parsed.requiredSkills ?? null,
      prerequisites: parsed.prerequisites ?? null,
      availabilityStatus: parsed.availabilityStatus || 'open',
      moderationStatus: parsed.moderationStatus,
    });
    if (parsed.researchAreaIds) await opportunityRepository.replaceAreas(db, createdId, parsed.researchAreaIds);
    return createdId;
  });
  return toOpportunity(await opportunityRepository.findById({ query }, id));
}

function listFilters(user, queryParams) {
  const areaIds = parseQueryUuidList(queryParams.researchAreaId, 'researchAreaId');
  if (queryParams.researchAreaMatch && !['any', 'all'].includes(queryParams.researchAreaMatch)) {
    throw badRequest('Query parameter researchAreaMatch must be any or all.');
  }
  const mine = parseQueryBool(queryParams.mine, 'mine') === true;
  const isAdmin = user.role === 'admin';
  let moderationStatus = parseQueryEnum(queryParams.moderationStatus, 'moderationStatus', MODERATION);
  let availabilityStatus = parseQueryEnum(queryParams.availabilityStatus, 'availabilityStatus', AVAILABILITY);
  if (!isAdmin && !mine) {
    moderationStatus = 'approved';
    if (!availabilityStatus) availabilityStatus = 'open';
  }
  return {
    q: parseOptionalText(queryParams.q, 'q', 200),
    areaIds,
    areaMatch: queryParams.researchAreaMatch || 'any',
    opportunityType: parseQueryEnum(queryParams.opportunityType, 'opportunityType', OPPORTUNITY_TYPES),
    departmentId: parseQueryUuid(queryParams.departmentId, 'departmentId'),
    availabilityStatus,
    facultyUserId: parseQueryUuid(queryParams.facultyUserId, 'facultyUserId'),
    moderationStatus,
    mineUserId: mine ? user.id : undefined,
  };
}

async function list(user, queryParams) {
  const filters = listFilters(user, queryParams);
  const paging = parsePage(queryParams);
  paging.orderBy = resolveSort(queryParams.sort, parseOrder(queryParams.order), {
    createdAt: 'v.created_at',
    deadline: 'v.deadline',
    title: 'v.title',
  }, { createdAt: 'desc', deadline: 'desc', title: 'asc' });
  if (queryParams.sort === 'deadline') paging.orderBy += ' NULLS LAST';
  await assertKnownAreas({ query }, filters.areaIds);
  const result = await opportunityRepository.list({ query }, filters, paging);
  return {
    data: result.rows.map(toOpportunity),
    meta: meta(paging.page, paging.pageSize, result.total),
  };
}

async function get(user, id) {
  const row = await opportunityRepository.findById({ query }, id);
  requireVisible(user, row, [row && row.faculty_user_id, row && row.created_by_user_id]);
  return toOpportunity(row);
}

async function update(user, id, body) {
  const existing = await opportunityRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.faculty_user_id, existing && existing.created_by_user_id]);
  const isOwner = user.id === existing.faculty_user_id;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) throw forbidden();
  const obj = assertObject(body);
  if (!isAdmin && Object.prototype.hasOwnProperty.call(obj, 'facultyUserId')) throw forbidden();
  if (Object.prototype.hasOwnProperty.call(obj, 'moderationStatus') || Object.prototype.hasOwnProperty.call(obj, 'availabilityStatus')) {
    throw invalid('moderationStatus', 'not_allowed', 'Use the availability or moderation endpoint for status changes.');
  }
  const parsed = parseOpportunityBody(body, { partial: true, isAdmin });
  if (existing.moderation_status === 'approved' && parsed.researchAreaIds && parsed.researchAreaIds.length === 0) {
    throw invalid('researchAreaIds', 'required', 'An approved opportunity must keep at least one research area.');
  }
  await withTransaction(async (db) => {
    if (parsed.departmentId) await assertDepartment(db, parsed.departmentId);
    if (parsed.researchAreaIds) await assertActiveAreas(db, parsed.researchAreaIds);
    await opportunityRepository.updateOpportunity(db, id, parsed);
    if (parsed.researchAreaIds) await opportunityRepository.replaceAreas(db, id, parsed.researchAreaIds);
    if (isAdmin) {
      await insertActivity(db, {
        actorUserId: user.id,
        action: 'opportunity.updated',
        entityType: 'thesis_opportunities',
        entityId: id,
        summary: 'Administrator updated an opportunity.',
      });
    }
  });
  return toOpportunity(await opportunityRepository.findById({ query }, id));
}

async function updateAvailability(user, id, body) {
  const existing = await opportunityRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.faculty_user_id, existing && existing.created_by_user_id]);
  const isOwner = user.id === existing.faculty_user_id && user.role === 'faculty';
  if (!isOwner && user.role !== 'admin') throw forbidden();
  const obj = assertObject(body);
  rejectUnknown(obj, ['availabilityStatus']);
  if (obj.availabilityStatus === undefined) throw invalid('availabilityStatus', 'required', 'This field is required.');
  const availabilityStatus = asEnum(obj.availabilityStatus, 'availabilityStatus', AVAILABILITY);
  await opportunityRepository.updateOpportunity({ query }, id, { availabilityStatus });
  return toOpportunity(await opportunityRepository.findById({ query }, id));
}

async function submit(user, id, body) {
  assertEmptyBody(body);
  const existing = await opportunityRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.faculty_user_id, existing && existing.created_by_user_id]);
  if (user.id !== existing.faculty_user_id) throw forbidden();
  assertSubmitTransition(existing.moderation_status);
  await opportunityRepository.updateOpportunity({ query }, id, { moderationStatus: 'pending' });
  return toOpportunity(await opportunityRepository.findById({ query }, id));
}

async function remove(user, id) {
  const existing = await opportunityRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.faculty_user_id, existing && existing.created_by_user_id]);
  const isAdmin = user.role === 'admin';
  const isOwner = user.id === existing.faculty_user_id;
  if (!isAdmin && !isOwner) throw forbidden();
  if (!isAdmin && !['draft', 'rejected'].includes(existing.moderation_status)) throw forbidden();
  if (await opportunityRepository.hasMentorship({ query }, id)) {
    throw conflict('This opportunity is referenced by a mentorship request. Archive it instead.');
  }
  await withTransaction(async (db) => {
    await opportunityRepository.deleteOpportunity(db, id);
    if (isAdmin) {
      await insertActivity(db, {
        actorUserId: user.id,
        action: 'opportunity.deleted',
        entityType: 'thesis_opportunities',
        entityId: id,
        summary: 'Administrator deleted an opportunity.',
      });
    }
  });
  return { id };
}

module.exports = { create, list, get, update, updateAvailability, submit, remove, listFilters };
