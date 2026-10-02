-- Migration 003. Shared research vocabulary and the three interest junctions.
-- Figure 1's separate junctions are kept. Each junction references one role
-- profile, so a student interest cannot point at a faculty id.

BEGIN;

CREATE TABLE research_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name citext NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_areas_slug_unique UNIQUE (slug),
  CONSTRAINT research_areas_name_unique UNIQUE (name),
  CONSTRAINT research_areas_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT research_areas_name_present CHECK (char_length(btrim(name::text)) BETWEEN 1 AND 150),
  CONSTRAINT research_areas_description_length CHECK (
    description IS NULL OR char_length(description) <= 4000
  )
);

CREATE TRIGGER trg_research_areas_set_updated_at
BEFORE UPDATE ON research_areas
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_research_areas_active ON research_areas (name) WHERE is_active;

CREATE TABLE student_research_areas (
  student_user_id uuid NOT NULL,
  research_area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_research_areas_pk PRIMARY KEY (student_user_id, research_area_id),
  CONSTRAINT student_research_areas_student_fk
    FOREIGN KEY (student_user_id) REFERENCES students (user_id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT student_research_areas_area_fk
    FOREIGN KEY (research_area_id) REFERENCES research_areas (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE faculty_research_areas (
  faculty_user_id uuid NOT NULL,
  research_area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faculty_research_areas_pk PRIMARY KEY (faculty_user_id, research_area_id),
  CONSTRAINT faculty_research_areas_faculty_fk
    FOREIGN KEY (faculty_user_id) REFERENCES faculty (user_id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT faculty_research_areas_area_fk
    FOREIGN KEY (research_area_id) REFERENCES research_areas (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE TABLE alumni_research_areas (
  alumni_user_id uuid NOT NULL,
  research_area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alumni_research_areas_pk PRIMARY KEY (alumni_user_id, research_area_id),
  CONSTRAINT alumni_research_areas_alumni_fk
    FOREIGN KEY (alumni_user_id) REFERENCES alumni (user_id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT alumni_research_areas_area_fk
    FOREIGN KEY (research_area_id) REFERENCES research_areas (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX idx_student_research_areas_area ON student_research_areas (research_area_id);
CREATE INDEX idx_faculty_research_areas_area ON faculty_research_areas (research_area_id);
CREATE INDEX idx_alumni_research_areas_area ON alumni_research_areas (research_area_id);

COMMENT ON TABLE research_areas IS
  'Controlled vocabulary for interests, expertise, opportunities, projects, and publications. Deactivate a row instead of deleting it once it is referenced.';

COMMIT;
