async function listByAlumni(db, alumniUserId) {
  const { rows } = await db.query(
    `SELECT id, organization, position_title, description, start_date, end_date, is_current, created_at, updated_at
     FROM alumni_experiences
     WHERE alumni_user_id = $1
     ORDER BY is_current DESC, start_date DESC NULLS LAST, created_at DESC`,
    [alumniUserId],
  );
  return rows;
}

async function findById(db, id) {
  const { rows } = await db.query(
    `SELECT id, alumni_user_id, organization, position_title, description, start_date, end_date, is_current, created_at, updated_at
     FROM alumni_experiences WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

async function insertExperience(db, row) {
  const { rows } = await db.query(
    `INSERT INTO alumni_experiences (
       alumni_user_id, organization, position_title, description, start_date, end_date, is_current
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, organization, position_title, description, start_date, end_date, is_current, created_at, updated_at`,
    [row.alumniUserId, row.organization, row.positionTitle, row.description, row.startDate, row.endDate, row.isCurrent],
  );
  return rows[0];
}

async function updateExperience(db, id, fields) {
  const sets = [];
  const params = [];
  const push = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (fields.organization !== undefined) push('organization', fields.organization);
  if (fields.positionTitle !== undefined) push('position_title', fields.positionTitle);
  if (fields.description !== undefined) push('description', fields.description);
  if (fields.startDate !== undefined) push('start_date', fields.startDate);
  if (fields.endDate !== undefined) push('end_date', fields.endDate);
  if (fields.isCurrent !== undefined) push('is_current', fields.isCurrent);
  params.push(id);
  const { rows } = await db.query(
    `UPDATE alumni_experiences SET ${sets.join(', ')}
     WHERE id = $${params.length}
     RETURNING id, organization, position_title, description, start_date, end_date, is_current, created_at, updated_at`,
    params,
  );
  return rows[0] || null;
}

async function deleteExperience(db, id, alumniUserId) {
  const { rowCount } = await db.query(
    `DELETE FROM alumni_experiences WHERE id = $1 AND alumni_user_id = $2`,
    [id, alumniUserId],
  );
  return rowCount;
}

module.exports = {
  listByAlumni,
  findById,
  insertExperience,
  updateExperience,
  deleteExperience,
};
