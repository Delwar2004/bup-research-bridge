BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000aa02',
  'Wrong Role',
  'wrong-role@schema-smoke.test',
  repeat('x', 60),
  'faculty',
  'active'
);

INSERT INTO students (user_id, department_id, batch)
VALUES (
  '00000000-0000-4000-8000-00000000aa02',
  '00000000-0000-4000-8000-000000000001',
  '2024'
);

COMMIT;
