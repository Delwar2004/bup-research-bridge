const AREA_JSON = `
(
  SELECT COALESCE(json_agg(json_build_object(
    'id', ra.id,
    'slug', ra.slug,
    'name', ra.name::text,
    'description', ra.description,
    'isActive', ra.is_active
  ) ORDER BY ra.name::text), '[]'::json)
  FROM opportunity_research_areas ora
  JOIN research_areas ra ON ra.id = ora.research_area_id
  WHERE ora.opportunity_id = v.id
) AS research_areas
`;

const OPP_FROM = `
FROM v_thesis_opportunities v
JOIN thesis_opportunities src ON src.id = v.id
JOIN departments d ON d.id = v.department_id
`;

const OPP_SELECT = `
SELECT
  v.id,
  v.faculty_user_id,
  v.faculty_name,
  v.faculty_account_role,
  v.designation,
  v.mentoring_availability,
  v.department_id,
  v.department_code,
  v.department_name,
  d.description AS department_description,
  v.created_by_user_id,
  v.opportunity_type,
  v.title,
  v.description,
  v.deadline,
  v.slots,
  v.required_skills,
  v.prerequisites,
  v.availability_status,
  v.moderation_status,
  v.published_at,
  v.created_at,
  v.updated_at,
  ${AREA_JSON}
${OPP_FROM}
`;

async function insertOpportunity(db, row) {
  const { rows } = await db.query(
    `INSERT INTO thesis_opportunities (
       faculty_user_id, department_id, created_by_user_id, opportunity_type, title, description,
       deadline, slots, required_skills, prerequisites, availability_status, moderation_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      row.facultyUserId,
      row.departmentId,
      row.createdByUserId,
      row.opportunityType,
      row.title,
      row.description,
      row.deadline,
      row.slots,
      row.requiredSkills,
      row.prerequisites,
      row.availabilityStatus,
      row.moderationStatus,
    ],
  );
  return rows[0].id;
}

async function replaceAreas(db, opportunityId, areaIds) {
  await db.query(`DELETE FROM opportunity_research_areas WHERE opportunity_id = $1`, [opportunityId]);
  if (!areaIds.length) return;
  await db.query(
    `INSERT INTO opportunity_research_areas (opportunity_id, research_area_id)
     SELECT $1, unnest($2::uuid[])`,
    [opportunityId, areaIds],
  );
}

async function findById(db, id) {
  const { rows } = await db.query(`${OPP_SELECT} WHERE v.id = $1`, [id]);
  return rows[0] || null;
}

function buildFilters(filters) {
  const clauses = ['TRUE'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('$?', `$${params.length}`));
  };
  if (filters.q) add(`src.search_vector @@ websearch_to_tsquery('english', $?)`, filters.q);
  if (filters.opportunityType) add(`v.opportunity_type = $?`, filters.opportunityType);
  if (filters.departmentId) add(`v.department_id = $?`, filters.departmentId);
  if (filters.availabilityStatus) add(`v.availability_status = $?`, filters.availabilityStatus);
  if (filters.facultyUserId) add(`v.faculty_user_id = $?`, filters.facultyUserId);
  if (filters.moderationStatus) add(`v.moderation_status = $?`, filters.moderationStatus);
  if (filters.mineUserId) {
    params.push(filters.mineUserId);
    clauses.push(`(v.faculty_user_id = $${params.length} OR v.created_by_user_id = $${params.length})`);
  }
  if (filters.areaIds && filters.areaIds.length) {
    params.push(filters.areaIds);
    const ref = `$${params.length}::uuid[]`;
    if (filters.areaMatch === 'all') {
      clauses.push(`(
        SELECT count(DISTINCT research_area_id) FROM opportunity_research_areas
        WHERE opportunity_id = v.id AND research_area_id = ANY(${ref})
      ) = ${filters.areaIds.length}`);
    } else {
      clauses.push(`EXISTS (
        SELECT 1 FROM opportunity_research_areas
        WHERE opportunity_id = v.id AND research_area_id = ANY(${ref})
      )`);
    }
  }
  if (filters.visibleTo && !filters.mineUserId && filters.moderationStatus !== 'approved' && !filters.skipVisibility) {
    params.push(filters.visibleTo);
    clauses.push(`(v.moderation_status = 'approved' OR v.faculty_user_id = $${params.length} OR v.created_by_user_id = $${params.length})`);
  }
  return { where: clauses.join(' AND '), params };
}

async function list(db, filters, paging) {
  const { where, params } = buildFilters(filters);
  const count = await db.query(`SELECT count(*)::int AS total ${OPP_FROM} WHERE ${where}`, params);
  const listParams = params.slice();
  listParams.push(paging.pageSize, paging.offset);
  const { rows } = await db.query(
    `${OPP_SELECT} WHERE ${where}
     ORDER BY ${paging.orderBy}, v.id ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { total: count.rows[0].total, rows };
}

async function updateOpportunity(db, id, fields) {
  const sets = [];
  const params = [];
  const push = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (fields.departmentId !== undefined) push('department_id', fields.departmentId);
  if (fields.opportunityType !== undefined) push('opportunity_type', fields.opportunityType);
  if (fields.title !== undefined) push('title', fields.title);
  if (fields.description !== undefined) push('description', fields.description);
  if (fields.deadline !== undefined) push('deadline', fields.deadline);
  if (fields.slots !== undefined) push('slots', fields.slots);
  if (fields.requiredSkills !== undefined) push('required_skills', fields.requiredSkills);
  if (fields.prerequisites !== undefined) push('prerequisites', fields.prerequisites);
  if (fields.availabilityStatus !== undefined) push('availability_status', fields.availabilityStatus);
  if (fields.moderationStatus !== undefined) push('moderation_status', fields.moderationStatus);
  if (fields.facultyUserId !== undefined) push('faculty_user_id', fields.facultyUserId);
  if (!sets.length) return;
  params.push(id);
  await db.query(`UPDATE thesis_opportunities SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

async function deleteOpportunity(db, id) {
  const { rowCount } = await db.query(`DELETE FROM thesis_opportunities WHERE id = $1`, [id]);
  return rowCount;
}

async function hasMentorship(db, id) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM mentorship_requests WHERE opportunity_id = $1 LIMIT 1`,
    [id],
  );
  return rowCount > 0;
}

module.exports = {
  insertOpportunity,
  replaceAreas,
  findById,
  list,
  updateOpportunity,
  deleteOpportunity,
  hasMentorship,
};
