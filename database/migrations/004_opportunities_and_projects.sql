-- Migration 004. Thesis opportunities and the previous-work repository.
-- Figure 1 gave an opportunity one research area and hung project membership
-- on student_id, faculty_id, and alumni_id together. An opportunity can now
-- carry several areas. A project member is one user with one role.
-- research_projects.opportunity_id is optional, so older theses can be stored
-- without inventing an opportunity.

BEGIN;

CREATE TABLE thesis_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_user_id uuid NOT NULL,
  department_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  opportunity_type opportunity_type NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  deadline date,
  slots integer,
  required_skills text,
  prerequisites text,
  availability_status availability_status NOT NULL DEFAULT 'open',
  moderation_status moderation_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(required_skills, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(prerequisites, '')), 'C')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT thesis_opportunities_faculty_fk
    FOREIGN KEY (faculty_user_id) REFERENCES faculty (user_id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT thesis_opportunities_department_fk
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT thesis_opportunities_created_by_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT thesis_opportunities_title_present CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  CONSTRAINT thesis_opportunities_description_present CHECK (
    char_length(btrim(description)) BETWEEN 1 AND 20000
  ),
  CONSTRAINT thesis_opportunities_slots_positive CHECK (slots IS NULL OR slots > 0),
  CONSTRAINT thesis_opportunities_skills_length CHECK (
    required_skills IS NULL OR char_length(required_skills) <= 4000
  ),
  CONSTRAINT thesis_opportunities_prerequisites_length CHECK (
    prerequisites IS NULL OR char_length(prerequisites) <= 4000
  )
);

COMMENT ON TABLE thesis_opportunities IS
  'Faculty-owned thesis or research opening. The faculty profile row stays even if that person later changes role. New openings still require the current role to be faculty.';

COMMENT ON COLUMN thesis_opportunities.faculty_user_id IS
  'Owner. Display the name from users. Do not require users.role to still be faculty when reading older rows.';

CREATE OR REPLACE FUNCTION fn_stamp_published_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.moderation_status = 'approved' AND NEW.published_at IS NULL THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_thesis_opportunity_actors()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM fn_assert_active_roles(
      NEW.faculty_user_id,
      ARRAY['faculty'::user_role],
      'thesis opportunity owner'
    );
    PERFORM fn_assert_active_roles(
      NEW.created_by_user_id,
      ARRAY['faculty'::user_role, 'admin'::user_role],
      'thesis opportunity creator'
    );
    RETURN NEW;
  END IF;

  IF NEW.faculty_user_id IS DISTINCT FROM OLD.faculty_user_id THEN
    PERFORM fn_assert_active_roles(
      NEW.faculty_user_id,
      ARRAY['faculty'::user_role],
      'thesis opportunity owner'
    );
  END IF;

  IF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    PERFORM fn_assert_active_roles(
      NEW.created_by_user_id,
      ARRAY['faculty'::user_role, 'admin'::user_role],
      'thesis opportunity creator'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_thesis_opportunities_actors
BEFORE INSERT OR UPDATE OF faculty_user_id, created_by_user_id ON thesis_opportunities
FOR EACH ROW
EXECUTE FUNCTION fn_thesis_opportunity_actors();

CREATE TRIGGER trg_thesis_opportunities_published_at
BEFORE INSERT OR UPDATE OF moderation_status ON thesis_opportunities
FOR EACH ROW
EXECUTE FUNCTION fn_stamp_published_at();

CREATE TRIGGER trg_thesis_opportunities_set_updated_at
BEFORE UPDATE ON thesis_opportunities
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_thesis_opportunities_faculty ON thesis_opportunities (faculty_user_id);
CREATE INDEX idx_thesis_opportunities_department ON thesis_opportunities (department_id);
CREATE INDEX idx_thesis_opportunities_created_by ON thesis_opportunities (created_by_user_id);
CREATE INDEX idx_thesis_opportunities_moderation
  ON thesis_opportunities (moderation_status, created_at DESC);
CREATE INDEX idx_thesis_opportunities_open
  ON thesis_opportunities (deadline)
  WHERE availability_status = 'open' AND moderation_status = 'approved';
CREATE INDEX idx_thesis_opportunities_search
  ON thesis_opportunities USING gin (search_vector);

CREATE TABLE opportunity_research_areas (
  opportunity_id uuid NOT NULL,
  research_area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opportunity_research_areas_pk PRIMARY KEY (opportunity_id, research_area_id),
  CONSTRAINT opportunity_research_areas_opportunity_fk
    FOREIGN KEY (opportunity_id) REFERENCES thesis_opportunities (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT opportunity_research_areas_area_fk
    FOREIGN KEY (research_area_id) REFERENCES research_areas (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX idx_opportunity_research_areas_area
  ON opportunity_research_areas (research_area_id);

CREATE OR REPLACE FUNCTION fn_opportunity_area_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  oid uuid;
  current_status moderation_status;
BEGIN
  IF TG_TABLE_NAME = 'thesis_opportunities' THEN
    oid := COALESCE(NEW.id, OLD.id);
  ELSE
    oid := COALESCE(NEW.opportunity_id, OLD.opportunity_id);
  END IF;

  SELECT moderation_status
  INTO current_status
  FROM thesis_opportunities
  WHERE id = oid;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF current_status = 'approved' AND NOT EXISTS (
    SELECT 1
    FROM opportunity_research_areas
    WHERE opportunity_id = oid
  ) THEN
    RAISE EXCEPTION 'approved thesis opportunity % must include at least one research area', oid
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_thesis_opportunities_area_required
AFTER INSERT OR UPDATE OF moderation_status ON thesis_opportunities
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_opportunity_area_required();

CREATE CONSTRAINT TRIGGER trg_opportunity_research_areas_required
AFTER DELETE ON opportunity_research_areas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_opportunity_area_required();

CREATE TABLE research_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL,
  opportunity_id uuid,
  created_by_user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  project_type project_type NOT NULL,
  project_year smallint NOT NULL,
  external_link text,
  moderation_status moderation_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_projects_department_fk
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT research_projects_opportunity_fk
    FOREIGN KEY (opportunity_id) REFERENCES thesis_opportunities (id)
    ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT research_projects_created_by_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT research_projects_title_present CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  CONSTRAINT research_projects_description_length CHECK (
    description IS NULL OR (
      char_length(btrim(description)) >= 1 AND char_length(description) <= 20000
    )
  ),
  CONSTRAINT research_projects_year_range CHECK (project_year BETWEEN 1990 AND 2100),
  CONSTRAINT research_projects_link_length CHECK (
    external_link IS NULL OR char_length(external_link) BETWEEN 1 AND 2000
  )
);

COMMENT ON TABLE research_projects IS
  'Previous thesis and research repository. Members are rows in project_members, each naming one user.';

CREATE OR REPLACE FUNCTION fn_research_project_creator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id THEN
    RETURN NEW;
  END IF;

  PERFORM fn_assert_active_roles(
    NEW.created_by_user_id,
    ARRAY['faculty'::user_role, 'alumni'::user_role, 'admin'::user_role],
    'research project creator'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_research_projects_creator
BEFORE INSERT OR UPDATE OF created_by_user_id ON research_projects
FOR EACH ROW
EXECUTE FUNCTION fn_research_project_creator();

CREATE TRIGGER trg_research_projects_published_at
BEFORE INSERT OR UPDATE OF moderation_status ON research_projects
FOR EACH ROW
EXECUTE FUNCTION fn_stamp_published_at();

CREATE TRIGGER trg_research_projects_set_updated_at
BEFORE UPDATE ON research_projects
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_research_projects_department ON research_projects (department_id);
CREATE INDEX idx_research_projects_opportunity ON research_projects (opportunity_id);
CREATE INDEX idx_research_projects_created_by ON research_projects (created_by_user_id);
CREATE INDEX idx_research_projects_year ON research_projects (project_year);
CREATE INDEX idx_research_projects_moderation
  ON research_projects (moderation_status, created_at DESC);
CREATE INDEX idx_research_projects_search ON research_projects USING gin (search_vector);

CREATE TABLE project_research_areas (
  project_id uuid NOT NULL,
  research_area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_research_areas_pk PRIMARY KEY (project_id, research_area_id),
  CONSTRAINT project_research_areas_project_fk
    FOREIGN KEY (project_id) REFERENCES research_projects (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT project_research_areas_area_fk
    FOREIGN KEY (research_area_id) REFERENCES research_areas (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX idx_project_research_areas_area ON project_research_areas (research_area_id);

CREATE OR REPLACE FUNCTION fn_project_area_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pid uuid;
  current_status moderation_status;
BEGIN
  IF TG_TABLE_NAME = 'research_projects' THEN
    pid := COALESCE(NEW.id, OLD.id);
  ELSE
    pid := COALESCE(NEW.project_id, OLD.project_id);
  END IF;

  SELECT moderation_status
  INTO current_status
  FROM research_projects
  WHERE id = pid;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF current_status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM project_research_areas WHERE project_id = pid
  ) THEN
    RAISE EXCEPTION 'approved research project % must include at least one research area', pid
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_research_projects_area_required
AFTER INSERT OR UPDATE OF moderation_status ON research_projects
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_project_area_required();

CREATE CONSTRAINT TRIGGER trg_project_research_areas_required
AFTER DELETE ON project_research_areas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_project_area_required();

CREATE TABLE project_members (
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  member_role member_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_members_pk PRIMARY KEY (project_id, user_id),
  CONSTRAINT project_members_project_fk
    FOREIGN KEY (project_id) REFERENCES research_projects (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT project_members_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION
);

COMMENT ON TABLE project_members IS
  'One user per project. member_role replaces the Figure 1 columns student_id, faculty_id, and alumni_id.';

CREATE OR REPLACE FUNCTION fn_project_member_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM fn_assert_academic_profile(NEW.user_id, 'project member');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_members_profile
BEFORE INSERT OR UPDATE OF user_id ON project_members
FOR EACH ROW
EXECUTE FUNCTION fn_project_member_profile();

CREATE OR REPLACE FUNCTION fn_project_member_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pid uuid;
  current_status moderation_status;
BEGIN
  IF TG_TABLE_NAME = 'research_projects' THEN
    pid := COALESCE(NEW.id, OLD.id);
  ELSE
    pid := COALESCE(NEW.project_id, OLD.project_id);
  END IF;

  SELECT moderation_status
  INTO current_status
  FROM research_projects
  WHERE id = pid;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF current_status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM project_members WHERE project_id = pid
  ) THEN
    RAISE EXCEPTION 'approved research project % must include at least one member', pid
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_research_projects_member_required
AFTER INSERT OR UPDATE OF moderation_status ON research_projects
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_project_member_required();

CREATE CONSTRAINT TRIGGER trg_project_members_required
AFTER DELETE ON project_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_project_member_required();

CREATE INDEX idx_project_members_user ON project_members (user_id);

CREATE VIEW v_thesis_opportunities
WITH (security_invoker = true) AS
SELECT
  o.id,
  o.faculty_user_id,
  u.full_name AS faculty_name,
  u.role AS faculty_account_role,
  u.status AS faculty_account_status,
  f.designation,
  f.mentoring_availability,
  d.id AS department_id,
  d.code AS department_code,
  d.name AS department_name,
  o.created_by_user_id,
  o.opportunity_type,
  o.title,
  o.description,
  o.deadline,
  o.slots,
  o.required_skills,
  o.prerequisites,
  o.availability_status,
  o.moderation_status,
  o.published_at,
  o.created_at,
  o.updated_at
FROM thesis_opportunities AS o
JOIN faculty AS f ON f.user_id = o.faculty_user_id
JOIN users AS u ON u.id = f.user_id
JOIN departments AS d ON d.id = o.department_id;

COMMENT ON VIEW v_thesis_opportunities IS
  'Opportunity plus owner identity. The owner is shown even after users.role is no longer faculty. Public queries still filter moderation_status and availability_status in the API.';

COMMIT;
