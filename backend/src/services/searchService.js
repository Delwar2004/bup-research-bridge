const { query } = require('../db/pool');
const userRepository = require('../repositories/userRepository');
const opportunityRepository = require('../repositories/opportunityRepository');
const projectRepository = require('../repositories/projectRepository');
const publicationRepository = require('../repositories/publicationRepository');
const { toPublicProfile, toOpportunity, toProject, toPublication } = require('../utils/presenters');
const { badRequest, invalid } = require('../utils/errors');
const { meta, parsePage, resolveSort } = require('../utils/pagination');
const {
  parseQueryUuid, parseQueryUuidList, parseOptionalText, likePattern,
} = require('../validators/common');
const { assertKnownAreas } = require('./rules');

const TYPES = ['opportunities', 'research_projects', 'publications', 'faculty', 'alumni'];

async function search(user, queryParams) {
  const q = parseOptionalText(queryParams.q, 'q', 200);
  if (!q) throw invalid('q', 'required', 'A search query is required.');
  if (!TYPES.includes(queryParams.type)) throw badRequest('Query parameter type is not supported.');
  const areaIds = parseQueryUuidList(queryParams.researchAreaId, 'researchAreaId');
  if (queryParams.researchAreaMatch && !['any', 'all'].includes(queryParams.researchAreaMatch)) {
    throw badRequest('Query parameter researchAreaMatch must be any or all.');
  }
  const departmentId = parseQueryUuid(queryParams.departmentId, 'departmentId');
  const areaMatch = queryParams.researchAreaMatch || 'any';
  const paging = parsePage(queryParams);
  await assertKnownAreas({ query }, areaIds);
  const isAdmin = user.role === 'admin';

  if (queryParams.type === 'faculty' || queryParams.type === 'alumni') {
    paging.orderBy = resolveSort('fullName', 'asc', { fullName: 'p.full_name' }, { fullName: 'asc' });
    const result = await userRepository.listPeople({ query }, {
      role: queryParams.type === 'faculty' ? 'faculty' : 'alumni',
      q: likePattern(q),
      departmentId,
      areaIds,
      areaMatch,
    }, paging);
    return {
      data: { type: queryParams.type, items: result.rows.map(toPublicProfile) },
      meta: meta(paging.page, paging.pageSize, result.total),
    };
  }

  let result;
  if (queryParams.type === 'opportunities') {
    paging.orderBy = 'v.created_at DESC';
    result = await opportunityRepository.list({ query }, {
      q,
      areaIds,
      areaMatch,
      departmentId,
      moderationStatus: isAdmin ? undefined : 'approved',
      availabilityStatus: isAdmin ? undefined : 'open',
    }, paging);
    return {
      data: { type: queryParams.type, items: result.rows.map(toOpportunity) },
      meta: meta(paging.page, paging.pageSize, result.total),
    };
  }
  if (queryParams.type === 'research_projects') {
    paging.orderBy = 'p.created_at DESC';
    result = await projectRepository.list({ query }, {
      q,
      areaIds,
      areaMatch,
      departmentId,
      moderationStatus: isAdmin ? undefined : 'approved',
    }, paging);
    return {
      data: { type: queryParams.type, items: result.rows.map(toProject) },
      meta: meta(paging.page, paging.pageSize, result.total),
    };
  }
  paging.orderBy = 'p.created_at DESC';
  result = await publicationRepository.list({ query }, {
    q,
    areaIds,
    areaMatch,
    moderationStatus: isAdmin ? undefined : 'approved',
  }, paging);
  return {
    data: { type: queryParams.type, items: result.rows.map(toPublication) },
    meta: meta(paging.page, paging.pageSize, result.total),
  };
}

module.exports = { search };
