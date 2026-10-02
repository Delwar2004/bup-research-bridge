const PROJECT_FROM = `
FROM research_projects p
JOIN departments d ON d.id = p.department_id
`;

const PROJECT_SELECT = `
SELECT
  p.id,
  p.department_id,
  d.code AS department_code,
  d.name AS department_name,
  d.description AS department_description,
  p.opportunity_id,
  p.created_by_user_id,
  p.title,
  p.description,
  p.project_type,
  p.project_year,
  p.external_link,
  p.moderation_status,
  p.published_at,
  p.created_at,
  p.updated_at,
  (
    SELECT COALESCE(json_agg(json_build_object(
      'id', ra.id, 'slug', ra.slug, 'name', ra.name::text,
      'description', ra.description, 'isActive', ra.is_active
    ) ORDER BY ra.name::text), '[]'::json)
    FROM project_research_areas pra
    JOIN research_areas ra ON ra.id = pra.research_area_id
    WHERE pra.project_id = p.id
  ) AS research_areas,
  (
    SELECT COALESCE(json_agg(json_build_object(
      'userId', pm.user_id, 'fullName', u.full_name, 'memberRole', pm.member_role
    ) ORDER BY u.full_name), '[]'::json)
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = p.id
  ) AS members
${PROJECT_FROM}
`;

async function insertProject(db, row) {
  const { rows } = await db.query(
    `INSERT INTO research_projects (
       department_id, opportunity_id, created_by_user_id, title, description,
       project_type, project_year, external_link, moderation_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      row.departmentId,
      row.opportunityId,
      row.createdByUserId,
      row.title,
      row.description,
      row.projectType,
      row.projectYear,
      row.externalLink,
      row.moderationStatus,
    ],
  );
  return rows[0].id;
}

async function replaceAreas(db, projectId, areaIds) {
  await db.query(`DELETE FROM project_research_areas WHERE project_id = $1`, [projectId]);
  if (!areaIds.length) return;
  await db.query(
    `INSERT INTO project_research_areas (project_id, research_area_id)
     SELECT $1, unnest($2::uuid[])`,
    [projectId, areaIds],
  );
}

async function replaceMembers(db, projectId, members) {
  await db.query(`DELETE FROM project_members WHERE project_id = $1`, [projectId]);
  for (const member of members) {
    await db.query(
      `INSERT INTO project_members (project_id, user_id, member_role) VALUES ($1, $2, $3)`,
      [projectId, member.userId, member.memberRole],
    );
  }
}

async function findById(db, id) {
  const { rows } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

function buildFilters(filters) {
  const clauses = ['TRUE'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('$?', `$${params.length}`));
  };
  if (filters.q) add(`p.search_vector @@ websearch_to_tsquery('english', $?)`, filters.q);
  if (filters.projectType) add(`p.project_type = $?`, filters.projectType);
  if (filters.departmentId) add(`p.department_id = $?`, filters.departmentId);
  if (filters.projectYear != null) add(`p.project_year = $?`, filters.projectYear);
  if (filters.yearFrom != null) add(`p.project_year >= $?`, filters.yearFrom);
  if (filters.yearTo != null) add(`p.project_year <= $?`, filters.yearTo);
  if (filters.memberUserId) {
    add(`EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $?)`, filters.memberUserId);
  }
  if (filters.mineUserId) add(`p.created_by_user_id = $?`, filters.mineUserId);
  if (filters.moderationStatus) add(`p.moderation_status = $?`, filters.moderationStatus);
  if (filters.areaIds && filters.areaIds.length) {
    params.push(filters.areaIds);
    const ref = `$${params.length}::uuid[]`;
    if (filters.areaMatch === 'all') {
      clauses.push(`(
        SELECT count(DISTINCT research_area_id) FROM project_research_areas
        WHERE project_id = p.id AND research_area_id = ANY(${ref})
      ) = ${filters.areaIds.length}`);
    } else {
      clauses.push(`EXISTS (
        SELECT 1 FROM project_research_areas
        WHERE project_id = p.id AND research_area_id = ANY(${ref})
      )`);
    }
  }
  return { where: clauses.join(' AND '), params };
}

async function list(db, filters, paging) {
  const { where, params } = buildFilters(filters);
  const count = await db.query(`SELECT count(*)::int AS total ${PROJECT_FROM} WHERE ${where}`, params);
  const listParams = params.slice();
  listParams.push(paging.pageSize, paging.offset);
  const { rows } = await db.query(
    `${PROJECT_SELECT} WHERE ${where}
     ORDER BY ${paging.orderBy}, p.id ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { total: count.rows[0].total, rows };
}

async function updateProject(db, id, fields) {
  const sets = [];
  const params = [];
  const push = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (fields.departmentId !== undefined) push('department_id', fields.departmentId);
  if (fields.opportunityId !== undefined) push('opportunity_id', fields.opportunityId);
  if (fields.title !== undefined) push('title', fields.title);
  if (fields.description !== undefined) push('description', fields.description);
  if (fields.projectType !== undefined) push('project_type', fields.projectType);
  if (fields.projectYear !== undefined) push('project_year', fields.projectYear);
  if (fields.externalLink !== undefined) push('external_link', fields.externalLink);
  if (fields.moderationStatus !== undefined) push('moderation_status', fields.moderationStatus);
  if (!sets.length) return;
  params.push(id);
  await db.query(`UPDATE research_projects SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

async function deleteProject(db, id) {
  const { rowCount } = await db.query(`DELETE FROM research_projects WHERE id = $1`, [id]);
  return rowCount;
}

module.exports = {
  insertProject,
  replaceAreas,
  replaceMembers,
  findById,
  list,
  updateProject,
  deleteProject,
};
