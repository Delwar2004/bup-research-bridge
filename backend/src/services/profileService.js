const { query, withTransaction } = require('../db/pool');
const userRepository = require('../repositories/userRepository');
const experienceRepository = require('../repositories/experienceRepository');
const { toPublicProfile, toPrivateAccount, toExperience } = require('../utils/presenters');
const { forbidden, invalid, notFound, validation } = require('../utils/errors');
const { meta, parsePage, parseOrder, resolveSort } = require('../utils/pagination');
const {
  assertObject, rejectUnknown, asTrimmedString, asOptionalString, asUuid, asOptionalBoolean,
  asUuidArray, asEmail, parseQueryBool, parseQueryUuid, parseQueryUuidList, parseOptionalText,
  likePattern, asBoolean, asDate,
} = require('../validators/common');
const { assertDepartment, assertActiveAreas, assertKnownAreas } = require('./rules');

const PROFILE_FIELDS = {
  student: ['fullName', 'email', 'departmentId', 'batch', 'profilePhotoUrl', 'bio'],
  faculty: ['fullName', 'email', 'departmentId', 'designation', 'mentoringAvailability', 'profilePhotoUrl', 'bio'],
  alumni: ['fullName', 'email', 'departmentId', 'batch', 'currentOrganization', 'mentoringAvailability', 'profilePhotoUrl', 'bio'],
  admin: ['fullName', 'email'],
};

function parseProfilePatch(role, body) {
  const obj = assertObject(body);
  const allowed = PROFILE_FIELDS[role] || PROFILE_FIELDS.admin;
  rejectUnknown(obj, allowed);
  if (!Object.keys(obj).length) {
    throw invalid('body', 'required', 'At least one field is required.');
  }
  const parsed = {};
  if (obj.fullName !== undefined) parsed.fullName = asTrimmedString(obj.fullName, 'fullName', { min: 1, max: 200 });
  if (obj.email !== undefined) parsed.email = asEmail(obj.email);
  if (obj.departmentId !== undefined) parsed.departmentId = asUuid(obj.departmentId, 'departmentId');
  if (obj.batch !== undefined) parsed.batch = asTrimmedString(obj.batch, 'batch', { min: 1, max: 32 });
  if (obj.designation !== undefined) parsed.designation = asTrimmedString(obj.designation, 'designation', { min: 1, max: 200 });
  if (obj.mentoringAvailability !== undefined) parsed.mentoringAvailability = asBoolean(obj.mentoringAvailability, 'mentoringAvailability');
  if (obj.currentOrganization !== undefined) {
    parsed.currentOrganization = asOptionalString(obj.currentOrganization, 'currentOrganization', { max: 200, nullable: true });
  }
  if (obj.profilePhotoUrl !== undefined) {
    parsed.profilePhotoUrl = asOptionalString(obj.profilePhotoUrl, 'profilePhotoUrl', { max: 2000, nullable: true });
  }
  if (obj.bio !== undefined) parsed.bio = asOptionalString(obj.bio, 'bio', { max: 5000, nullable: true, min: 0 });
  return parsed;
}

async function updateMe(user, body) {
  const parsed = parseProfilePatch(user.role, body);
  await withTransaction(async (db) => {
    if (parsed.departmentId) await assertDepartment(db, parsed.departmentId);
    await userRepository.updateUserAccount(db, user.id, parsed);
    if (user.role !== 'admin') await userRepository.updateRoleProfile(db, user.role, user.id, parsed);
  });
  return toPrivateAccount(await userRepository.findProfileById({ query }, user.id));
}

async function replaceAreas(user, body) {
  if (user.role === 'admin') throw forbidden();
  const obj = assertObject(body);
  rejectUnknown(obj, ['researchAreaIds']);
  if (obj.researchAreaIds === undefined) {
    throw invalid('researchAreaIds', 'required', 'This field is required.');
  }
  const ids = asUuidArray(obj.researchAreaIds, 'researchAreaIds');
  await withTransaction(async (db) => {
    await assertActiveAreas(db, ids);
    await userRepository.replaceResearchAreas(db, user.role, user.id, ids);
  });
  const profile = await userRepository.findProfileById({ query }, user.id);
  return { researchAreas: toPrivateAccount(profile).researchAreas };
}

async function listFaculty(user, queryParams) {
  return listDirectory('faculty', queryParams, {
    fullName: 'p.full_name',
    updatedAt: 'p.updated_at',
  }, { fullName: 'asc', updatedAt: 'desc' });
}

async function listAlumni(queryParams) {
  return listDirectory('alumni', queryParams, {
    fullName: 'p.full_name',
    updatedAt: 'p.updated_at',
  }, { fullName: 'asc', updatedAt: 'desc' });
}

async function listDirectory(role, queryParams, allow, defaults) {
  const areaIds = parseQueryUuidList(queryParams.researchAreaId, 'researchAreaId');
  const areaMatch = queryParams.researchAreaMatch || 'any';
  if (queryParams.researchAreaMatch && !['any', 'all'].includes(queryParams.researchAreaMatch)) {
    const { badRequest } = require('../utils/errors');
    throw badRequest('Query parameter researchAreaMatch must be any or all.');
  }
  const filters = {
    role,
    q: parseOptionalText(queryParams.q, 'q', 200),
    departmentId: parseQueryUuid(queryParams.departmentId, 'departmentId'),
    mentoringAvailability: parseQueryBool(queryParams.mentoringAvailability, 'mentoringAvailability'),
    organization: role === 'alumni' ? parseOptionalText(queryParams.organization, 'organization', 200) : undefined,
    areaIds,
    areaMatch,
  };
  if (filters.q) filters.q = likePattern(filters.q);
  if (filters.organization) filters.organization = likePattern(filters.organization);
  const paging = parsePage(queryParams);
  paging.orderBy = resolveSort(queryParams.sort, parseOrder(queryParams.order), allow, defaults);
  await assertKnownAreas({ query }, areaIds);
  const result = await userRepository.listPeople({ query }, filters, paging);
  return {
    data: result.rows.map(toPublicProfile),
    meta: meta(paging.page, paging.pageSize, result.total),
  };
}

async function getFaculty(userId) {
  const row = await userRepository.findProfileById({ query }, userId);
  if (!row || row.role !== 'faculty' || row.status !== 'active') throw notFound();
  return toPublicProfile(row);
}

async function getAlumni(userId) {
  const row = await userRepository.findProfileById({ query }, userId);
  if (!row || row.role !== 'alumni' || row.status !== 'active') throw notFound();
  return toPublicProfile(row);
}

async function getUser(caller, userId) {
  const row = await userRepository.findProfileById({ query }, userId);
  if (!row) throw notFound();
  const isSelf = caller.id === row.id;
  const isAdmin = caller.role === 'admin';
  if (row.status !== 'active') {
    if (!isAdmin) throw notFound();
    return toPrivateAccount(row);
  }
  if (row.role === 'faculty' || row.role === 'alumni') {
    return isSelf || isAdmin ? toPrivateAccount(row) : toPublicProfile(row);
  }
  if (isSelf || isAdmin) return toPrivateAccount(row);
  throw notFound();
}

function parseExperience(body, { partial }) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['organization', 'positionTitle', 'description', 'startDate', 'endDate', 'isCurrent']);
  if (partial && !Object.keys(obj).length) throw invalid('body', 'required', 'At least one field is required.');
  if (!partial) {
    if (obj.organization === undefined) throw invalid('organization', 'required', 'This field is required.');
  }
  const parsed = {};
  if (obj.organization !== undefined) parsed.organization = asTrimmedString(obj.organization, 'organization', { min: 1, max: 200 });
  if (obj.positionTitle !== undefined) {
    parsed.positionTitle = asOptionalString(obj.positionTitle, 'positionTitle', { max: 200, nullable: true });
  }
  if (obj.description !== undefined) {
    parsed.description = asOptionalString(obj.description, 'description', { max: 4000, nullable: true, min: 0 });
  }
  if (obj.startDate !== undefined) parsed.startDate = asDate(obj.startDate, 'startDate', { nullable: true });
  if (obj.endDate !== undefined) parsed.endDate = asDate(obj.endDate, 'endDate', { nullable: true });
  if (obj.isCurrent !== undefined) parsed.isCurrent = asBoolean(obj.isCurrent, 'isCurrent');
  return parsed;
}

function assertExperienceDates(row) {
  if (row.isCurrent && row.endDate) {
    throw invalid('endDate', 'current', 'A current experience cannot have an end date.');
  }
  if (row.startDate && row.endDate && row.endDate < row.startDate) {
    throw invalid('endDate', 'range', 'End date must be on or after the start date.');
  }
}

async function listExperiences(userId) {
  const person = await userRepository.findProfileById({ query }, userId);
  if (!person || person.role !== 'alumni' || person.status !== 'active') throw notFound();
  const rows = await experienceRepository.listByAlumni({ query }, userId);
  return rows.map(toExperience);
}

async function createExperience(user, body) {
  if (user.role !== 'alumni') throw forbidden();
  const parsed = parseExperience(body, { partial: false });
  const row = {
    organization: parsed.organization,
    positionTitle: parsed.positionTitle ?? null,
    description: parsed.description ?? null,
    startDate: parsed.startDate ?? null,
    endDate: parsed.endDate ?? null,
    isCurrent: parsed.isCurrent ?? false,
  };
  assertExperienceDates(row);
  const created = await experienceRepository.insertExperience({ query }, { ...row, alumniUserId: user.id });
  return toExperience(created);
}

async function updateExperience(user, experienceId, body) {
  if (user.role !== 'alumni') throw forbidden();
  const existing = await experienceRepository.findById({ query }, experienceId);
  if (!existing || existing.alumni_user_id !== user.id) throw notFound();
  const parsed = parseExperience(body, { partial: true });
  const merged = {
    startDate: parsed.startDate !== undefined ? parsed.startDate : existing.start_date,
    endDate: parsed.endDate !== undefined ? parsed.endDate : existing.end_date,
    isCurrent: parsed.isCurrent !== undefined ? parsed.isCurrent : existing.is_current,
  };
  const start = merged.startDate instanceof Date ? merged.startDate.toISOString().slice(0, 10) : merged.startDate;
  const end = merged.endDate instanceof Date ? merged.endDate.toISOString().slice(0, 10) : merged.endDate;
  assertExperienceDates({ startDate: start, endDate: end, isCurrent: merged.isCurrent });
  const updated = await experienceRepository.updateExperience({ query }, experienceId, parsed);
  return toExperience(updated);
}

async function removeExperience(user, experienceId) {
  if (user.role !== 'alumni') throw forbidden();
  const removed = await experienceRepository.deleteExperience({ query }, experienceId, user.id);
  if (!removed) throw notFound();
  return { id: experienceId };
}

module.exports = {
  updateMe,
  replaceAreas,
  listFaculty,
  listAlumni,
  getFaculty,
  getAlumni,
  getUser,
  listExperiences,
  createExperience,
  updateExperience,
  removeExperience,
  parseProfilePatch,
};
