-- Migration 007. Notifications and the administrative activity log.
-- Figure 1 attached NOTIFICATION only to USER and left it with no subject.
-- A notification can name the opportunity or mentorship request that caused it.
-- activity_logs.entity_id is intentionally not a foreign key: the log records
-- every table, and a foreign key can point at only one.

BEGIN;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  notification_type notification_type NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  opportunity_id uuid,
  mentorship_request_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_recipient_fk
    FOREIGN KEY (recipient_user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT notifications_opportunity_fk
    FOREIGN KEY (opportunity_id) REFERENCES thesis_opportunities (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT notifications_request_fk
    FOREIGN KEY (mentorship_request_id) REFERENCES mentorship_requests (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT notifications_message_present CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  CONSTRAINT notifications_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT notifications_read_at_consistent CHECK (
    (is_read AND read_at IS NOT NULL) OR (NOT is_read AND read_at IS NULL)
  )
);

CREATE OR REPLACE FUNCTION fn_notification_read_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_read AND NEW.read_at IS NULL THEN
    NEW.read_at = now();
  ELSIF NOT NEW.is_read THEN
    NEW.read_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notifications_read_stamp
BEFORE INSERT OR UPDATE OF is_read ON notifications
FOR EACH ROW
EXECUTE FUNCTION fn_notification_read_stamp();

CREATE TRIGGER trg_notifications_set_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_notifications_recipient_created
  ON notifications (recipient_user_id, created_at DESC);

CREATE INDEX idx_notifications_unread
  ON notifications (recipient_user_id, created_at DESC)
  WHERE NOT is_read;

CREATE INDEX idx_notifications_opportunity
  ON notifications (opportunity_id)
  WHERE opportunity_id IS NOT NULL;

CREATE INDEX idx_notifications_request
  ON notifications (mentorship_request_id)
  WHERE mentorship_request_id IS NOT NULL;

CREATE TABLE activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_logs_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT activity_logs_action_present CHECK (char_length(btrim(action)) BETWEEN 1 AND 64),
  CONSTRAINT activity_logs_entity_type_present CHECK (
    char_length(btrim(entity_type)) BETWEEN 1 AND 64
  ),
  CONSTRAINT activity_logs_summary_length CHECK (
    summary IS NULL OR char_length(summary) <= 500
  ),
  CONSTRAINT activity_logs_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE activity_logs IS
  'Administrative audit trail for FR-28 and FR-31. entity_type and entity_id are not a foreign key, so new tables can be logged without a schema change. actor_user_id is a real foreign key and becomes null if that account is removed.';

CREATE INDEX idx_activity_logs_created ON activity_logs (created_at DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs (entity_type, entity_id);
CREATE INDEX idx_activity_logs_actor ON activity_logs (actor_user_id, created_at DESC);

COMMIT;
