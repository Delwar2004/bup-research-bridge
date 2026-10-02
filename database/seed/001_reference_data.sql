-- Reference data for local development. Safe to run more than once.
-- No user accounts are seeded, so this file does not ship a password.
-- Department and research-area ids are stable for fixtures.

BEGIN;

INSERT INTO departments (id, code, name, description)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'CSE',
    'Department of Computer Science and Engineering',
    'Computer Science and Engineering, Bangladesh University of Professionals.'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'ICT',
    'Department of Information and Communication Technology',
    'Information and Communication Technology, Bangladesh University of Professionals.'
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO research_areas (id, slug, name, description)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'artificial-intelligence', 'Artificial Intelligence', NULL),
  ('00000000-0000-4000-8000-000000000102', 'machine-learning', 'Machine Learning', NULL),
  ('00000000-0000-4000-8000-000000000103', 'deep-learning', 'Deep Learning', NULL),
  ('00000000-0000-4000-8000-000000000104', 'data-science', 'Data Science', NULL),
  ('00000000-0000-4000-8000-000000000105', 'computer-vision', 'Computer Vision', NULL),
  ('00000000-0000-4000-8000-000000000106', 'natural-language-processing', 'Natural Language Processing', NULL),
  ('00000000-0000-4000-8000-000000000107', 'cybersecurity', 'Cybersecurity', NULL),
  ('00000000-0000-4000-8000-000000000108', 'networking', 'Networking', NULL),
  ('00000000-0000-4000-8000-000000000109', 'software-engineering', 'Software Engineering', NULL),
  ('00000000-0000-4000-8000-000000000110', 'internet-of-things', 'Internet of Things', NULL),
  ('00000000-0000-4000-8000-000000000111', 'robotics', 'Robotics', NULL),
  ('00000000-0000-4000-8000-000000000112', 'communication-systems', 'Communication Systems', NULL),
  ('00000000-0000-4000-8000-000000000113', 'human-computer-interaction', 'Human-Computer Interaction', NULL)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
