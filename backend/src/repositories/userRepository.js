const PROFILE_SELECT = `
SELECT
  p.id,
  p.full_name,
  p.email,
  p.role,
  p.status,
  p.created_at,
  p.updated_at,
  p.last_login_at,
  p.department_id,
  p.department_code,
  p.department_name,
  d.description AS department_description,
  p.batch,
  p.designation,
  p.mentoring_availability,
  p.current_organization,
  p.profile_photo_url,
  p.bio,
  (
    SELECT COALESCE(json_agg(json_build_object(
      'id', ra.id,
      'slug', ra.slug,
      'name', ra.name::text,
      'description', ra.description,
      'isActive', ra.is_active
    ) ORDER BY ra.name::text), '[]'::json)
    FROM research_areas ra
    WHERE ra.id IN (
      SELECT research_area_id FROM student_research_areas WHERE student_user_id = p.id AND p.role = 'student'
      UNION ALL
      SELECT research_area_id FROM faculty_research_areas WHERE faculty_user_id = p.id AND p.role = 'faculty'
      UNION ALL
      SELECT research_area_id FROM alumni_research_areas WHERE alumni_user_id = p.id AND p.role = 'alumni'
    )
  ) AS research_areas
FROM v_user_profiles p
LEFT JOIN departments d ON d.id = p.department_id
`;

async function findCredentialsByEmail(db, email) {
  const { rows } = await db.query(
    `SELECT id, full_name, email::text AS email, password_hash, role, status
     FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] || null;
}

async function findProfileById(db, id) {
  const { rows } = await db.query(`${PROFILE_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] || null;
}

async function insertUser(db, user) {
  const { rows } = await db.query(
    `INSERT INTO users (full_name, email, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, full_name, email::text AS email, role, status`,
    [user.fullName, user.email, user.passwordHash, user.role, user.status],
  );
  return rows[0];
}

async function insertStudent(db, profile) {
  await db.query(
    `INSERT INTO students (user_id, department_id, batch, profile_photo_url, bio)
     VALUES ($1, $2, $3, $4, $5)`,
    [profile.userId, profile.departmentId, profile.batch, profile.profilePhotoUrl, profile.bio],
  );
}

async function insertFaculty(db, profile) {
  await db.query(
    `INSERT INTO faculty (user_id, department_id, designation, mentoring_availability, profile_photo_url, bio)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      profile.userId,
      profile.departmentId,
      profile.designation,
      profile.mentoringAvailability,
      profile.profilePhotoUrl,
      profile.bio,
    ],
  );
}

async function insertAlumni(db, profile) {
  await db.query(
    `INSERT INTO alumni (
       user_id, department_id, batch, current_organization, mentoring_availability, profile_photo_url, bio
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      profile.userId,
      profile.departmentId,
      profile.batch,
      profile.currentOrganization,
      profile.mentoringAvailability,
      profile.profilePhotoUrl,
      profile.bio,
    ],
  );
}

const AREA_TABLE = {
  student: ['student_research_areas', 'student_user_id'],
  faculty: ['faculty_research_areas', 'faculty_user_id'],
  alumni: ['alumni_research_areas', 'alumni_user_id'],
};

async function replaceResearchAreas(db, role, userId, areaIds) {
  const spec = AREA_TABLE[role];
  if (!spec) return;
  const [table, column] = spec;
  await db.query(`DELETE FROM ${table} WHERE ${column} = $1`, [userId]);
  if (!areaIds.length) return;
  await db.query(
    `INSERT INTO ${table} (${column}, research_area_id)
     SELECT $1, unnest($2::uuid[])`,
    [userId, areaIds],
  );
}

async function profileExists(db, role, userId) {
  const table = role === 'student' ? 'students' : role === 'faculty' ? 'faculty' : role === 'alumni' ? 'alumni' : null;
  if (!table) return false;
  const { rowCount } = await db.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [userId]);
  return rowCount > 0;
}

async function updateUserAccount(db, id, fields) {
  const sets = [];
  const params = [];
  if (fields.fullName !== undefined) {
    params.push(fields.fullName);
    sets.push(`full_name = $${params.length}`);
  }
  if (fields.email !== undefined) {
    params.push(fields.email);
    sets.push(`email = $${params.length}`);
  }
  if (fields.status !== undefined) {
    params.push(fields.status);
    sets.push(`status = $${params.length}`);
  }
  if (fields.role !== undefined) {
    params.push(fields.role);
    sets.push(`role = $${params.length}`);
  }
  if (!sets.length) return;
  params.push(id);
  await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

async function updateRoleProfile(db, role, userId, fields) {
  const sets = [];
  const params = [];
  const push = (column, value) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (fields.departmentId !== undefined) push('department_id', fields.departmentId);
  if (fields.batch !== undefined) push('batch', fields.batch);
  if (fields.designation !== undefined) push('designation', fields.designation);
  if (fields.mentoringAvailability !== undefined) push('mentoring_availability', fields.mentoringAvailability);
  if (fields.currentOrganization !== undefined) push('current_organization', fields.currentOrganization);
  if (fields.profilePhotoUrl !== undefined) push('profile_photo_url', fields.profilePhotoUrl);
  if (fields.bio !== undefined) push('bio', fields.bio);
  if (!sets.length) return;
  const table = role === 'student' ? 'students' : role === 'faculty' ? 'faculty' : 'alumni';
  params.push(userId);
  await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE user_id = $${params.length}`, params);
}

async function touchLastLogin(db, userId) {
  await db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
}

async function updatePassword(db, userId, passwordHash) {
  await db.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}

async function insertRefreshToken(db, row) {
  const { rows } = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, client_ip)
     VALUES ($1, $2, now() + interval '14 days', $3, $4::inet)
     RETURNING expires_at`,
    [row.userId, row.tokenHash, row.userAgent, row.clientIp],
  );
  return rows[0];
}

async function findRefreshToken(db, tokenHash) {
  const { rows } = await db.query(
    `SELECT id, user_id, expires_at, revoked_at
     FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash],
  );
  return rows[0] || null;
}

async function revokeRefreshToken(db, tokenHash) {
  const { rowCount } = await db.query(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  return rowCount;
}

async function revokeRefreshTokenById(db, id) {
  const { rowCount } = await db.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [id],
  );
  return rowCount;
}

async function revokeAllRefreshTokens(db, userId) {
  const { rowCount } = await db.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  return rowCount;
}

function personFilters(filters) {
  const clauses = ['p.role = $1', 'p.status = \'active\''];
  const params = [filters.role];
  if (filters.q) {
    params.push(filters.q);
    clauses.push(`p.full_name ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (filters.departmentId) {
    params.push(filters.departmentId);
    clauses.push(`p.department_id = $${params.length}`);
  }
  if (filters.mentoringAvailability !== undefined) {
    params.push(filters.mentoringAvailability);
    clauses.push(`p.mentoring_availability = $${params.length}`);
  }
  if (filters.organization) {
    params.push(filters.organization);
    clauses.push(`p.current_organization ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (filters.areaIds && filters.areaIds.length) {
    params.push(filters.areaIds);
    const areaParam = `$${params.length}`;
    const table = filters.role === 'faculty' ? 'faculty_research_areas' : 'alumni_research_areas';
    const column = filters.role === 'faculty' ? 'faculty_user_id' : 'alumni_user_id';
    if (filters.areaMatch === 'all') {
      clauses.push(`(
        SELECT count(DISTINCT research_area_id) FROM ${table}
        WHERE ${column} = p.id AND research_area_id = ANY(${areaParam}::uuid[])
      ) = ${filters.areaIds.length}`);
    } else {
      clauses.push(`EXISTS (
        SELECT 1 FROM ${table}
        WHERE ${column} = p.id AND research_area_id = ANY(${areaParam}::uuid[])
      )`);
    }
  }
  return { where: clauses.join(' AND '), params };
}

async function listPeople(db, filters, paging) {
  const { where, params } = personFilters(filters);
  const count = await db.query(
    `SELECT count(*)::int AS total FROM v_user_profiles p WHERE ${where}`,
    params,
  );
  const listParams = params.slice();
  listParams.push(paging.pageSize, paging.offset);
  const { rows } = await db.query(
    `${PROFILE_SELECT}
     WHERE ${where}
     ORDER BY ${paging.orderBy}, p.id ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { total: count.rows[0].total, rows };
}

async function listUsersAdmin(db, filters, paging) {
  const clauses = ['TRUE'];
  const params = [];
  if (filters.q) {
    params.push(filters.q);
    clauses.push(`(u.full_name ILIKE $${params.length} ESCAPE '\\' OR u.email::text ILIKE $${params.length} ESCAPE '\\')`);
  }
  if (filters.role) {
    params.push(filters.role);
    clauses.push(`u.role = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`u.status = $${params.length}`);
  }
  if (filters.departmentId) {
    params.push(filters.departmentId);
    clauses.push(`p.department_id = $${params.length}`);
  }
  const where = clauses.join(' AND ');
  const from = `FROM users u LEFT JOIN v_user_profiles p ON p.id = u.id`;
  const count = await db.query(`SELECT count(*)::int AS total ${from} WHERE ${where}`, params);
  const listParams = params.slice();
  listParams.push(paging.pageSize, paging.offset);
  const { rows } = await db.query(
    `${PROFILE_SELECT.replace('FROM v_user_profiles p', 'FROM users u LEFT JOIN v_user_profiles p ON p.id = u.id')}
     WHERE ${where}
     ORDER BY ${paging.orderBy}, u.id ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { total: count.rows[0].total, rows };
}

async function academicProfileIds(db, userIds) {
  if (!userIds.length) return [];
  const { rows } = await db.query(
    `SELECT user_id FROM students WHERE user_id = ANY($1::uuid[])
     UNION
     SELECT user_id FROM faculty WHERE user_id = ANY($1::uuid[])
     UNION
     SELECT user_id FROM alumni WHERE user_id = ANY($1::uuid[])`,
    [userIds],
  );
  return rows.map((row) => row.user_id);
}

async function facultyDepartmentId(db, userId) {
  const { rows } = await db.query(
    `SELECT department_id FROM faculty WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ? rows[0].department_id : null;
}

module.exports = {
  PROFILE_SELECT,
  findCredentialsByEmail,
  findProfileById,
  insertUser,
  insertStudent,
  insertFaculty,
  insertAlumni,
  replaceResearchAreas,
  profileExists,
  updateUserAccount,
  updateRoleProfile,
  touchLastLogin,
  updatePassword,
  insertRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenById,
  revokeAllRefreshTokens,
  listPeople,
  listUsersAdmin,
  academicProfileIds,
  facultyDepartmentId,
};
