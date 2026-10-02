const { invalid, forbidden, notFound, conflict } = require('../utils/errors');
const referenceRepository = require('../repositories/referenceRepository');
const userRepository = require('../repositories/userRepository');

async function assertDepartment(db, departmentId) {
  const exists = await referenceRepository.departmentExists(db, departmentId);
  if (!exists) throw invalid('departmentId', 'reference', 'Department does not exist.');
}

async function assertActiveAreas(db, ids, field = 'researchAreaIds') {
  if (!ids || !ids.length) return;
  const found = await referenceRepository.activeAreaIds(db, ids);
  if (found.length !== ids.length) {
    throw invalid(field, 'reference', 'Each research area must exist and be active.');
  }
}

async function assertKnownAreas(db, ids) {
  if (!ids.length) return;
  const found = await referenceRepository.existingAreaIds(db, ids);
  if (found.length !== new Set(ids).size) {
    throw invalid('researchAreaId', 'reference', 'Unknown research area.');
  }
}

async function assertAcademicProfiles(db, userIds, field) {
  const found = new Set(await userRepository.academicProfileIds(db, userIds));
  const missing = userIds.filter((id) => !found.has(id));
  if (missing.length) {
    throw invalid(field, 'profile', 'Each person must have a student, faculty, or alumni profile.');
  }
}

function canSeeModerated(user, row, ownerIds) {
  if (!row) return false;
  if (user.role === 'admin') return true;
  if (ownerIds.filter(Boolean).includes(user.id)) return true;
  return row.moderation_status === 'approved';
}

function requireVisible(user, row, ownerIds) {
  if (!row || !canSeeModerated(user, row, ownerIds)) throw notFound();
  return row;
}

function requireOwnerOrAdmin(user, ownerId) {
  if (user.role === 'admin' || user.id === ownerId) return;
  throw forbidden();
}

function assertModerationCreate(value) {
  if (value === undefined) return 'draft';
  if (value === 'draft' || value === 'pending') return value;
  throw forbidden('You cannot set that moderation status.');
}

function assertSubmitTransition(status) {
  if (status !== 'draft' && status !== 'rejected') {
    throw conflict('Only a draft or rejected record can be submitted.');
  }
}

function publishedMessage(title) {
  const prefix = 'A new research opportunity was published: ';
  const max = 2000 - prefix.length - 1;
  const trimmed = title.length > max ? title.slice(0, max) : title;
  return `${prefix}${trimmed}.`;
}

function requestMeta(req) {
  const agent = req.get('user-agent');
  const userAgent = agent ? agent.slice(0, 500) : null;
  const ip = req.ip || '';
  const clientIp = /^[0-9a-f:.]+$/i.test(ip) ? ip : null;
  return { userAgent, clientIp };
}

module.exports = {
  assertDepartment,
  assertActiveAreas,
  assertKnownAreas,
  assertAcademicProfiles,
  canSeeModerated,
  requireVisible,
  requireOwnerOrAdmin,
  assertModerationCreate,
  assertSubmitTransition,
  publishedMessage,
  requestMeta,
};
