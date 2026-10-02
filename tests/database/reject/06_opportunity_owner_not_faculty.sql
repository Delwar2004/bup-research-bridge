BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000aa06',
  'Student Owner',
  'student-owner@schema-smoke.test',
  repeat('x', 60),
  'student',
  'active'
);

INSERT INTO students (user_id, department_id, batch)
VALUES (
  '00000000-0000-4000-8000-00000000aa06',
  '00000000-0000-4000-8000-000000000001',
  '2024'
);

INSERT INTO thesis_opportunities (
  faculty_user_id, department_id, created_by_user_id, opportunity_type, title, description
) VALUES (
  '00000000-0000-4000-8000-00000000aa06',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-00000000aa06',
  'thesis',
  'Student cannot own this',
  'A student account cannot be the faculty owner.'
);

COMMIT;
