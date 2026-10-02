const MODERATION = ['draft', 'pending', 'approved', 'rejected', 'archived'];
const AVAILABILITY = ['open', 'closed', 'filled'];
const ROLES = ['student', 'faculty', 'alumni', 'admin'];
const STATUSES = ['pending', 'active', 'suspended', 'rejected'];
const MENTORSHIP = ['pending', 'accepted', 'rejected', 'cancelled', 'completed'];
const NOTES = [
  'opportunity_published',
  'mentorship_requested',
  'mentorship_updated',
  'message_received',
  'content_moderated',
  'account_updated',
];

function fill(keys, rows, column) {
  const out = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of rows) out[row[column]] = row.total;
  return out;
}

function range(filters) {
  const clauses = ['TRUE'];
  const params = [];
  if (filters.from) {
    params.push(filters.from);
    clauses.push(`created_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    clauses.push(`created_at < $${params.length}`);
  }
  return { where: clauses.join(' AND '), params };
}

async function grouped(db, table, column, keys, filters) {
  const { where, params } = range(filters);
  const { rows } = await db.query(
    `SELECT ${column}::text AS key, count(*)::int AS total
     FROM ${table}
     WHERE ${where}
     GROUP BY ${column}`,
    params,
  );
  return fill(keys, rows.map((row) => ({ [column]: row.key, total: row.total })), column);
}

async function summary(db, filters) {
  const { where, params } = range(filters);
  const activity = await db.query(
    `SELECT count(*)::int AS total FROM activity_logs WHERE ${where}`,
    params,
  );
  return {
    usersByRole: await grouped(db, 'users', 'role', ROLES, filters),
    usersByStatus: await grouped(db, 'users', 'status', STATUSES, filters),
    opportunitiesByModeration: await grouped(db, 'thesis_opportunities', 'moderation_status', MODERATION, filters),
    opportunitiesByAvailability: await grouped(db, 'thesis_opportunities', 'availability_status', AVAILABILITY, filters),
    projectsByModeration: await grouped(db, 'research_projects', 'moderation_status', MODERATION, filters),
    publicationsByModeration: await grouped(db, 'publications', 'moderation_status', MODERATION, filters),
    mentorshipByStatus: await grouped(db, 'mentorship_requests', 'status', MENTORSHIP, filters),
    notificationsByType: await grouped(db, 'notifications', 'notification_type', NOTES, filters),
    activityLogCount: activity.rows[0].total,
  };
}

async function listActivity(db, filters, paging) {
  const clauses = ['TRUE'];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('$?', `$${params.length}`));
  };
  if (filters.actorUserId) add('l.actor_user_id = $?', filters.actorUserId);
  if (filters.action) add('l.action = $?', filters.action);
  if (filters.entityType) add('l.entity_type = $?', filters.entityType);
  if (filters.entityId) add('l.entity_id = $?', filters.entityId);
  if (filters.from) add('l.created_at >= $?', filters.from);
  if (filters.to) add('l.created_at < $?', filters.to);
  const where = clauses.join(' AND ');
  const count = await db.query(`SELECT count(*)::int AS total FROM activity_logs l WHERE ${where}`, params);
  const listParams = params.slice();
  listParams.push(paging.pageSize, paging.offset);
  const { rows } = await db.query(
    `SELECT l.id, l.actor_user_id, u.full_name AS actor_name, l.action, l.entity_type, l.entity_id,
            l.summary, l.metadata, l.created_at
     FROM activity_logs l
     LEFT JOIN users u ON u.id = l.actor_user_id
     WHERE ${where}
     ORDER BY l.created_at DESC, l.id ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  return { total: count.rows[0].total, rows };
}

module.exports = { summary, listActivity };
