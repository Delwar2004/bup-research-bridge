BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000aa05',
  'Still Student',
  'still-student@schema-smoke.test',
  repeat('x', 60),
  'student',
  'active'
);

INSERT INTO students (user_id, department_id, batch)
VALUES (
  '00000000-0000-4000-8000-00000000aa05',
  '00000000-0000-4000-8000-000000000002',
  '2026'
);

DELETE FROM students WHERE user_id = '00000000-0000-4000-8000-00000000aa05';

COMMIT;
