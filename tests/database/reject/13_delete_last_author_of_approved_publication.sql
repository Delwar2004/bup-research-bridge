BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000ad13',
  'Last Author',
  'last-author@schema-smoke.test',
  repeat('x', 60),
  'faculty',
  'active'
);

INSERT INTO faculty (user_id, department_id, designation)
VALUES (
  '00000000-0000-4000-8000-00000000ad13',
  '00000000-0000-4000-8000-000000000001',
  'Lecturer'
);

INSERT INTO publications (id, created_by_user_id, title, moderation_status)
VALUES (
  '00000000-0000-4000-8000-00000000ad14',
  '00000000-0000-4000-8000-00000000ad13',
  'Needs an author',
  'approved'
);

INSERT INTO publication_authors (publication_id, user_id, author_order)
VALUES (
  '00000000-0000-4000-8000-00000000ad14',
  '00000000-0000-4000-8000-00000000ad13',
  1
);

INSERT INTO publication_research_areas (publication_id, research_area_id)
VALUES (
  '00000000-0000-4000-8000-00000000ad14',
  '00000000-0000-4000-8000-000000000108'
);

DELETE FROM publication_authors
WHERE publication_id = '00000000-0000-4000-8000-00000000ad14';

COMMIT;
