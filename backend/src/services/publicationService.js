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
const {
  MODERATION, PUBLICATION_CATEGORIES, REVIEW_TYPES, PUBLICATION_STATUSES,
} = require('../domain/constants');
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

function parseKeywords(value) {
  if (!Array.isArray(value)) throw invalid('keywords', 'type', 'Must be an array.');
  if (value.length > 25) throw invalid('keywords', 'length', 'At most 25 keywords are allowed.');
  const keywords = value.map((keyword, index) => (
    asTrimmedString(keyword, 'keywords', { min: 1, max: 100 })
  ));
  const normalized = keywords.map((keyword) => keyword.toLocaleLowerCase());
  if (new Set(normalized).size !== keywords.length) {
    throw invalid('keywords', 'duplicate', 'Keywords must be unique.');
  }
  return keywords;
}

function requireValue(record, field, message) {
  const value = record[field];
  if (value === undefined || value === null || value === '') {
    throw invalid(field, 'required', message || 'This field is required.');
  }
}

function assertHttpUrl(value) {
  if (value == null) return;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw invalid('url', 'format', 'Must be a valid HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw invalid('url', 'format', 'Must be a valid HTTP or HTTPS URL.');
  }
}

function assertCategoryFields(record) {
  requireValue(record, 'category', 'Choose a publication category.');
  requireValue(record, 'publicationYear', 'Publication year is required.');
  if (!Array.isArray(record.authors) || record.authors.length === 0) {
    throw invalid('authors', 'required', 'Add at least one author.');
  }
  assertHttpUrl(record.url);
  if (record.category === 'journal_article') {
    requireValue(record, 'journalName', 'Journal name is required for a journal article.');
  }
  if (record.category === 'conference_paper') {
    requireValue(record, 'conferenceName', 'Conference name is required for a conference paper.');
  }
  if (record.category === 'review_survey') {
    requireValue(record, 'reviewType', 'Review type is required for a review or survey paper.');
  }
  if (record.category === 'preprint') {
    requireValue(record, 'preprintServer', 'Preprint server is required for a preprint.');
    requireValue(record, 'url', 'URL is required for a preprint.');
    requireValue(record, 'publicationStatus', 'Publication status is required for a preprint.');
  }
}

const CATEGORY_FIELDS = {
  journal_article: new Set(['journalName', 'volume', 'issue', 'pageRange']),
  conference_paper: new Set(['conferenceName', 'proceedingsTitle', 'pageRange']),
  review_survey: new Set(['reviewType', 'journalName', 'conferenceName', 'volume', 'issue', 'pageRange']),
  preprint: new Set(['preprintServer', 'preprintId', 'version', 'publicationStatus']),
};

function rejectFieldsForCategory(parsed, category) {
  const categorySpecific = new Set(Object.values(CATEGORY_FIELDS).flatMap((fields) => [...fields]));
  const allowed = CATEGORY_FIELDS[category];
  for (const field of Object.keys(parsed)) {
    if (categorySpecific.has(field) && !allowed.has(field) && parsed[field] != null) {
      throw invalid(field, 'not_allowed', `This field does not apply to ${category.replaceAll('_', ' ')}.`);
    }
  }
  if (category === 'preprint' && parsed.publisher != null) {
    throw invalid('publisher', 'not_allowed', 'Publisher does not apply to a preprint.');
  }
}

function parseBody(body, { partial }) {
  const obj = assertObject(body);
  rejectUnknown(obj, [
    'category', 'title', 'abstract', 'venue', 'publicationYear', 'journalName',
    'conferenceName', 'proceedingsTitle', 'volume', 'issue', 'pageRange',
    'publisher', 'keywords', 'reviewType', 'preprintServer', 'preprintId',
    'version', 'publicationStatus', 'doi', 'url', 'publishedOn',
    'moderationStatus', 'researchAreaIds', 'authors',
  ]);
  if (partial && !Object.keys(obj).length) throw invalid('body', 'required', 'At least one field is required.');
  if (!partial && obj.category === undefined) throw invalid('category', 'required', 'Choose a publication category.');
  if (!partial && obj.title === undefined) throw invalid('title', 'required', 'This field is required.');
  if (!partial && obj.publicationYear === undefined) throw invalid('publicationYear', 'required', 'This field is required.');
  if (!partial && obj.authors === undefined) throw invalid('authors', 'required', 'Add at least one author.');
  if (partial && obj.moderationStatus !== undefined) {
    throw invalid('moderationStatus', 'not_allowed', 'Use the submit or moderation endpoint for status changes.');
  }
  const parsed = {};
  if (obj.category !== undefined) parsed.category = asEnum(obj.category, 'category', PUBLICATION_CATEGORIES);
  if (obj.title !== undefined) parsed.title = asTrimmedString(obj.title, 'title', { min: 1, max: 500 });
  if (obj.abstract !== undefined) parsed.abstract = asOptionalString(obj.abstract, 'abstract', { max: 20000, nullable: true });
  if (obj.venue !== undefined) parsed.venue = asOptionalString(obj.venue, 'venue', { max: 300, nullable: true });
  if (obj.publicationYear !== undefined) {
    parsed.publicationYear = obj.publicationYear === null
      ? null
      : asInteger(obj.publicationYear, 'publicationYear', { min: 1950, max: 2100 });
  }
  if (obj.journalName !== undefined) parsed.journalName = asOptionalString(obj.journalName, 'journalName', { max: 300, nullable: true });
  if (obj.conferenceName !== undefined) parsed.conferenceName = asOptionalString(obj.conferenceName, 'conferenceName', { max: 300, nullable: true });
  if (obj.proceedingsTitle !== undefined) parsed.proceedingsTitle = asOptionalString(obj.proceedingsTitle, 'proceedingsTitle', { max: 500, nullable: true });
  if (obj.volume !== undefined) parsed.volume = asOptionalString(obj.volume, 'volume', { max: 100, nullable: true });
  if (obj.issue !== undefined) parsed.issue = asOptionalString(obj.issue, 'issue', { max: 100, nullable: true });
  if (obj.pageRange !== undefined) parsed.pageRange = asOptionalString(obj.pageRange, 'pageRange', { max: 100, nullable: true });
  if (obj.publisher !== undefined) parsed.publisher = asOptionalString(obj.publisher, 'publisher', { max: 300, nullable: true });
  if (obj.keywords !== undefined) parsed.keywords = parseKeywords(obj.keywords);
  if (obj.reviewType !== undefined) {
    parsed.reviewType = obj.reviewType === null ? null : asEnum(obj.reviewType, 'reviewType', REVIEW_TYPES);
  }
  if (obj.preprintServer !== undefined) parsed.preprintServer = asOptionalString(obj.preprintServer, 'preprintServer', { max: 200, nullable: true });
  if (obj.preprintId !== undefined) parsed.preprintId = asOptionalString(obj.preprintId, 'preprintId', { max: 200, nullable: true });
  if (obj.version !== undefined) parsed.version = asOptionalString(obj.version, 'version', { max: 100, nullable: true });
  if (obj.publicationStatus !== undefined) {
    parsed.publicationStatus = obj.publicationStatus === null
      ? null
      : asEnum(obj.publicationStatus, 'publicationStatus', PUBLICATION_STATUSES);
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
  if (!['student', 'faculty', 'alumni', 'admin'].includes(user.role)) throw forbidden();
  const parsed = parseBody(body, { partial: false });
  rejectFieldsForCategory(parsed, parsed.category);
  assertCategoryFields(parsed);
  parsed.moderationStatus = assertModerationCreate(parsed.moderationStatus);
  const id = await withTransaction(async (db) => {
    await assertActiveAreas(db, parsed.researchAreaIds || []);
    if (parsed.authors) await assertAcademicProfiles(db, parsed.authors.map((a) => a.userId), 'authors');
    const createdId = await publicationRepository.insertPublication(db, {
      createdByUserId: user.id,
      category: parsed.category,
      title: parsed.title,
      abstract: parsed.abstract ?? null,
      venue: parsed.venue ?? null,
      publicationYear: parsed.publicationYear ?? null,
      journalName: parsed.journalName ?? null,
      conferenceName: parsed.conferenceName ?? null,
      proceedingsTitle: parsed.proceedingsTitle ?? null,
      volume: parsed.volume ?? null,
      issue: parsed.issue ?? null,
      pageRange: parsed.pageRange ?? null,
      publisher: parsed.publisher ?? null,
      keywords: parsed.keywords ?? [],
      reviewType: parsed.reviewType ?? null,
      preprintServer: parsed.preprintServer ?? null,
      preprintId: parsed.preprintId ?? null,
      version: parsed.version ?? null,
      publicationStatus: parsed.publicationStatus ?? null,
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
    category: parseQueryEnum(queryParams.category, 'category', PUBLICATION_CATEGORIES),
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
  if (existing.category && parsed.category && parsed.category !== existing.category) {
    throw invalid('category', 'immutable', 'The category cannot be changed after the publication is created.');
  }
  const category = existing.category || parsed.category;
  if (!category) throw invalid('category', 'required', 'Choose a publication category.');
  rejectFieldsForCategory(parsed, category);
  const combined = {
    category,
    publicationYear: parsed.publicationYear !== undefined ? parsed.publicationYear : existing.publication_year,
    authors: parsed.authors !== undefined ? parsed.authors : existing.authors,
    journalName: parsed.journalName !== undefined ? parsed.journalName : existing.journal_name,
    conferenceName: parsed.conferenceName !== undefined ? parsed.conferenceName : existing.conference_name,
    reviewType: parsed.reviewType !== undefined ? parsed.reviewType : existing.review_type,
    preprintServer: parsed.preprintServer !== undefined ? parsed.preprintServer : existing.preprint_server,
    publicationStatus: parsed.publicationStatus !== undefined ? parsed.publicationStatus : existing.publication_status,
    url: parsed.url !== undefined ? parsed.url : existing.url,
  };
  assertCategoryFields(combined);
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
  assertCategoryFields({
    category: existing.category,
    publicationYear: existing.publication_year,
    authors: existing.authors,
    journalName: existing.journal_name,
    conferenceName: existing.conference_name,
    reviewType: existing.review_type,
    preprintServer: existing.preprint_server,
    publicationStatus: existing.publication_status,
    url: existing.url,
  });
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

module.exports = { create, list, get, update, submit, remove, assertCategoryFields };
