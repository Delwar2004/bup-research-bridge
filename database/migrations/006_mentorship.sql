-- Migration 006. Mentorship requests and the conversation under each request.
-- Figure 1 pointed MENTORSHIP_REQUEST at a combined FACULTY / ALUMNI box,
-- stored no student, and kept a single Message. Each request now has one
-- student and one mentor. The mentor is a user whose current role is faculty
-- or alumni. Later messages live in mentorship_messages.

BEGIN;

CREATE TABLE mentorship_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL,
  mentor_user_id uuid NOT NULL,
  opportunity_id uuid,
  subject text NOT NULL,
  status mentorship_status NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentorship_requests_student_fk
    FOREIGN KEY (student_user_id) REFERENCES students (user_id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT mentorship_requests_mentor_fk
    FOREIGN KEY (mentor_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT mentorship_requests_opportunity_fk
    FOREIGN KEY (opportunity_id) REFERENCES thesis_opportunities (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT mentorship_requests_distinct_parties CHECK (student_user_id <> mentor_user_id),
  CONSTRAINT mentorship_requests_subject_present CHECK (char_length(btrim(subject)) BETWEEN 1 AND 200)
);

COMMENT ON TABLE mentorship_requests IS
  'One student sender and one mentor. student_user_id references the student profile so that profile is kept after the account becomes an alumnus. New requests still require the current role to be student.';

COMMENT ON COLUMN mentorship_requests.mentor_user_id IS
  'Faculty member or alumnus. Checked against users.role when the request is created, not with a second nullable foreign key.';

CREATE OR REPLACE FUNCTION fn_mentorship_request_actors()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM fn_assert_active_roles(
      NEW.student_user_id,
      ARRAY['student'::user_role],
      'mentorship student'
    );
    PERFORM fn_assert_active_roles(
      NEW.mentor_user_id,
      ARRAY['faculty'::user_role, 'alumni'::user_role],
      'mentorship mentor'
    );
    RETURN NEW;
  END IF;

  IF NEW.student_user_id IS DISTINCT FROM OLD.student_user_id THEN
    PERFORM fn_assert_active_roles(
      NEW.student_user_id,
      ARRAY['student'::user_role],
      'mentorship student'
    );
  END IF;

  IF NEW.mentor_user_id IS DISTINCT FROM OLD.mentor_user_id THEN
    PERFORM fn_assert_active_roles(
      NEW.mentor_user_id,
      ARRAY['faculty'::user_role, 'alumni'::user_role],
      'mentorship mentor'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_mentorship_stamp_response()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'pending'
     AND NEW.status <> 'pending'
     AND NEW.responded_at IS NULL THEN
    NEW.responded_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mentorship_requests_actors
BEFORE INSERT OR UPDATE OF student_user_id, mentor_user_id ON mentorship_requests
FOR EACH ROW
EXECUTE FUNCTION fn_mentorship_request_actors();

CREATE TRIGGER trg_mentorship_requests_response
BEFORE UPDATE OF status ON mentorship_requests
FOR EACH ROW
EXECUTE FUNCTION fn_mentorship_stamp_response();

CREATE TRIGGER trg_mentorship_requests_set_updated_at
BEFORE UPDATE ON mentorship_requests
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE UNIQUE INDEX mentorship_requests_one_pending_opportunity_idx
  ON mentorship_requests (student_user_id, mentor_user_id, opportunity_id)
  WHERE status = 'pending' AND opportunity_id IS NOT NULL;

CREATE UNIQUE INDEX mentorship_requests_one_pending_general_idx
  ON mentorship_requests (student_user_id, mentor_user_id)
  WHERE status = 'pending' AND opportunity_id IS NULL;

CREATE INDEX idx_mentorship_requests_mentor_status
  ON mentorship_requests (mentor_user_id, status, created_at DESC);

CREATE INDEX idx_mentorship_requests_student_status
  ON mentorship_requests (student_user_id, status, created_at DESC);

CREATE INDEX idx_mentorship_requests_opportunity
  ON mentorship_requests (opportunity_id)
  WHERE opportunity_id IS NOT NULL;

CREATE TABLE mentorship_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  sender_user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentorship_messages_request_fk
    FOREIGN KEY (request_id) REFERENCES mentorship_requests (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT mentorship_messages_sender_fk
    FOREIGN KEY (sender_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT mentorship_messages_body_present CHECK (
    char_length(btrim(body)) BETWEEN 1 AND 10000
  )
);

COMMENT ON TABLE mentorship_messages IS
  'Conversation for one mentorship request. The sender is either that request''s student or its mentor.';

CREATE OR REPLACE FUNCTION fn_mentorship_message_sender()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  student_id uuid;
  mentor_id uuid;
BEGIN
  SELECT student_user_id, mentor_user_id
  INTO student_id, mentor_id
  FROM mentorship_requests
  WHERE id = NEW.request_id;

  IF student_id IS NULL THEN
    RAISE EXCEPTION 'mentorship request % does not exist', NEW.request_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.sender_user_id <> student_id AND NEW.sender_user_id <> mentor_id THEN
    RAISE EXCEPTION 'only the student or the mentor can post in mentorship request %', NEW.request_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mentorship_messages_sender
BEFORE INSERT ON mentorship_messages
FOR EACH ROW
EXECUTE FUNCTION fn_mentorship_message_sender();

CREATE INDEX idx_mentorship_messages_request_created
  ON mentorship_messages (request_id, created_at);

CREATE INDEX idx_mentorship_messages_sender
  ON mentorship_messages (sender_user_id);

COMMIT;
