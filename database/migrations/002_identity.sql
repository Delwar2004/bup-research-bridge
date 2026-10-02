-- Migration 002. Accounts and role profiles.
-- Figure 1 drew USER with no link to STUDENT, FACULTY, or ALUMNI, and drew
-- "has profile" as a 1:1 between those role entities. Name and email lived
-- on every role table. Here the account is users. Each role has its own
-- profile table whose primary key is users.id.

BEGIN;

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_code_unique UNIQUE (code),
  CONSTRAINT departments_name_unique UNIQUE (name),
  CONSTRAINT departments_code_format CHECK (code ~ '^[A-Z][A-Z0-9]{1,9}$'),
  CONSTRAINT departments_name_present CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT departments_description_length CHECK (
    description IS NULL OR char_length(description) <= 4000
  )
);

CREATE TRIGGER trg_departments_set_updated_at
BEFORE UPDATE ON departments
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email citext NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  status account_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_full_name_present CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 200),
  CONSTRAINT users_email_format CHECK (email::text ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT users_password_hash_length CHECK (char_length(password_hash) BETWEEN 20 AND 512),
  CONSTRAINT users_last_login_not_before_create CHECK (
    last_login_at IS NULL OR last_login_at >= created_at
  )
);

COMMENT ON TABLE users IS
  'Login account for every person, including administrators. Role profiles live in students, faculty, and alumni.';

COMMENT ON COLUMN users.password_hash IS
  'One-way password hash produced by argon2id or bcrypt. NFR-04 is satisfied by hashing, not reversible encryption.';

COMMENT ON COLUMN users.role IS
  'Current authorization role. An earlier profile row can remain after this value changes, which is how a student becomes an alumnus without losing history.';

CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_users_role_status ON users (role, status);

CREATE INDEX idx_users_full_name_trgm ON users USING gin (full_name gin_trgm_ops);

CREATE INDEX idx_users_email_trgm ON users USING gin ((email::text) gin_trgm_ops);

CREATE OR REPLACE FUNCTION fn_assert_active_roles(
  p_user_id uuid,
  p_roles user_role[],
  p_context text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actual_role user_role;
  actual_status account_status;
BEGIN
  SELECT role, status
  INTO actual_role, actual_status
  FROM users
  WHERE id = p_user_id;

  IF actual_role IS NULL THEN
    RAISE EXCEPTION '%: user % does not exist', p_context, p_user_id
      USING ERRCODE = '23503';
  END IF;

  IF actual_status <> 'active' THEN
    RAISE EXCEPTION '%: user % is not active', p_context, p_user_id
      USING ERRCODE = '23514';
  END IF;

  IF NOT actual_role = ANY (p_roles) THEN
    RAISE EXCEPTION '%: user % has role %, expected one of %',
      p_context, p_user_id, actual_role, p_roles
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TABLE students (
  user_id uuid PRIMARY KEY,
  department_id uuid NOT NULL,
  batch text NOT NULL,
  profile_photo_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT students_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT students_department_fk
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT students_batch_present CHECK (char_length(btrim(batch)) BETWEEN 1 AND 32),
  CONSTRAINT students_photo_length CHECK (
    profile_photo_url IS NULL OR char_length(profile_photo_url) BETWEEN 1 AND 2000
  ),
  CONSTRAINT students_bio_length CHECK (bio IS NULL OR char_length(bio) <= 5000)
);

CREATE TABLE faculty (
  user_id uuid PRIMARY KEY,
  department_id uuid NOT NULL,
  designation text NOT NULL,
  mentoring_availability boolean NOT NULL DEFAULT false,
  profile_photo_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faculty_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT faculty_department_fk
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT faculty_designation_present CHECK (char_length(btrim(designation)) BETWEEN 1 AND 200),
  CONSTRAINT faculty_photo_length CHECK (
    profile_photo_url IS NULL OR char_length(profile_photo_url) BETWEEN 1 AND 2000
  ),
  CONSTRAINT faculty_bio_length CHECK (bio IS NULL OR char_length(bio) <= 5000)
);

CREATE TABLE alumni (
  user_id uuid PRIMARY KEY,
  department_id uuid NOT NULL,
  batch text NOT NULL,
  current_organization text,
  mentoring_availability boolean NOT NULL DEFAULT false,
  profile_photo_url text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alumni_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT alumni_department_fk
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT alumni_batch_present CHECK (char_length(btrim(batch)) BETWEEN 1 AND 32),
  CONSTRAINT alumni_organization_length CHECK (
    current_organization IS NULL OR char_length(btrim(current_organization)) BETWEEN 1 AND 200
  ),
  CONSTRAINT alumni_photo_length CHECK (
    profile_photo_url IS NULL OR char_length(profile_photo_url) BETWEEN 1 AND 2000
  ),
  CONSTRAINT alumni_bio_length CHECK (bio IS NULL OR char_length(bio) <= 5000)
);

CREATE INDEX idx_students_department ON students (department_id);
CREATE INDEX idx_faculty_department ON faculty (department_id);
CREATE INDEX idx_alumni_department ON alumni (department_id);
CREATE INDEX idx_faculty_mentoring ON faculty (mentoring_availability) WHERE mentoring_availability;
CREATE INDEX idx_alumni_mentoring ON alumni (mentoring_availability) WHERE mentoring_availability;

CREATE TRIGGER trg_students_set_updated_at
BEFORE UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_faculty_set_updated_at
BEFORE UPDATE ON faculty
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_alumni_set_updated_at
BEFORE UPDATE ON alumni
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE OR REPLACE FUNCTION fn_profile_role_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actual user_role;
  expected user_role;
BEGIN
  expected := CASE TG_TABLE_NAME
    WHEN 'students' THEN 'student'::user_role
    WHEN 'faculty' THEN 'faculty'::user_role
    WHEN 'alumni' THEN 'alumni'::user_role
    ELSE NULL
  END;

  SELECT role INTO actual FROM users WHERE id = NEW.user_id;

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION '% profile can be created only while the account role is %',
      TG_TABLE_NAME, expected
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_students_role_guard
BEFORE INSERT ON students
FOR EACH ROW
EXECUTE FUNCTION fn_profile_role_guard();

CREATE TRIGGER trg_faculty_role_guard
BEFORE INSERT ON faculty
FOR EACH ROW
EXECUTE FUNCTION fn_profile_role_guard();

CREATE TRIGGER trg_alumni_role_guard
BEFORE INSERT ON alumni
FOR EACH ROW
EXECUTE FUNCTION fn_profile_role_guard();

CREATE OR REPLACE FUNCTION fn_users_require_active_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  account_role user_role;
BEGIN
  -- Read the account as it is now. A deferred insert trigger otherwise keeps
  -- the role from the original insert and rejects a student who graduates in
  -- the same transaction. The variable must not be named current_role:
  -- that name is the session role, not this column.
  SELECT users.role INTO account_role FROM users WHERE users.id = NEW.id;

  IF account_role IS NULL OR account_role = 'admin' THEN
    RETURN NULL;
  END IF;

  IF account_role = 'student' AND NOT EXISTS (
    SELECT 1 FROM students WHERE user_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'student profile required for user %', NEW.id
      USING ERRCODE = '23514';
  ELSIF account_role = 'faculty' AND NOT EXISTS (
    SELECT 1 FROM faculty WHERE user_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'faculty profile required for user %', NEW.id
      USING ERRCODE = '23514';
  ELSIF account_role = 'alumni' AND NOT EXISTS (
    SELECT 1 FROM alumni WHERE user_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'alumni profile required for user %', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_users_require_active_profile
AFTER INSERT OR UPDATE OF role ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_users_require_active_profile();

CREATE OR REPLACE FUNCTION fn_profile_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actual user_role;
  expected user_role;
BEGIN
  expected := CASE TG_TABLE_NAME
    WHEN 'students' THEN 'student'::user_role
    WHEN 'faculty' THEN 'faculty'::user_role
    WHEN 'alumni' THEN 'alumni'::user_role
    ELSE NULL
  END;

  SELECT role INTO actual FROM users WHERE id = OLD.user_id;

  IF actual IS NULL THEN
    RETURN NULL;
  END IF;

  IF actual = expected THEN
    RAISE EXCEPTION 'cannot remove the % profile while the account role is %',
      expected, expected
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_students_delete_guard
AFTER DELETE ON students
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_profile_delete_guard();

CREATE CONSTRAINT TRIGGER trg_faculty_delete_guard
AFTER DELETE ON faculty
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_profile_delete_guard();

CREATE CONSTRAINT TRIGGER trg_alumni_delete_guard
AFTER DELETE ON alumni
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_profile_delete_guard();

CREATE OR REPLACE FUNCTION fn_assert_academic_profile(p_user_id uuid, p_context text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM students WHERE user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM faculty WHERE user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM alumni WHERE user_id = p_user_id) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'academic profile required for %', p_context
    USING ERRCODE = '23514';
END;
$$;

COMMENT ON FUNCTION fn_assert_academic_profile(uuid, text) IS
  'Authors and project members must be a student, faculty member, or alumnus. The account role may have changed since the work was done, so a historical profile row is enough.';

CREATE TABLE alumni_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alumni_user_id uuid NOT NULL,
  organization text NOT NULL,
  position_title text,
  description text,
  start_date date,
  end_date date,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alumni_experiences_alumni_fk
    FOREIGN KEY (alumni_user_id) REFERENCES alumni (user_id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT alumni_experiences_organization_present CHECK (
    char_length(btrim(organization)) BETWEEN 1 AND 200
  ),
  CONSTRAINT alumni_experiences_position_length CHECK (
    position_title IS NULL OR char_length(btrim(position_title)) BETWEEN 1 AND 200
  ),
  CONSTRAINT alumni_experiences_description_length CHECK (
    description IS NULL OR char_length(description) <= 4000
  ),
  CONSTRAINT alumni_experiences_dates CHECK (
    end_date IS NULL OR start_date IS NULL OR end_date >= start_date
  ),
  CONSTRAINT alumni_experiences_current_open CHECK (NOT is_current OR end_date IS NULL)
);

CREATE INDEX idx_alumni_experiences_alumni ON alumni_experiences (alumni_user_id);

CREATE TRIGGER trg_alumni_experiences_set_updated_at
BEFORE UPDATE ON alumni_experiences
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  client_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_tokens_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT refresh_tokens_hash_unique UNIQUE (token_hash),
  CONSTRAINT refresh_tokens_hash_length CHECK (char_length(token_hash) BETWEEN 32 AND 128),
  CONSTRAINT refresh_tokens_expiry CHECK (expires_at > created_at),
  CONSTRAINT refresh_tokens_revoked_after_create CHECK (
    revoked_at IS NULL OR revoked_at >= created_at
  ),
  CONSTRAINT refresh_tokens_user_agent_length CHECK (
    user_agent IS NULL OR char_length(user_agent) <= 500
  )
);

COMMENT ON TABLE refresh_tokens IS
  'Server-side logout. Store a hash of the refresh token, never the raw token. Revoke the row when the user logs out.';

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE VIEW v_user_profiles
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.full_name,
  u.email,
  u.role,
  u.status,
  u.created_at,
  u.updated_at,
  u.last_login_at,
  d.id AS department_id,
  d.code AS department_code,
  d.name AS department_name,
  CASE u.role
    WHEN 'student' THEN s.batch
    WHEN 'alumni' THEN a.batch
    ELSE NULL
  END AS batch,
  f.designation,
  CASE u.role
    WHEN 'faculty' THEN f.mentoring_availability
    WHEN 'alumni' THEN a.mentoring_availability
    ELSE NULL
  END AS mentoring_availability,
  a.current_organization,
  COALESCE(s.profile_photo_url, f.profile_photo_url, a.profile_photo_url) AS profile_photo_url,
  COALESCE(s.bio, f.bio, a.bio) AS bio
FROM users AS u
LEFT JOIN students AS s
  ON s.user_id = u.id
 AND u.role = 'student'
LEFT JOIN faculty AS f
  ON f.user_id = u.id
 AND u.role = 'faculty'
LEFT JOIN alumni AS a
  ON a.user_id = u.id
 AND u.role = 'alumni'
LEFT JOIN departments AS d
  ON d.id = COALESCE(s.department_id, f.department_id, a.department_id);

COMMENT ON VIEW v_user_profiles IS
  'Active profile for directory and login context. Historical profile rows are kept on their own tables and are hidden here after a role change.';

COMMIT;
