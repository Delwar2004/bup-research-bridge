-- Migration 005. Publication records.
-- Figure 1 stopped at PUBLICATION_AUTHOR, with Publication_ID, a repeated
-- Faculty_ID, and Student_ID / Faculty_ID / Alumni_ID and no publication
-- attributes. publications holds the record. Each author is one user.

BEGIN;

CREATE TABLE publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id uuid NOT NULL,
  title text NOT NULL,
  abstract text,
  venue text,
  publication_year smallint,
  doi text,
  url text,
  published_on date,
  moderation_status moderation_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(abstract, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(venue, '')), 'C')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publications_created_by_fk
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT publications_title_present CHECK (char_length(btrim(title)) BETWEEN 1 AND 500),
  CONSTRAINT publications_abstract_length CHECK (
    abstract IS NULL OR (
      char_length(btrim(abstract)) >= 1 AND char_length(abstract) <= 20000
    )
  ),
  CONSTRAINT publications_venue_length CHECK (
    venue IS NULL OR char_length(btrim(venue)) BETWEEN 1 AND 300
  ),
  CONSTRAINT publications_year_range CHECK (
    publication_year IS NULL OR publication_year BETWEEN 1950 AND 2100
  ),
  CONSTRAINT publications_doi_length CHECK (
    doi IS NULL OR char_length(btrim(doi)) BETWEEN 1 AND 255
  ),
  CONSTRAINT publications_url_length CHECK (
    url IS NULL OR char_length(url) BETWEEN 1 AND 2000
  )
);

CREATE UNIQUE INDEX idx_publications_doi_unique
  ON publications (lower(doi))
  WHERE doi IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_publication_creator()
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
    'publication creator'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_publications_creator
BEFORE INSERT OR UPDATE OF created_by_user_id ON publications
FOR EACH ROW
EXECUTE FUNCTION fn_publication_creator();

CREATE TRIGGER trg_publications_published_at
BEFORE INSERT OR UPDATE OF moderation_status ON publications
FOR EACH ROW
EXECUTE FUNCTION fn_stamp_published_at();

CREATE TRIGGER trg_publications_set_updated_at
BEFORE UPDATE ON publications
FOR EACH ROW
EXECUTE FUNCTION fn_set_updated_at();

CREATE INDEX idx_publications_created_by ON publications (created_by_user_id);
CREATE INDEX idx_publications_year ON publications (publication_year);
CREATE INDEX idx_publications_moderation ON publications (moderation_status, created_at DESC);
CREATE INDEX idx_publications_search ON publications USING gin (search_vector);

CREATE TABLE publication_authors (
  publication_id uuid NOT NULL,
  user_id uuid NOT NULL,
  author_order smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_authors_pk PRIMARY KEY (publication_id, user_id),
  CONSTRAINT publication_authors_order_unique UNIQUE (publication_id, author_order),
  CONSTRAINT publication_authors_publication_fk
    FOREIGN KEY (publication_id) REFERENCES publications (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT publication_authors_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT publication_authors_order_positive CHECK (author_order > 0)
);

COMMENT ON TABLE publication_authors IS
  'One author per row. user_id replaces the polymorphic Student_ID, Faculty_ID, and Alumni_ID set.';

CREATE OR REPLACE FUNCTION fn_publication_author_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM fn_assert_academic_profile(NEW.user_id, 'publication author');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_publication_authors_profile
BEFORE INSERT OR UPDATE OF user_id ON publication_authors
FOR EACH ROW
EXECUTE FUNCTION fn_publication_author_profile();

CREATE OR REPLACE FUNCTION fn_publication_author_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pid uuid;
  current_status moderation_status;
BEGIN
  IF TG_TABLE_NAME = 'publications' THEN
    pid := COALESCE(NEW.id, OLD.id);
  ELSE
    pid := COALESCE(NEW.publication_id, OLD.publication_id);
  END IF;

  SELECT moderation_status
  INTO current_status
  FROM publications
  WHERE id = pid;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF current_status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM publication_authors WHERE publication_id = pid
  ) THEN
    RAISE EXCEPTION 'approved publication % must include at least one author', pid
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_publications_author_required
AFTER INSERT OR UPDATE OF moderation_status ON publications
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_publication_author_required();

CREATE CONSTRAINT TRIGGER trg_publication_authors_required
AFTER DELETE ON publication_authors
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_publication_author_required();

CREATE INDEX idx_publication_authors_user ON publication_authors (user_id);

CREATE TABLE publication_research_areas (
  publication_id uuid NOT NULL,
  research_area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_research_areas_pk PRIMARY KEY (publication_id, research_area_id),
  CONSTRAINT publication_research_areas_publication_fk
    FOREIGN KEY (publication_id) REFERENCES publications (id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT publication_research_areas_area_fk
    FOREIGN KEY (research_area_id) REFERENCES research_areas (id)
    ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX idx_publication_research_areas_area
  ON publication_research_areas (research_area_id);

CREATE OR REPLACE FUNCTION fn_publication_area_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pid uuid;
  current_status moderation_status;
BEGIN
  IF TG_TABLE_NAME = 'publications' THEN
    pid := COALESCE(NEW.id, OLD.id);
  ELSE
    pid := COALESCE(NEW.publication_id, OLD.publication_id);
  END IF;

  SELECT moderation_status
  INTO current_status
  FROM publications
  WHERE id = pid;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF current_status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM publication_research_areas WHERE publication_id = pid
  ) THEN
    RAISE EXCEPTION 'approved publication % must include at least one research area', pid
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_publications_area_required
AFTER INSERT OR UPDATE OF moderation_status ON publications
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_publication_area_required();

CREATE CONSTRAINT TRIGGER trg_publication_research_areas_required
AFTER DELETE ON publication_research_areas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_publication_area_required();

COMMIT;
