BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES
  (
    '00000000-0000-4000-8000-00000000ac12',
    'Author Faculty',
    'author-faculty@schema-smoke.test',
    repeat('x', 60),
    'faculty',
    'active'
  ),
  (
    '00000000-0000-4000-8000-00000000ac13',
    'Author Admin',
    'author-admin@schema-smoke.test',
    repeat('x', 60),
    'admin',
    'active'
  );

INSERT INTO faculty (user_id, department_id, designation)
VALUES (
  '00000000-0000-4000-8000-00000000ac12',
  '00000000-0000-4000-8000-000000000001',
  'Lecturer'
);

INSERT INTO publications (id, created_by_user_id, title, moderation_status)
VALUES (
  '00000000-0000-4000-8000-00000000ac14',
  '00000000-0000-4000-8000-00000000ac12',
  'Admin is not an author',
  'draft'
);

INSERT INTO publication_authors (publication_id, user_id, author_order)
VALUES (
  '00000000-0000-4000-8000-00000000ac14',
  '00000000-0000-4000-8000-00000000ac13',
  1
);

COMMIT;
