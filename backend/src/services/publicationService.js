const { query, withTransaction } = require('../db/pool');
const publicationRepository = require('../repositories/publicationRepository');
const { insertActivity } = require('../repositories/audit');
const { toPublication } = require('../utils/presenters');
const { forbidden, invalid, notFound, badRequest } = require('../utils/errors');
const { meta, parsePage, parseOrder, resolveSort } = require('../utils/pagination');
const {
  assertObject, rejectUnknown, asTrimmedString, asOptionalString, asUuid, asEnum,
  asInteger, asDate, asUuidArray, parseQueryUuid, parseQueryUuidList, parseOptionalText,
  parseQueryEnum, parseQueryBool, parseQueryInt, assertEmptyBody, likePattern,
} = require('../validators/common');
const { MODERATION } = require('../domain/constants');
const {
  assertActiveAreas, assertKnownAreas, assertAcademicProfiles, requireVisible,
  assertModerationCreate, assertSubmitTransition,
} = require('./rules');

function parseAuthors(value) {
  if (!Array.isArray(value)) throw invalid('authors', 'type', 'Must be an array.');
  const users = new Set();
  const orders = new Set();
  return value.map((author, index) => {
    if (!author || typeof author !== 'object' || Array.isArray(author)) {
      throw invalid('authors', 'type', `Item ${index} must be an object.`);
    }
    rejectUnknown(author, ['userId', 'authorOrder']);
    const userId = asUuid(author.userId, 'authors');
    const authorOrder = asInteger(author.authorOrder, 'authorOrder', { min: 1, max: 32767 });
    if (users.has(userId)) throw invalid('authors', 'duplicate', 'A user can be listed only once.');
    if (orders.has(authorOrder)) throw invalid('authors', 'unique', 'Author order must be unique within the publication.');
    users.add(userId);
    orders.add(authorOrder);
    return { userId, authorOrder };
  });
}

function parseBody(body, { partial }) {
  const obj = assertObject(body);
  rejectUnknown(obj, [
    'title', 'abstract', 'venue', 'publicationYear', 'doi', 'url', 'publishedOn',
    'moderationStatus', 'researchAreaIds', 'authors',
  ]);
  if (partial && !Object.keys(obj).length) throw invalid('body', 'required', 'At least one field is required.');
  if (!partial && obj.title === undefined) throw invalid('title', 'required', 'This field is required.');
  if (partial && obj.moderationStatus !== undefined) {
    throw invalid('moderationStatus', 'not_allowed', 'Use the submit or moderation endpoint for status changes.');
  }
  const parsed = {};
  if (obj.title !== undefined) parsed.title = asTrimmedString(obj.title, 'title', { min: 1, max: 500 });
  if (obj.abstract !== undefined) parsed.abstract = asOptionalString(obj.abstract, 'abstract', { max: 20000, nullable: true });
  if (obj.venue !== undefined) parsed.venue = asOptionalString(obj.venue, 'venue', { max: 300, nullable: true });
  if (obj.publicationYear !== undefined) {
    parsed.publicationYear = obj.publicationYear === null
      ? null
      : asInteger(obj.publicationYear, 'publicationYear', { min: 1950, max: 2100 });
  }
  if (obj.doi !== undefined) parsed.doi = asOptionalString(obj.doi, 'doi', { max: 255, nullable: true });
  if (obj.url !== undefined) parsed.url = asOptionalString(obj.url, 'url', { max: 2000, nullable: true, trim: false });
  if (obj.publishedOn !== undefined) parsed.publishedOn = asDate(obj.publishedOn, 'publishedOn', { nullable: true });
  if (obj.moderationStatus !== undefined) parsed.moderationStatus = asEnum(obj.moderationStatus, 'moderationStatus', MODERATION);
  if (obj.researchAreaIds !== undefined) parsed.researchAreaIds = asUuidArray(obj.researchAreaIds, 'researchAreaIds');
  if (obj.authors !== undefined) parsed.authors = parseAuthors(obj.authors);
  return parsed;
}

async function create(user, body) {
  if (!['faculty', 'alumni', 'admin'].includes(user.role)) throw forbidden();
  const parsed = parseBody(body, { partial: false });
  parsed.moderationStatus = assertModerationCreate(parsed.moderationStatus);
  const id = await withTransaction(async (db) => {
    await assertActiveAreas(db, parsed.researchAreaIds || []);
    if (parsed.authors) await assertAcademicProfiles(db, parsed.authors.map((a) => a.userId), 'authors');
    const createdId = await publicationRepository.insertPublication(db, {
      createdByUserId: user.id,
      title: parsed.title,
      abstract: parsed.abstract ?? null,
      venue: parsed.venue ?? null,
      publicationYear: parsed.publicationYear ?? null,
      doi: parsed.doi ?? null,
      url: parsed.url ?? null,
      publishedOn: parsed.publishedOn ?? null,
      moderationStatus: parsed.moderationStatus,
    });
    if (parsed.researchAreaIds) await publicationRepository.replaceAreas(db, createdId, parsed.researchAreaIds);
    if (parsed.authors) await publicationRepository.replaceAuthors(db, createdId, parsed.authors);
    return createdId;
  });
  return toPublication(await publicationRepository.findById({ query }, id));
}

async function list(user, queryParams) {
  const areaIds = parseQueryUuidList(queryParams.researchAreaId, 'researchAreaId');
  if (queryParams.researchAreaMatch && !['any', 'all'].includes(queryParams.researchAreaMatch)) {
    throw badRequest('Query parameter researchAreaMatch must be any or all.');
  }
  const yearFrom = parseQueryInt(queryParams.yearFrom, 'yearFrom', { min: 1950, max: 2100 });
  const yearTo = parseQueryInt(queryParams.yearTo, 'yearTo', { min: 1950, max: 2100 });
  if (yearFrom != null && yearTo != null && yearFrom > yearTo) {
    throw invalid('yearFrom', 'range', 'yearFrom must be less than or equal to yearTo.');
  }
  const mine = parseQueryBool(queryParams.mine, 'mine') === true;
  let moderationStatus = parseQueryEnum(queryParams.moderationStatus, 'moderationStatus', MODERATION);
  if (user.role !== 'admin' && !mine) moderationStatus = 'approved';
  const venue = parseOptionalText(queryParams.venue, 'venue', 300);
  const filters = {
    q: parseOptionalText(queryParams.q, 'q', 200),
    areaIds,
    areaMatch: queryParams.researchAreaMatch || 'any',
    authorUserId: parseQueryUuid(queryParams.authorUserId, 'authorUserId'),
    yearFrom,
    yearTo,
    venue: venue ? likePattern(venue) : undefined,
    mineUserId: mine ? user.id : undefined,
    moderationStatus,
  };
  const paging = parsePage(queryParams);
  paging.orderBy = resolveSort(queryParams.sort, parseOrder(queryParams.order), {
    createdAt: 'p.created_at',
    publicationYear: 'p.publication_year',
    title: 'p.title',
  }, { createdAt: 'desc', publicationYear: 'desc', title: 'asc' });
  if (queryParams.sort === 'publicationYear') paging.orderBy += ' NULLS LAST';
  await assertKnownAreas({ query }, areaIds);
  const result = await publicationRepository.list({ query }, filters, paging);
  return { data: result.rows.map(toPublication), meta: meta(paging.page, paging.pageSize, result.total) };
}

async function get(user, id) {
  const row = await publicationRepository.findById({ query }, id);
  requireVisible(user, row, [row && row.created_by_user_id]);
  return toPublication(row);
}

async function update(user, id, body) {
  const existing = await publicationRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.created_by_user_id]);
  const isAdmin = user.role === 'admin';
  if (user.id !== existing.created_by_user_id && !isAdmin) throw forbidden();
  const parsed = parseBody(body, { partial: true });
  if (existing.moderation_status === 'approved') {
    if (parsed.researchAreaIds && parsed.researchAreaIds.length === 0) {
      throw invalid('researchAreaIds', 'required', 'An approved publication must keep at least one research area.');
    }
    if (parsed.authors && parsed.authors.length === 0) {
      throw invalid('authors', 'required', 'An approved publication must keep at least one author.');
    }
  }
  await withTransaction(async (db) => {
    if (parsed.researchAreaIds) await assertActiveAreas(db, parsed.researchAreaIds);
    if (parsed.authors) await assertAcademicProfiles(db, parsed.authors.map((a) => a.userId), 'authors');
    await publicationRepository.updatePublication(db, id, parsed);
    if (parsed.researchAreaIds) await publicationRepository.replaceAreas(db, id, parsed.researchAreaIds);
    if (parsed.authors) await publicationRepository.replaceAuthors(db, id, parsed.authors);
    if (isAdmin) {
      await insertActivity(db, {
        actorUserId: user.id,
        action: 'publication.updated',
        entityType: 'publications',
        entityId: id,
        summary: 'Administrator updated a publication.',
      });
    }
  });
  return toPublication(await publicationRepository.findById({ query }, id));
}

async function submit(user, id, body) {
  assertEmptyBody(body);
  const existing = await publicationRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.created_by_user_id]);
  if (user.id !== existing.created_by_user_id) throw forbidden();
  assertSubmitTransition(existing.moderation_status);
  await publicationRepository.updatePublication({ query }, id, { moderationStatus: 'pending' });
  return toPublication(await publicationRepository.findById({ query }, id));
}

async function remove(user, id) {
  const existing = await publicationRepository.findById({ query }, id);
  requireVisible(user, existing, [existing && existing.created_by_user_id]);
  const isAdmin = user.role === 'admin';
  if (user.id !== existing.created_by_user_id && !isAdmin) throw forbidden();
  if (!isAdmin && !['draft', 'rejected'].includes(existing.moderation_status)) throw forbidden();
  await withTransaction(async (db) => {
    await publicationRepository.deletePublication(db, id);
    if (isAdmin) {
      await insertActivity(db, {
        actorUserId: user.id,
        action: 'publication.deleted',
        entityType: 'publications',
        entityId: id,
        summary: 'Administrator deleted a publication.',
      });
    }
  });
  return { id };
}

module.exports = { create, list, get, update, submit, remove };
