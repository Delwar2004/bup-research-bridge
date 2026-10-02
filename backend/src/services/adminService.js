const { query, withTransaction } = require('../db/pool');
const userRepository = require('../repositories/userRepository');
const experienceRepository = require('../repositories/experienceRepository');
const opportunityRepository = require('../repositories/opportunityRepository');
const projectRepository = require('../repositories/projectRepository');
const publicationRepository = require('../repositories/publicationRepository');
const notificationRepository = require('../repositories/notificationRepository');
const reportRepository = require('../repositories/reportRepository');
const referenceRepository = require('../repositories/referenceRepository');
const { insertActivity, insertNotification } = require('../repositories/audit');
const {
  toPrivateAccount, toExperience, toOpportunity, toProject, toPublication, toActivity, toResearchArea,
} = require('../utils/presenters');
const { invalid, notFound, conflict } = require('../utils/errors');
const { meta, parsePage, parseOrder, resolveSort } = require('../utils/pagination');
const {
  assertObject, rejectUnknown, asEnum, asTrimmedString, asOptionalString, asBoolean, asUuid,
  parseQueryUuid, parseQueryEnum, parseOptionalText, parseDateTime, likePattern, SLUG_RE,
} = require('../validators/common');
const { ROLES, ACCOUNT_STATUS, MODERATION } = require('../domain/constants');
const { parseRegistration, createAccount } = require('./authService');
const { parseProfilePatch } = require('./profileService');
const { assertActiveAreas, publishedMessage } = require('./rules');

async function listUsers(queryParams) {
  const filters = {
    q: parseOptionalText(queryParams.q, 'q', 200),
    role: parseQueryEnum(queryParams.role, 'role', ROLES),
    status: parseQueryEnum(queryParams.status, 'status', ACCOUNT_STATUS),
    departmentId: parseQueryUuid(queryParams.departmentId, 'departmentId'),
  };
  if (filters.q) filters.q = likePattern(filters.q);
  const paging = parsePage(queryParams);
  paging.orderBy = resolveSort(queryParams.sort, parseOrder(queryParams.order), {
    createdAt: 'u.created_at',
    fullName: 'u.full_name',
    email: 'u.email',
    lastLoginAt: 'u.last_login_at',
  }, { createdAt: 'desc', fullName: 'asc', email: 'asc', lastLoginAt: 'desc' });
  if (queryParams.sort === 'lastLoginAt') paging.orderBy += ' NULLS LAST';
  const result = await userRepository.listUsersAdmin({ query }, filters, paging);
  return { data: result.rows.map(toPrivateAccount), meta: meta(paging.page, paging.pageSize, result.total) };
}

async function createUser(actor, body) {
  const parsed = parseRegistration(body, { allowAdmin: true, allowStatus: true });
  const created = await withTransaction(async (db) => {
    const user = await createAccount(db, parsed);
    await insertActivity(db, {
      actorUserId: actor.id,
      action: 'user.created',
      entityType: 'users',
      entityId: user.id,
      summary: `Created a ${user.role} account.`,
      metadata: { role: user.role, status: user.status },
    });
    if (user.status === 'active' || user.status === 'rejected') {
      await insertNotification(db, {
        recipientUserId: user.id,
        type: 'account_updated',
        message: `Your account status is now ${user.status}.`,
        payload: { status: user.status },
      });
    }
    return user.id;
  });
  const profile = await userRepository.findProfileById({ query }, created);
  return toPrivateAccount(profile);
}

async function getUser(userId) {
  const profile = await userRepository.findProfileById({ query }, userId);
  if (!profile) throw notFound();
  const data = toPrivateAccount(profile);
  if (profile.role === 'alumni') {
    const rows = await experienceRepository.listByAlumni({ query }, userId);
    data.experiences = rows.map(toExperience);
  }
  return data;
}

async function updateUser(actor, userId, body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['fullName', 'email', 'status']);
  if (!Object.keys(obj).length) throw invalid('body', 'required', 'At least one field is required.');
  const existing = await userRepository.findProfileById({ query }, userId);
  if (!existing) throw notFound();
  const parsed = {};
  if (obj.fullName !== undefined) parsed.fullName = asTrimmedString(obj.fullName, 'fullName', { min: 1, max: 200 });
  if (obj.email !== undefined) {
    const { asEmail } = require('../validators/common');
    parsed.email = asEmail(obj.email);
  }
  if (obj.status !== undefined) parsed.status = asEnum(obj.status, 'status', ACCOUNT_STATUS);
  const statusChanged = parsed.status !== undefined && parsed.status !== existing.status;
  await withTransaction(async (db) => {
    await userRepository.updateUserAccount(db, userId, parsed);
    if (statusChanged && parsed.status !== 'active') {
      await userRepository.revokeAllRefreshTokens(db, userId);
    }
    if (statusChanged) {
      await insertNotification(db, {
        recipientUserId: userId,
        type: 'account_updated',
        message: `Your account status is now ${parsed.status}.`,
        payload: { status: parsed.status },
      });
    }
    await insertActivity(db, {
      actorUserId: actor.id,
      action: statusChanged ? 'user.status_changed' : 'user.updated',
      entityType: 'users',
      entityId: userId,
      summary: statusChanged ? `Account status set to ${parsed.status}.` : 'Account details updated.',
      metadata: statusChanged ? { status: parsed.status } : {},
    });
  });
  return toPrivateAccount(await userRepository.findProfileById({ query }, userId));
}

function parseRoleProfile(role, profile) {
  if (role === 'admin') {
    if (profile !== undefined) throw invalid('profile', 'not_allowed', 'Administrator accounts do not have a role profile.');
    return null;
  }
  const allowed = {
    student: ['departmentId', 'batch', 'profilePhotoUrl', 'bio'],
    faculty: ['departmentId', 'designation', 'mentoringAvailability', 'profilePhotoUrl', 'bio'],
    alumni: ['departmentId', 'batch', 'currentOrganization', 'mentoringAvailability', 'profilePhotoUrl', 'bio'],
  };
  const obj = profile || {};
  if (profile !== undefined) {
    assertObject(profile);
    rejectUnknown(profile, allowed[role]);
  }
  const parsed = {};
  if (obj.departmentId !== undefined) parsed.departmentId = asUuid(obj.departmentId, 'departmentId');
  if (obj.batch !== undefined) parsed.batch = asTrimmedString(obj.batch, 'batch', { min: 1, max: 32 });
  if (obj.designation !== undefined) parsed.designation = asTrimmedString(obj.designation, 'designation', { min: 1, max: 200 });
  if (obj.currentOrganization !== undefined) {
    parsed.currentOrganization = asOptionalString(obj.currentOrganization, 'currentOrganization', { max: 200, nullable: true });
  }
  if (obj.mentoringAvailability !== undefined) parsed.mentoringAvailability = asBoolean(obj.mentoringAvailability, 'mentoringAvailability');
  if (obj.profilePhotoUrl !== undefined) {
    parsed.profilePhotoUrl = asOptionalString(obj.profilePhotoUrl, 'profilePhotoUrl', { max: 2000, nullable: true });
  }
  if (obj.bio !== undefined) parsed.bio = asOptionalString(obj.bio, 'bio', { max: 5000, nullable: true, min: 0 });
  return parsed;
}

async function changeRole(actor, userId, body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['role', 'profile']);
  if (obj.role === undefined) throw invalid('role', 'required', 'This field is required.');
  const role = asEnum(obj.role, 'role', ROLES);
  const existing = await userRepository.findProfileById({ query }, userId);
  if (!existing) throw notFound();
  if (existing.role === role) return toPrivateAccount(existing);
  const profile = parseRoleProfile(role, obj.profile);
  await withTransaction(async (db) => {
    const exists = await userRepository.profileExists(db, role, userId);
    if (role !== 'admin' && !exists) {
      if (!profile || !profile.departmentId) {
        throw invalid('profile.departmentId', 'required', 'A department is required for the new role.');
      }
      if ((role === 'student' || role === 'alumni') && !profile.batch) {
        throw invalid('profile.batch', 'required', 'A batch is required for the new role.');
      }
      if (role === 'faculty' && !profile.designation) {
        throw invalid('profile.designation', 'required', 'A designation is required for the new role.');
      }
      const { assertDepartment } = require('./rules');
      await assertDepartment(db, profile.departmentId);
    }
    await userRepository.updateUserAccount(db, userId, { role });
    if (role !== 'admin' && !exists) {
      if (role === 'student') {
        await userRepository.insertStudent(db, {
          userId,
          departmentId: profile.departmentId,
          batch: profile.batch,
          profilePhotoUrl: profile.profilePhotoUrl ?? null,
          bio: profile.bio ?? null,
        });
      } else if (role === 'faculty') {
        await userRepository.insertFaculty(db, {
          userId,
          departmentId: profile.departmentId,
          designation: profile.designation,
          mentoringAvailability: profile.mentoringAvailability ?? false,
          profilePhotoUrl: profile.profilePhotoUrl ?? null,
          bio: profile.bio ?? null,
        });
      } else if (role === 'alumni') {
        await userRepository.insertAlumni(db, {
          userId,
          departmentId: profile.departmentId,
          batch: profile.batch,
          currentOrganization: profile.currentOrganization ?? null,
          mentoringAvailability: profile.mentoringAvailability ?? false,
          profilePhotoUrl: profile.profilePhotoUrl ?? null,
          bio: profile.bio ?? null,
        });
      }
    }
    await insertNotification(db, {
      recipientUserId: userId,
      type: 'account_updated',
      message: `Your account role is now ${role}.`,
      payload: { role },
    });
    await insertActivity(db, {
      actorUserId: actor.id,
      action: 'user.role_changed',
      entityType: 'users',
      entityId: userId,
      summary: `Role changed to ${role}.`,
      metadata: { role },
    });
  });
  return toPrivateAccount(await userRepository.findProfileById({ query }, userId));
}

async function updateProfile(actor, userId, body) {
  const existing = await userRepository.findProfileById({ query }, userId);
  if (!existing) throw notFound();
  if (existing.role === 'admin') {
    throw invalid('profile', 'not_allowed', 'Administrator accounts do not have a role profile.');
  }
  const obj = assertObject(body);
  if (Object.prototype.hasOwnProperty.call(obj, 'fullName') || Object.prototype.hasOwnProperty.call(obj, 'email')) {
    throw invalid('fullName', 'not_allowed', 'Change name and email with the account endpoint.');
  }
  const parsed = parseProfilePatch(existing.role, body);
  delete parsed.fullName;
  delete parsed.email;
  if (!Object.keys(parsed).length) throw invalid('body', 'required', 'At least one profile field is required.');
  await withTransaction(async (db) => {
    if (parsed.departmentId) {
      const { assertDepartment } = require('./rules');
      await assertDepartment(db, parsed.departmentId);
    }
    await userRepository.updateRoleProfile(db, existing.role, userId, parsed);
    await insertActivity(db, {
      actorUserId: actor.id,
      action: 'user.profile_updated',
      entityType: 'users',
      entityId: userId,
      summary: 'Administrator updated a role profile.',
    });
  });
  return toPrivateAccount(await userRepository.findProfileById({ query }, userId));
}

function parseModeration(body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['moderationStatus', 'note']);
  if (obj.moderationStatus === undefined) throw invalid('moderationStatus', 'required', 'This field is required.');
  const moderationStatus = asEnum(obj.moderationStatus, 'moderationStatus', ['approved', 'rejected', 'archived']);
  let note;
  if (obj.note !== undefined) note = asTrimmedString(obj.note, 'note', { min: 1, max: 500 });
  return { moderationStatus, note };
}

async function moderate(actor, kind, id, body) {
  const { moderationStatus, note } = parseModeration(body);
  const loaders = {
    opportunity: opportunityRepository,
    project: projectRepository,
    publication: publicationRepository,
  };
  const repo = loaders[kind];
  const existing = await repo.findById({ query }, id);
  if (!existing) throw notFound();
  if (existing.moderation_status === moderationStatus) {
    throw conflict('The record already has that moderation status.');
  }
  const ownerId = kind === 'opportunity' ? existing.faculty_user_id : existing.created_by_user_id;
  const entityType = kind === 'opportunity' ? 'thesis_opportunities' : kind === 'project' ? 'research_projects' : 'publications';
  const action = kind === 'opportunity' ? 'opportunity.moderated' : kind === 'project' ? 'project.moderated' : 'publication.moderated';
  const label = kind === 'opportunity' ? 'opportunity' : kind === 'project' ? 'research project' : 'publication';
  await withTransaction(async (db) => {
    if (kind === 'opportunity') await opportunityRepository.updateOpportunity(db, id, { moderationStatus });
    if (kind === 'project') await projectRepository.updateProject(db, id, { moderationStatus });
    if (kind === 'publication') await publicationRepository.updatePublication(db, id, { moderationStatus });
    await insertNotification(db, {
      recipientUserId: ownerId,
      type: 'content_moderated',
      message: `Your ${label} was ${moderationStatus}.`,
      opportunityId: kind === 'opportunity' ? id : null,
      payload: { entityType, entityId: id, moderationStatus },
    });
    if (kind === 'opportunity' && moderationStatus === 'approved') {
      await notificationRepository.notifyActiveStudentsOfOpportunity(
        db,
        id,
        publishedMessage(existing.title),
        existing.title,
      );
    }
    await insertActivity(db, {
      actorUserId: actor.id,
      action,
      entityType,
      entityId: id,
      summary: note || `Moderation set to ${moderationStatus}.`,
      metadata: { moderationStatus, ...(note ? { note } : {}) },
    });
  });
  const fresh = await repo.findById({ query }, id);
  if (kind === 'opportunity') return toOpportunity(fresh);
  if (kind === 'project') return toProject(fresh);
  return toPublication(fresh);
}

async function listActivity(queryParams) {
  const from = parseDateTime(queryParams.from, 'from');
  const to = parseDateTime(queryParams.to, 'to');
  if (from && to && from > to) throw invalid('from', 'range', 'from must be earlier than or equal to to.');
  const filters = {
    actorUserId: parseQueryUuid(queryParams.actorUserId, 'actorUserId'),
    action: parseOptionalText(queryParams.action, 'action', 64),
    entityType: parseOptionalText(queryParams.entityType, 'entityType', 64),
    entityId: parseQueryUuid(queryParams.entityId, 'entityId'),
    from,
    to,
  };
  const paging = parsePage(queryParams);
  const result = await reportRepository.listActivity({ query }, filters, paging);
  return { data: result.rows.map(toActivity), meta: meta(paging.page, paging.pageSize, result.total) };
}

async function report(queryParams) {
  const from = parseDateTime(queryParams.from, 'from');
  const to = parseDateTime(queryParams.to, 'to');
  if (from && to && from > to) throw invalid('from', 'range', 'from must be earlier than or equal to to.');
  return reportRepository.summary({ query }, { from, to });
}

async function createArea(actor, body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['slug', 'name', 'description', 'isActive']);
  if (obj.slug === undefined) throw invalid('slug', 'required', 'This field is required.');
  if (obj.name === undefined) throw invalid('name', 'required', 'This field is required.');
  const slug = asTrimmedString(obj.slug, 'slug', { min: 1, max: 80, trim: true });
  if (!SLUG_RE.test(slug)) throw invalid('slug', 'format', 'Slug must be lowercase words separated by hyphens.');
  const name = asTrimmedString(obj.name, 'name', { min: 1, max: 150 });
  const description = obj.description === undefined
    ? null
    : asOptionalString(obj.description, 'description', { max: 4000, nullable: true, min: 0 });
  const isActive = obj.isActive === undefined ? true : asBoolean(obj.isActive, 'isActive');
  const row = await withTransaction(async (db) => {
    const created = await referenceRepository.insertResearchArea(db, { slug, name, description, isActive });
    await insertActivity(db, {
      actorUserId: actor.id,
      action: 'research_area.created',
      entityType: 'research_areas',
      entityId: created.id,
      summary: `Created research area ${name}.`,
    });
    return created;
  });
  return toResearchArea(row);
}

async function updateArea(actor, id, body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['name', 'description', 'isActive']);
  if (!Object.keys(obj).length) throw invalid('body', 'required', 'At least one field is required.');
  const fields = {};
  if (obj.name !== undefined) fields.name = asTrimmedString(obj.name, 'name', { min: 1, max: 150 });
  if (obj.description !== undefined) {
    fields.description = asOptionalString(obj.description, 'description', { max: 4000, nullable: true, min: 0 });
  }
  if (obj.isActive !== undefined) fields.isActive = asBoolean(obj.isActive, 'isActive');
  const row = await withTransaction(async (db) => {
    const updated = await referenceRepository.updateResearchArea(db, id, fields);
    if (!updated) throw notFound();
    await insertActivity(db, {
      actorUserId: actor.id,
      action: 'research_area.updated',
      entityType: 'research_areas',
      entityId: id,
      summary: 'Updated a research area.',
    });
    return updated;
  });
  return toResearchArea(row);
}

module.exports = {
  listUsers,
  createUser,
  getUser,
  updateUser,
  changeRole,
  updateProfile,
  moderate,
  listActivity,
  report,
  createArea,
  updateArea,
};
