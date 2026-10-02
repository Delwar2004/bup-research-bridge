async function insertActivity(db, entry) {
  await db.query(
    `INSERT INTO activity_logs (actor_user_id, action, entity_type, entity_id, summary, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      entry.actorUserId || null,
      entry.action,
      entry.entityType,
      entry.entityId || null,
      entry.summary || null,
      JSON.stringify(entry.metadata || {}),
    ],
  );
}

async function insertNotification(db, entry) {
  await db.query(
    `INSERT INTO notifications (
       recipient_user_id, notification_type, message, opportunity_id, mentorship_request_id, payload
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      entry.recipientUserId,
      entry.type,
      entry.message,
      entry.opportunityId || null,
      entry.mentorshipRequestId || null,
      JSON.stringify(entry.payload || {}),
    ],
  );
}

module.exports = { insertActivity, insertNotification };
