const { query, withTransaction } = require('../db/pool');
const projectRepository = require('../repositories/projectRepository');
const opportunityRepository = require('../repositories/opportunityRepository');
const { insertActivity } = require('../repositories/audit');
const { toProject } = require('../utils/presenters');
const { forbidden, invalid, notFound, badRequest } = require('../utils/errors');
const { meta, parsePage, parseOrder, resolveSort } = require('../utils/pagination');
const {
  assertObject, rejectUnknown, asTrimmedString, asOptionalString, asUuid, asOptionalUuid,
  asEnum, asInteger, asUuidArray, parseQueryUuid, parseQueryUuidList, parseOptionalText,
  parseQueryEnum, parseQueryBool, parseQueryInt, assertEmptyBody,
} = require('../validators/common');
const { PROJECT_TYPES, MEMBER_ROLES, MODERATION } = require('../domain/constants');
const {
  assertDepartment, assertActiveAreas, assertKnownAreas, assertAcademicProfiles,
  requireVisible, assertModerationCreate, assertSubmitTransition,
} = require('./rules');

function parseMembers(value) {
  if (!Array.isArray(value)) throw invalid('members', 'type', 'Must be an array.');
  const seen = new Set();
  return value.map((member, index) => {
    if (!member || typeof member !== 'object' || Array.isArray(member)) {
      throw invalid('members', 'type', `Item ${index} must be an object.`);
    }
    rejectUnknown(member, ['userId', 'memberRole']);
    const userId = asUuid(member.userId, 'members');
    if (seen.has(userId)) throw invalid('members', 'duplicate', 'A user can be added only once.');
    seen.add(userId);
    return { userId, memberRole: asEnum(member.memberRole, 'memberRole', MEMBER_ROLES) };
  });
}

function parseBody(body, { partial }) {
  const obj = assertObject(body);
  rejectUnknown(obj, [
    'departmentId', 'opportunityId', 'title', 'description', 'projectType', 'projectYear',
    'externalLink', 'moderationStatus', 'researchAreaIds', 'members',
  ]);
  if (partial && !Object.keys(obj).length) throw invalid('body', 'required', 'At least one field is required.');
  if (!partial) {
    if (obj.departmentId === undefined) throw invalid('departmentId', 'required', 'This field is required.');
    if (obj.title === undefined) throw invalid('title', 'required', 'This field is required.');
    if (obj.projectType === undefined) throw invalid('projectType', 'required', 'This field is required.');
    if (obj.projectYear === undefined) throw invalid('projectYear', 'required', 'This field is required.');
  }
  if (partial && obj.moderationStatus !== undefined) {
    throw invalid('moderationStatus', 'not_allowed', 'Use the submit or moderation endpoint for status changes.');
  }
  const parsed = {};
  if (obj.departmentId !== undefined) parsed.departmentId = asUuid(obj.departmentId, 'departmentId');
  if (obj.opportunityId !== undefined) parsed.opportunityId = asOptionalUuid(obj.opportunityId, 'opportunityId');
  if (obj.title !== undefined) parsed.title = asTrimmedString(obj.title, 'title', { min: 1, max: 300 });
  if (obj.description !== undefined) {
    parsed.description = asOptionalString(obj.description, 'description', { max: 20000, nullable: true });
  }
  if (obj.projectType !== undefined) parsed.projectType = asEnum(obj.projectType, 'projectType', PROJECT_TYPES);
  if (obj.projectYear !== undefined) parsed.projectYear = asInteger(obj.projectYear, 'projectYear', { min: 1990, max: 2100 });
  if (obj.externalLink !== undefined) {
    parsed.externalLink = asOptionalString(obj.externalLink, 'externalLink', { max: 2000, nullable: true, trim: false });
  }
  if (obj.moderationStatus !== undefined) parsed.moderationStatus = asEnum(obj.moderationStatus, 'moderationStatus', MODERATION);
  if (obj.researchAreaIds !== undefined) parsed.researchAreaIds = asUuidArray(obj.researchAreaIds, 'researchAreaIds');
  if (obj.members !== undefined) parsed.members = parseMembers(obj.members);
  return parsed;
}

async function assertOpportunityVisible(db, user, opportunityId) {
  if (!opportunityId) return;
  const row = await opportunityRepository.findById(db, opportunityId);
  if (!row) throw invalid('opportunityId', 'reference', 'Opportunity does not exist.');
  const visible = user.role === 'admin'
    || row.moderation_status === 'approved'
    || row.faculty_user_id === user.id
    || row.created_by_user_id === user.id;
  if (!visible) throw invalid('opportunityId', 'reference', 'Opportunity does not exist.');
}

async function create(user, body) {
  if (!['faculty', 'alumni', 'admin'].includes(user.role)) throw forbidden();
  const parsed = parseBody(body, { partial: false });
  parsed.moderationStatus = assertModerationCreate(parsed.moderationStatus);
  const id = await withTransaction(async (db) => {
    await assertDepartment(db, parsed.departmentId);
    await assertOpportunityVisible(db, user, parsed.opportunityId);
    await assertActiveAreas(db, parsed.researchAreaIds || []);
    if (parsed.members) await assertAcademicProfiles(db, parsed.members.map((m) => m.userId), 'members');
    const createdId = await projectRepository.insertProject(db, {
      departmentId: parsed.departmentId,
      opportunityId: parsed.opportunityId ?? null,
      createdByUserId: user.id,
      title: parsed.title,
      description: parsed.description ?? null,
      projectType: parsed.projectType,
      projectYear: parsed.projectYear,
      externalLink: parsed.externalLink ?? null,
      moderationStatus: parsed.moderationStatus,
    });
    if (parsed.researchAreaIds) await projectRepository.replaceAreas(db, createdId, parsed.researchAreaIds);
    if (parsed.members) await projectRepository.replaceMembers(db, createdId, parsed.members);
    return createdId;
  });
  return toProject(await projectRepository.findById({ query }, id));
}

async function list(user, queryParams) {
  const areaIds = parseQueryUuidList(queryParams.researchAreaId, 'researchAreaId');
  if (queryParams.researchAreaMatch && !['any', 'all'].includes(queryParams.researchAreaMatch)) {
    throw badRequest('Query parameter researchAreaMatch must be any or all.');
  }
  const yearFrom = parseQueryInt(queryParams.yearFrom, 'yearFrom', { min: 1990, max: 2100 });
  const yearTo = parseQueryInt(queryParams.yearTo, 'yearTo', { min: 1990, max: 2100 });
  if (yearFrom != null && yearTo != null && yearFrom > yearTo) {
    throw invalid('yearFrom', 'range', 'yearFrom must be less than or equal to yearTo.');
  }
  const mine = parseQueryBool(queryParams.mine, 'mine') === true;
  const isAdmin = user.role === 'admin';
  let moderationStatus = parseQueryEnum(queryParams.moderationStatus, 'moderationStatus', MODERATION);
  if (!isAdmin && !mine) moderationStatus = 'approved';
  const filters = {
    q: parseOptionalText(queryParams.q, 'q', 200),
    areaIds,
    areaMatch: queryParams.researchAreaMatch || 'any',
    projectType: parseQueryEnum(queryParams.projectType, 'projectType', PROJECT_TYPES),
    departmentId: parseQueryUuid(queryParams.departmentId, 'departmentId'),
    projectYear: parseQueryInt(queryParams.projectYear, 'projectYear', { min: 1990, max: 2100 }),
    yearFrom,
    yearTo,
    memberUserId: parseQueryUuid(queryParams.memberUserId, 'memberUserId'),
    mineUserId: mine ? user.id : undefined,
    moderationStatus,
  };
  const paging = parsePage(queryParams);
  paging.orderBy = resolveSort(queryParams.sort, parseOrder(queryParams.order), {
    createdAt: 'p.created_at',
    projectYear: 'p.project_year',
    title: 'p.title',
  }, { createdAt: 'desc', projectYear: 'desc', title: 'asc' });
  await assertKnownAreas({ query }, areaIds);
  const result = await projectRepository.list({ query }, filters, paging);
  return { data: result.rows.map(toProject), meta: meta(paging.page, paging.pageSize, result.total) };
}

async function get(user, id) {
  const row = await projectRepository.findById({ query }, id);
  requireVisible(user, row, [row && row.created_by_user_id]);
  return toProject(row);
}

async function update(user, id, body) {
  const existing = await projectRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.created_by_user_id]);
  const isAdmin = user.role === 'admin';
  if (user.id !== existing.created_by_user_id && !isAdmin) throw forbidden();
  const parsed = parseBody(body, { partial: true });
  if (existing.moderation_status === 'approved') {
    if (parsed.researchAreaIds && parsed.researchAreaIds.length === 0) {
      throw invalid('researchAreaIds', 'required', 'An approved project must keep at least one research area.');
    }
    if (parsed.members && parsed.members.length === 0) {
      throw invalid('members', 'required', 'An approved project must keep at least one member.');
    }
  }
  await withTransaction(async (db) => {
    if (parsed.departmentId) await assertDepartment(db, parsed.departmentId);
    if (parsed.opportunityId) await assertOpportunityVisible(db, user, parsed.opportunityId);
    if (parsed.researchAreaIds) await assertActiveAreas(db, parsed.researchAreaIds);
    if (parsed.members) await assertAcademicProfiles(db, parsed.members.map((m) => m.userId), 'members');
    await projectRepository.updateProject(db, id, parsed);
    if (parsed.researchAreaIds) await projectRepository.replaceAreas(db, id, parsed.researchAreaIds);
    if (parsed.members) await projectRepository.replaceMembers(db, id, parsed.members);
    if (isAdmin) {
      await insertActivity(db, {
        actorUserId: user.id,
        action: 'project.updated',
        entityType: 'research_projects',
        entityId: id,
        summary: 'Administrator updated a research project.',
      });
    }
  });
  return toProject(await projectRepository.findById({ query }, id));
}

async function submit(user, id, body) {
  assertEmptyBody(body);
  const existing = await projectRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.created_by_user_id]);
  if (user.id !== existing.created_by_user_id) throw forbidden();
  assertSubmitTransition(existing.moderation_status);
  await projectRepository.updateProject({ query }, id, { moderationStatus: 'pending' });
  return toProject(await projectRepository.findById({ query }, id));
}

async function remove(user, id) {
  const existing = await projectRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.created_by_user_id]);
  const isAdmin = user.role === 'admin';
  if (user.id !== existing.created_by_user_id && !isAdmin) throw forbidden();
  if (!isAdmin && !['draft', 'rejected'].includes(existing.moderation_status)) throw forbidden();
  await withTransaction(async (db) => {
    await projectRepository.deleteProject(db, id);
    if (isAdmin) {
      await insertActivity(db, {
        actorUserId: user.id,
        action: 'project.deleted',
        entityType: 'research_projects',
        entityId: id,
        summary: 'Administrator deleted a research project.',
      });
    }
  });
  return { id };
}

module.exports = { create, list, get, update, submit, remove };
