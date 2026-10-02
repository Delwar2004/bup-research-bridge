-- Happy-path check for the BUP Research Bridge schema.
-- The runner applies migrations and seed, then this file. It rolls back.
-- Rejected cases live in tests/database/reject/.

BEGIN;

DO $smoke$
DECLARE
  expected_tables text[] := ARRAY[
    'activity_logs',
    'alumni',
    'alumni_experiences',
    'alumni_research_areas',
    'departments',
    'faculty',
    'faculty_research_areas',
    'mentorship_messages',
    'mentorship_requests',
    'notifications',
    'opportunity_research_areas',
    'project_members',
    'project_research_areas',
    'publication_authors',
    'publication_research_areas',
    'publications',
    'refresh_tokens',
    'research_areas',
    'research_projects',
    'student_research_areas',
    'students',
    'thesis_opportunities',
    'users'
  ];
  actual_tables text[];
  dept_cse uuid;
  dept_ict uuid;
  area_ai uuid;
  area_net uuid;
  faculty_id uuid := gen_random_uuid();
  student_id uuid := gen_random_uuid();
  alumni_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  temp_student_id uuid := gen_random_uuid();
  opp_id uuid := gen_random_uuid();
  disposable_opp_id uuid := gen_random_uuid();
  project_id uuid := gen_random_uuid();
  publication_id uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  profile_role user_role;
  profile_batch text;
  profile_org text;
  responded timestamptz;
  search_hits integer;
  fk_count integer;
BEGIN
  SELECT coalesce(array_agg(table_name ORDER BY table_name), ARRAY[]::text[])
  INTO actual_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';

  IF actual_tables <> expected_tables THEN
    RAISE EXCEPTION 'smoke: table list %', actual_tables;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('student_id', 'faculty_id', 'alumni_id')
  ) THEN
    RAISE EXCEPTION 'smoke: polymorphic person id columns are present';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_extension
    WHERE extname IN ('citext', 'pg_trgm')
  ) <> 2 THEN
    RAISE EXCEPTION 'smoke: citext or pg_trgm is missing';
  END IF;

  PERFORM 1 FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'v_user_profiles';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smoke: v_user_profiles is missing';
  END IF;

  PERFORM 1 FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'v_thesis_opportunities';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smoke: v_thesis_opportunities is missing';
  END IF;

  SELECT count(*) INTO fk_count
  FROM pg_constraint
  WHERE contype = 'f'
    AND connamespace = 'public'::regnamespace;
  IF fk_count < 30 THEN
    RAISE EXCEPTION 'smoke: expected real foreign keys, found %', fk_count;
  END IF;

  SELECT id INTO dept_cse FROM departments WHERE code = 'CSE';
  SELECT id INTO dept_ict FROM departments WHERE code = 'ICT';
  SELECT id INTO area_ai FROM research_areas WHERE slug = 'artificial-intelligence';
  SELECT id INTO area_net FROM research_areas WHERE slug = 'networking';
  IF dept_cse IS NULL OR dept_ict IS NULL OR area_ai IS NULL OR area_net IS NULL THEN
    RAISE EXCEPTION 'smoke: reference seed is missing';
  END IF;

  INSERT INTO users (id, full_name, email, password_hash, role, status)
  VALUES
    (faculty_id, 'Faculty Smoke', 'faculty@schema-smoke.test', repeat('x', 60), 'faculty', 'active'),
    (student_id, 'Student Smoke', 'student@schema-smoke.test', repeat('x', 60), 'student', 'active'),
    (alumni_id, 'Alumni Smoke', 'alumni@schema-smoke.test', repeat('x', 60), 'alumni', 'active'),
    (admin_id, 'Admin Smoke', 'admin@schema-smoke.test', repeat('x', 60), 'admin', 'active'),
    (temp_student_id, 'Temp Student', 'temp-student@schema-smoke.test', repeat('x', 60), 'student', 'active');

  INSERT INTO faculty (user_id, department_id, designation, mentoring_availability, bio)
  VALUES (faculty_id, dept_cse, 'Assistant Professor', true, 'Networks and distributed systems.');

  INSERT INTO students (user_id, department_id, batch)
  VALUES
    (student_id, dept_ict, '2024'),
    (temp_student_id, dept_ict, '2025');

  INSERT INTO alumni (user_id, department_id, batch, current_organization, mentoring_availability)
  VALUES (alumni_id, dept_cse, '2018', 'BUP Research Lab', true);

  INSERT INTO faculty_research_areas (faculty_user_id, research_area_id)
  VALUES (faculty_id, area_ai), (faculty_id, area_net);

  INSERT INTO student_research_areas (student_user_id, research_area_id)
  VALUES (student_id, area_ai);

  INSERT INTO alumni_research_areas (alumni_user_id, research_area_id)
  VALUES (alumni_id, area_net);

  INSERT INTO alumni_experiences (
    alumni_user_id, organization, position_title, start_date, is_current
  ) VALUES (
    alumni_id, 'BUP Research Lab', 'Research Mentor', DATE '2020-01-01', true
  );

  INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
  VALUES (student_id, repeat('t', 64), now() + interval '7 days');

  INSERT INTO thesis_opportunities (
    id, faculty_user_id, department_id, created_by_user_id, opportunity_type,
    title, description, deadline, slots, required_skills, prerequisites
  ) VALUES (
    opp_id, faculty_id, dept_cse, faculty_id, 'thesis',
    'Quantum Networking Thesis',
    'A thesis opening on quantum networking for undergraduate students.',
    DATE '2027-06-30', 2, 'Computer networks', 'CSE or ICT third year'
  );

  INSERT INTO opportunity_research_areas (opportunity_id, research_area_id)
  VALUES (opp_id, area_net), (opp_id, area_ai);

  UPDATE thesis_opportunities
  SET moderation_status = 'approved'
  WHERE id = opp_id;

  INSERT INTO thesis_opportunities (
    id, faculty_user_id, department_id, created_by_user_id, opportunity_type,
    title, description, moderation_status
  ) VALUES (
    disposable_opp_id, faculty_id, dept_ict, admin_id, 'research',
    'Disposable Research Opening',
    'Created by an administrator on behalf of a faculty member.',
    'approved'
  );

  INSERT INTO opportunity_research_areas (opportunity_id, research_area_id)
  VALUES (disposable_opp_id, area_ai);

  SELECT count(*) INTO search_hits
  FROM thesis_opportunities
  WHERE search_vector @@ websearch_to_tsquery('english', 'quantum networking');
  IF search_hits <> 1 THEN
    RAISE EXCEPTION 'smoke: full text search returned % rows', search_hits;
  END IF;

  PERFORM 1 FROM v_thesis_opportunities
  WHERE id = opp_id
    AND faculty_name = 'Faculty Smoke'
    AND moderation_status = 'approved'
    AND published_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smoke: opportunity listing view is incomplete';
  END IF;

  INSERT INTO research_projects (
    id, department_id, opportunity_id, created_by_user_id,
    title, description, project_type, project_year, moderation_status
  ) VALUES (
    project_id, dept_cse, opp_id, faculty_id,
    'Earlier Networking Study', 'Repository record linked to an opening.',
    'thesis', 2025, 'approved'
  );

  INSERT INTO project_research_areas (project_id, research_area_id)
  VALUES (project_id, area_net);

  INSERT INTO project_members (project_id, user_id, member_role)
  VALUES
    (project_id, faculty_id, 'supervisor'),
    (project_id, student_id, 'author');

  INSERT INTO publications (
    id, created_by_user_id, title, abstract, venue, publication_year, doi, moderation_status
  ) VALUES (
    publication_id, faculty_id, 'Routing Notes', 'Short abstract.',
    'BUP Workshop', 2025, '10.1000/smoke.1', 'approved'
  );

  INSERT INTO publication_research_areas (publication_id, research_area_id)
  VALUES (publication_id, area_net);

  INSERT INTO publication_authors (publication_id, user_id, author_order)
  VALUES
    (publication_id, faculty_id, 1),
    (publication_id, student_id, 2);

  INSERT INTO mentorship_requests (id, student_user_id, mentor_user_id, opportunity_id, subject)
  VALUES (request_id, student_id, faculty_id, opp_id, 'Supervision request');

  INSERT INTO mentorship_messages (request_id, sender_user_id, body)
  VALUES (request_id, student_id, 'I would like to work on quantum networking.');

  UPDATE mentorship_requests
  SET status = 'accepted'
  WHERE id = request_id;

  SELECT responded_at INTO responded FROM mentorship_requests WHERE id = request_id;
  IF responded IS NULL THEN
    RAISE EXCEPTION 'smoke: accepted request did not stamp responded_at';
  END IF;

  INSERT INTO notifications (recipient_user_id, notification_type, message, opportunity_id)
  VALUES (
    student_id, 'opportunity_published',
    'A networking thesis opening was approved.', opp_id
  );

  UPDATE notifications
  SET is_read = true
  WHERE recipient_user_id = student_id;

  PERFORM 1 FROM notifications
  WHERE recipient_user_id = student_id
    AND is_read
    AND read_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smoke: reading a notification did not stamp read_at';
  END IF;

  INSERT INTO activity_logs (actor_user_id, action, entity_type, entity_id, summary)
  VALUES (admin_id, 'approve', 'thesis_opportunity', opp_id, 'Approved the smoke opening.');

  UPDATE users SET role = 'alumni' WHERE id = student_id;
  INSERT INTO alumni (user_id, department_id, batch, current_organization)
  VALUES (student_id, dept_ict, '2024', 'Graduate Lab');

  SELECT role, batch, current_organization
  INTO profile_role, profile_batch, profile_org
  FROM v_user_profiles
  WHERE id = student_id;

  IF profile_role <> 'alumni' OR profile_batch <> '2024' OR profile_org <> 'Graduate Lab' THEN
    RAISE EXCEPTION 'smoke: directory still shows the old student profile';
  END IF;

  PERFORM 1 FROM students WHERE user_id = student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smoke: graduation removed the student profile';
  END IF;

  PERFORM 1 FROM mentorship_requests WHERE id = request_id AND student_user_id = student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smoke: graduation orphaned the mentorship request';
  END IF;

  BEGIN
    INSERT INTO mentorship_requests (student_user_id, mentor_user_id, subject)
    VALUES (student_id, alumni_id, 'Request after graduation');
    RAISE EXCEPTION 'smoke: graduated student opened a new student request';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  UPDATE users SET role = 'alumni' WHERE id = temp_student_id;
  INSERT INTO alumni (user_id, department_id, batch, current_organization)
  VALUES (temp_student_id, dept_ict, '2025', 'No history lab');
  DELETE FROM students WHERE user_id = temp_student_id;

  DELETE FROM thesis_opportunities WHERE id = disposable_opp_id;
  DELETE FROM publications WHERE id = publication_id;
END
$smoke$;

SET CONSTRAINTS ALL IMMEDIATE;

ROLLBACK;
