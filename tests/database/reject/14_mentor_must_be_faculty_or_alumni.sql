BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES
  (
    '00000000-0000-4000-8000-00000000ae11',
    'Mentee',
    'mentee@schema-smoke.test',
    repeat('x', 60),
    'student',
    'active'
  ),
  (
    '00000000-0000-4000-8000-00000000ae12',
    'Peer Student',
    'peer-student@schema-smoke.test',
    repeat('x', 60),
    'student',
    'active'
  );

INSERT INTO students (user_id, department_id, batch)
VALUES
  ('00000000-0000-4000-8000-00000000ae11', '00000000-0000-4000-8000-000000000002', '2024'),
  ('00000000-0000-4000-8000-00000000ae12', '00000000-0000-4000-8000-000000000002', '2024');

INSERT INTO mentorship_requests (student_user_id, mentor_user_id, subject)
VALUES (
  '00000000-0000-4000-8000-00000000ae11',
  '00000000-0000-4000-8000-00000000ae12',
  'A student cannot mentor'
);

COMMIT;
