BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000aa08',
  'Area Faculty',
  'area-faculty@schema-smoke.test',
  repeat('x', 60),
  'faculty',
  'active'
);

INSERT INTO faculty (user_id, department_id, designation)
VALUES (
  '00000000-0000-4000-8000-00000000aa08',
  '00000000-0000-4000-8000-000000000001',
  'Lecturer'
);

INSERT INTO thesis_opportunities (
  faculty_user_id, department_id, created_by_user_id, opportunity_type,
  title, description, moderation_status
) VALUES (
  '00000000-0000-4000-8000-00000000aa08',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-00000000aa08',
  'thesis',
  'Approved with no area',
  'Approval requires a research area so search filters have something to match.',
  'approved'
);

COMMIT;
