async function listForUser(db, userId, filters, paging) {
  const clauses = ['recipient_user_id = $1'];
  const params = [userId];
  if (filters.isRead !== undefined) {
    params.push(filters.isRead);
    clauses.push(`is_read = $${params.length}`);
  }
  if (filters.notificationType) {
    params.push(filters.notificationType);
    clauses.push(`notification_type = $${params.length}`);
  }
  const where = clauses.join(' AND ');
  const count = await db.query(
    `SELECT count(*)::int AS total FROM notifications WHERE ${where}`,
    params,
  );
  const listParams = params.slice();
  listParams.push(paging.pageSize, paging.offset);
  const { rows } = await db.query(
    `SELECT id, notification_type, message, is_read, read_at, opportunity_id, mentorship_request_id, payload, created_at
     FROM notifications
     WHERE ${where}
     ORDER BY created_at DESC, id ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { total: count.rows[0].total, rows };
}

async function unreadCount(db, userId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total FROM notifications WHERE recipient_user_id = $1 AND NOT is_read`,
    [userId],
  );
  return rows[0].total;
}

async function updateRead(db, id, userId, isRead) {
  const { rows } = await db.query(
    `UPDATE notifications SET is_read = $3
     WHERE id = $1 AND recipient_user_id = $2
     RETURNING id, notification_type, message, is_read, read_at, opportunity_id, mentorship_request_id, payload, created_at`,
    [id, userId, isRead],
  );
  return rows[0] || null;
}

async function markAllRead(db, userId) {
  const { rowCount } = await db.query(
    `UPDATE notifications SET is_read = true
     WHERE recipient_user_id = $1 AND NOT is_read`,
    [userId],
  );
  return rowCount;
}

async function notifyActiveStudentsOfOpportunity(db, opportunityId, message, title) {
  await db.query(
    `INSERT INTO notifications (recipient_user_id, notification_type, message, opportunity_id, payload)
     SELECT id, 'opportunity_published', $2, $1::uuid, jsonb_build_object('opportunityId', $3::text, 'title', $4::text)
     FROM users
     WHERE role = 'student' AND status = 'active'`,
    [opportunityId, message, opportunityId, title],
  );
}

module.exports = {
  listForUser,
  unreadCount,
  updateRead,
  markAllRead,
  notifyActiveStudentsOfOpportunity,
};
