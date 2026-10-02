BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000aa31',
  'Email One',
  'Same.Person@schema-smoke.test',
  repeat('x', 60),
  'admin',
  'active'
);

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000aa32',
  'Email Two',
  'same.person@schema-smoke.test',
  repeat('x', 60),
  'admin',
  'active'
);

COMMIT;
