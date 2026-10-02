const REQUEST_SELECT = `
SELECT
  r.id,
  r.student_user_id,
  su.full_name AS student_name,
  r.mentor_user_id,
  mu.full_name AS mentor_name,
  mu.role AS mentor_role,
  r.opportunity_id,
  CASE
    WHEN o.id IS NULL THEN NULL
    WHEN o.moderation_status = 'approved' OR o.faculty_user_id = $viewer OR o.created_by_user_id = $viewer OR $isAdmin THEN o.title
    ELSE NULL
  END AS opportunity_title,
  r.subject,
  r.status,
  r.responded_at,
  r.created_at,
  r.updated_at
FROM mentorship_requests r
JOIN users su ON su.id = r.student_user_id
JOIN users mu ON mu.id = r.mentor_user_id
LEFT JOIN thesis_opportunities o ON o.id = r.opportunity_id
`;

function viewerSql(viewerId, isAdmin) {
  return REQUEST_SELECT
    .replaceAll('$viewer', `'${viewerId}'::uuid`)
    .replaceAll('$isAdmin', isAdmin ? 'TRUE' : 'FALSE');
}

async function insertRequest(db, row) {
  const { rows } = await db.query(
    `INSERT INTO mentorship_requests (student_user_id, mentor_user_id, opportunity_id, subject)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [row.studentUserId, row.mentorUserId, row.opportunityId, row.subject],
  );
  return rows[0].id;
}

async function insertMessage(db, row) {
  const { rows } = await db.query(
    `INSERT INTO mentorship_messages (request_id, sender_user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, request_id, sender_user_id, body, created_at`,
    [row.requestId, row.senderUserId, row.body],
  );
  return rows[0];
}

async function findRaw(db, id) {
  const { rows } = await db.query(
    `SELECT id, student_user_id, mentor_user_id, opportunity_id, subject, status, responded_at, created_at, updated_at
     FROM mentorship_requests WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

async function findForViewer(db, id, viewer) {
  const sql = `${viewerSql(viewer.id, viewer.role === 'admin')} WHERE r.id = $1`;
  const { rows } = await db.query(sql, [id]);
  return rows[0] || null;
}

async function listForViewer(db, viewer, filters, paging) {
  const clauses = ['(r.student_user_id = $1 OR r.mentor_user_id = $1)'];
  const params = [viewer.id];
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`r.status = $${params.length}`);
  }
  if (filters.role === 'student') clauses.push(`r.student_user_id = $1`);
  if (filters.role === 'mentor') clauses.push(`r.mentor_user_id = $1`);
  if (filters.opportunityId) {
    params.push(filters.opportunityId);
    clauses.push(`r.opportunity_id = $${params.length}`);
  }
  const where = clauses.join(' AND ');
  const base = viewerSql(viewer.id, false);
  const count = await db.query(
    `SELECT count(*)::int AS total FROM mentorship_requests r WHERE ${where}`,
    params,
  );
  const listParams = params.slice();
  listParams.push(paging.pageSize, paging.offset);
  const { rows } = await db.query(
    `${base} WHERE ${where}
     ORDER BY ${paging.orderBy}, r.id ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { total: count.rows[0].total, rows };
}

async function updateStatus(db, id, status) {
  await db.query(`UPDATE mentorship_requests SET status = $2 WHERE id = $1`, [id, status]);
}

async function listMessages(db, requestId, paging) {
  const count = await db.query(
    `SELECT count(*)::int AS total FROM mentorship_messages WHERE request_id = $1`,
    [requestId],
  );
  const { rows } = await db.query(
    `SELECT m.id, m.request_id, m.sender_user_id, u.full_name AS sender_name, m.body, m.created_at
     FROM mentorship_messages m
     JOIN users u ON u.id = m.sender_user_id
     WHERE m.request_id = $1
     ORDER BY m.created_at ASC, m.id ASC
     LIMIT $2 OFFSET $3`,
    [requestId, paging.pageSize, paging.offset],
  );
  return { total: count.rows[0].total, rows };
}

async function findMentor(db, userId) {
  const { rows } = await db.query(
    `SELECT id, full_name, role, status FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] || null;
}

async function findOpenApprovedOpportunity(db, id) {
  const { rows } = await db.query(
    `SELECT id, title, moderation_status, availability_status
     FROM thesis_opportunities WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

module.exports = {
  insertRequest,
  insertMessage,
  findRaw,
  findForViewer,
  listForViewer,
  updateStatus,
  listMessages,
  findMentor,
  findOpenApprovedOpportunity,
};
