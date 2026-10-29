-- Migration 009. Category-specific publication metadata.
-- Existing publication rows remain uncategorized until an owner edits them.

BEGIN;

ALTER TABLE publications
  ADD COLUMN category text,
  ADD COLUMN journal_name text,
  ADD COLUMN conference_name text,
  ADD COLUMN proceedings_title text,
  ADD COLUMN volume text,
  ADD COLUMN issue text,
  ADD COLUMN page_range text,
  ADD COLUMN publisher text,
  ADD COLUMN keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN review_type text,
  ADD COLUMN preprint_server text,
  ADD COLUMN preprint_id text,
  ADD COLUMN version text,
  ADD COLUMN publication_status text,
  ADD CONSTRAINT publications_category_valid CHECK (
    category IS NULL OR category IN (
      'journal_article',
      'conference_paper',
      'review_survey',
      'preprint'
    )
  ),
  ADD CONSTRAINT publications_journal_name_length CHECK (
    journal_name IS NULL OR char_length(btrim(journal_name)) BETWEEN 1 AND 300
  ),
  ADD CONSTRAINT publications_conference_name_length CHECK (
    conference_name IS NULL OR char_length(btrim(conference_name)) BETWEEN 1 AND 300
  ),
  ADD CONSTRAINT publications_proceedings_title_length CHECK (
    proceedings_title IS NULL OR char_length(btrim(proceedings_title)) BETWEEN 1 AND 500
  ),
  ADD CONSTRAINT publications_volume_length CHECK (
    volume IS NULL OR char_length(btrim(volume)) BETWEEN 1 AND 100
  ),
  ADD CONSTRAINT publications_issue_length CHECK (
    issue IS NULL OR char_length(btrim(issue)) BETWEEN 1 AND 100
  ),
  ADD CONSTRAINT publications_page_range_length CHECK (
    page_range IS NULL OR char_length(btrim(page_range)) BETWEEN 1 AND 100
  ),
  ADD CONSTRAINT publications_publisher_length CHECK (
    publisher IS NULL OR char_length(btrim(publisher)) BETWEEN 1 AND 300
  ),
  ADD CONSTRAINT publications_review_type_valid CHECK (
    review_type IS NULL OR review_type IN (
      'review',
      'systematic_review',
      'survey',
      'meta_analysis'
    )
  ),
  ADD CONSTRAINT publications_preprint_server_length CHECK (
    preprint_server IS NULL OR char_length(btrim(preprint_server)) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT publications_preprint_id_length CHECK (
    preprint_id IS NULL OR char_length(btrim(preprint_id)) BETWEEN 1 AND 200
  ),
  ADD CONSTRAINT publications_version_length CHECK (
    version IS NULL OR char_length(btrim(version)) BETWEEN 1 AND 100
  ),
  ADD CONSTRAINT publications_status_valid CHECK (
    publication_status IS NULL OR publication_status IN ('preprint', 'published', 'withdrawn')
  ),
  ADD CONSTRAINT publications_keywords_valid CHECK (
    cardinality(keywords) <= 25
    AND array_position(keywords, NULL) IS NULL
  ),
  ADD CONSTRAINT publications_category_requirements CHECK (
    category IS NULL OR (
      publication_year IS NOT NULL
      AND (
        (category = 'journal_article' AND journal_name IS NOT NULL)
        OR (category = 'conference_paper' AND conference_name IS NOT NULL)
        OR (category = 'review_survey' AND review_type IS NOT NULL)
        OR (
          category = 'preprint'
          AND preprint_server IS NOT NULL
          AND url IS NOT NULL
          AND publication_status IS NOT NULL
        )
      )
    )
  );

DROP INDEX idx_publications_search;
ALTER TABLE publications DROP COLUMN search_vector;
ALTER TABLE publications ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(abstract, '')), 'B') ||
  setweight(to_tsvector(
    'english',
    coalesce(venue, '') || ' ' ||
    coalesce(journal_name, '') || ' ' ||
    coalesce(conference_name, '') || ' ' ||
    coalesce(proceedings_title, '') || ' ' ||
    coalesce(publisher, '') || ' ' ||
    coalesce(preprint_server, '') || ' ' ||
    coalesce(preprint_id, '')
  ), 'C')
) STORED;

CREATE INDEX idx_publications_search ON publications USING gin (search_vector);
CREATE INDEX idx_publications_category ON publications (category, moderation_status, created_at DESC);

COMMIT;
