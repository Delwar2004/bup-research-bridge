const { query } = require('../db/pool');

async function listDepartments() {
  const { rows } = await query(
    `SELECT id, code, name, description
     FROM departments
     ORDER BY code ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
  }));
}

async function departmentExists(db, id) {
  const { rowCount } = await db.query(`SELECT 1 FROM departments WHERE id = $1`, [id]);
  return rowCount > 0;
}

async function listResearchAreas({ includeInactive }) {
  const { rows } = await query(
    `SELECT id, slug, name::text AS name, description, is_active
     FROM research_areas
     WHERE ($1::boolean = true) OR is_active
     ORDER BY name::text ASC`,
    [includeInactive === true],
  );
  return rows;
}

async function activeAreaIds(db, ids) {
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT id FROM research_areas WHERE id = ANY($1::uuid[]) AND is_active`,
    [ids],
  );
  return rows.map((row) => row.id);
}

async function existingAreaIds(db, ids) {
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT id FROM research_areas WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  return rows.map((row) => row.id);
}

async function insertResearchArea(db, area) {
  const { rows } = await db.query(
    `INSERT INTO research_areas (slug, name, description, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id, slug, name::text AS name, description, is_active`,
    [area.slug, area.name, area.description, area.isActive],
  );
  return rows[0];
}

async function updateResearchArea(db, id, fields) {
  const sets = [];
  const params = [];
  if (fields.name !== undefined) {
    params.push(fields.name);
    sets.push(`name = $${params.length}`);
  }
  if (fields.description !== undefined) {
    params.push(fields.description);
    sets.push(`description = $${params.length}`);
  }
  if (fields.isActive !== undefined) {
    params.push(fields.isActive);
    sets.push(`is_active = $${params.length}`);
  }
  params.push(id);
  const { rows } = await db.query(
    `UPDATE research_areas SET ${sets.join(', ')}
     WHERE id = $${params.length}
     RETURNING id, slug, name::text AS name, description, is_active`,
    params,
  );
  return rows[0] || null;
}

module.exports = {
  listDepartments,
  departmentExists,
  listResearchAreas,
  activeAreaIds,
  existingAreaIds,
  insertResearchArea,
  updateResearchArea,
};
