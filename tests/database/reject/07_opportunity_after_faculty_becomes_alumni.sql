BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000aa07',
  'Former Faculty',
  'former-faculty@schema-smoke.test',
  repeat('x', 60),
  'faculty',
  'active'
);

INSERT INTO faculty (user_id, department_id, designation)
VALUES (
  '00000000-0000-4000-8000-00000000aa07',
  '00000000-0000-4000-8000-000000000001',
  'Lecturer'
);

UPDATE users
SET role = 'alumni'
WHERE id = '00000000-0000-4000-8000-00000000aa07';

INSERT INTO alumni (user_id, department_id, batch, current_organization)
VALUES (
  '00000000-0000-4000-8000-00000000aa07',
  '00000000-0000-4000-8000-000000000001',
  '2015',
  'Industry Lab'
);

INSERT INTO thesis_opportunities (
  faculty_user_id, department_id, created_by_user_id, opportunity_type, title, description
) VALUES (
  '00000000-0000-4000-8000-00000000aa07',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-00000000aa07',
  'thesis',
  'Opening after leaving faculty',
  'The faculty profile row remains, but the current role cannot open a new thesis.'
);

COMMIT;
