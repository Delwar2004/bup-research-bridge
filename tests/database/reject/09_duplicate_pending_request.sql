BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES
  (
    '00000000-0000-4000-8000-00000000aa91',
    'Pending Student',
    'pending-student@schema-smoke.test',
    repeat('x', 60),
    'student',
    'active'
  ),
  (
    '00000000-0000-4000-8000-00000000aa92',
    'Pending Mentor',
    'pending-mentor@schema-smoke.test',
    repeat('x', 60),
    'faculty',
    'active'
  );

INSERT INTO students (user_id, department_id, batch)
VALUES (
  '00000000-0000-4000-8000-00000000aa91',
  '00000000-0000-4000-8000-000000000002',
  '2024'
);

INSERT INTO faculty (user_id, department_id, designation, mentoring_availability)
VALUES (
  '00000000-0000-4000-8000-00000000aa92',
  '00000000-0000-4000-8000-000000000002',
  'Lecturer',
  true
);

INSERT INTO mentorship_requests (student_user_id, mentor_user_id, subject)
VALUES (
  '00000000-0000-4000-8000-00000000aa91',
  '00000000-0000-4000-8000-00000000aa92',
  'First request'
);

INSERT INTO mentorship_requests (student_user_id, mentor_user_id, subject)
VALUES (
  '00000000-0000-4000-8000-00000000aa91',
  '00000000-0000-4000-8000-00000000aa92',
  'Duplicate request'
);

COMMIT;
