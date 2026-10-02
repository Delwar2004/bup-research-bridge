-- BUP Research Bridge, migration 001 of 007.
-- Apply database/migrations in lexical order:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/001_extensions_types_and_functions.sql
--
-- Figure 1 is not implemented as drawn. These are the corrections this schema locks in:
--   * users is the only account. students, faculty, and alumni share users.id.
--   * A person keeps earlier profile rows when their role changes, so graduation
--     does not orphan mentorship requests or publications.
--   * publications is a real entity. publication_authors points at one user.
--   * project_members points at one user and a member role.
--   * mentorship_requests has one student sender and one faculty or alumni mentor.
--   * notifications point at a user and, when relevant, a real opportunity or request.
--   * activity_logs is the only table with an entity id and no foreign key,
--     because one log covers every table.

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_role AS ENUM ('student', 'faculty', 'alumni', 'admin');

CREATE TYPE account_status AS ENUM ('pending', 'active', 'suspended', 'rejected');

CREATE TYPE moderation_status AS ENUM (
  'draft',
  'pending',
  'approved',
  'rejected',
  'archived'
);

CREATE TYPE availability_status AS ENUM ('open', 'closed', 'filled');

CREATE TYPE mentorship_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'completed'
);

CREATE TYPE opportunity_type AS ENUM ('thesis', 'research');

CREATE TYPE project_type AS ENUM ('thesis', 'research', 'academic_project');

CREATE TYPE member_role AS ENUM ('supervisor', 'co_supervisor', 'author');

CREATE TYPE notification_type AS ENUM (
  'opportunity_published',
  'mentorship_requested',
  'mentorship_updated',
  'message_received',
  'content_moderated',
  'account_updated'
);

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_set_updated_at() IS
  'BEFORE UPDATE trigger. Stamps updated_at with the transaction timestamp.';

COMMIT;
