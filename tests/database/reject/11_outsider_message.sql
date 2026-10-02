BEGIN;

INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES
  (
    '00000000-0000-4000-8000-00000000ab11',
    'Message Student',
    'message-student@schema-smoke.test',
    repeat('x', 60),
    'student',
    'active'
  ),
  (
    '00000000-0000-4000-8000-00000000ab12',
    'Message Mentor',
    'message-mentor@schema-smoke.test',
    repeat('x', 60),
    'alumni',
    'active'
  ),
  (
    '00000000-0000-4000-8000-00000000ab13',
    'Message Outsider',
    'message-outsider@schema-smoke.test',
    repeat('x', 60),
    'admin',
    'active'
  );

INSERT INTO students (user_id, department_id, batch)
VALUES (
  '00000000-0000-4000-8000-00000000ab11',
  '00000000-0000-4000-8000-000000000002',
  '2024'
);

INSERT INTO alumni (user_id, department_id, batch, mentoring_availability)
VALUES (
  '00000000-0000-4000-8000-00000000ab12',
  '00000000-0000-4000-8000-000000000002',
  '2019',
  true
);

INSERT INTO mentorship_requests (id, student_user_id, mentor_user_id, subject)
VALUES (
  '00000000-0000-4000-8000-00000000ab14',
  '00000000-0000-4000-8000-00000000ab11',
  '00000000-0000-4000-8000-00000000ab12',
  'A real request'
);

INSERT INTO mentorship_messages (request_id, sender_user_id, body)
VALUES (
  '00000000-0000-4000-8000-00000000ab14',
  '00000000-0000-4000-8000-00000000ab13',
  'An administrator cannot write inside this conversation.'
);

COMMIT;
