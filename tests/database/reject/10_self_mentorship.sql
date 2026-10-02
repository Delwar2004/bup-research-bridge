BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000aa10',
  'Both Roles',
  'both-roles@schema-smoke.test',
  repeat('x', 60),
  'student',
  'active'
);

INSERT INTO students (user_id, department_id, batch)
VALUES (
  '00000000-0000-4000-8000-00000000aa10',
  '00000000-0000-4000-8000-000000000001',
  '2023'
);

INSERT INTO mentorship_requests (student_user_id, mentor_user_id, subject)
VALUES (
  '00000000-0000-4000-8000-00000000aa10',
  '00000000-0000-4000-8000-00000000aa10',
  'Ask myself'
);

COMMIT;
