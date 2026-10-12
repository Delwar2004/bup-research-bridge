-- Students may record publications and research projects.
-- Conference papers stay rows in publications. There is no publication-type column.
-- Safe to apply on a database that already ran 001 through 007: functions are replaced in place.

CREATE OR REPLACE FUNCTION fn_publication_creator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id THEN
    RETURN NEW;
  END IF;

  PERFORM fn_assert_active_roles(
    NEW.created_by_user_id,
    ARRAY['student'::user_role, 'faculty'::user_role, 'alumni'::user_role, 'admin'::user_role],
    'publication creator'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_research_project_creator()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id THEN
    RETURN NEW;
  END IF;

  PERFORM fn_assert_active_roles(
    NEW.created_by_user_id,
    ARRAY['student'::user_role, 'faculty'::user_role, 'alumni'::user_role, 'admin'::user_role],
    'research project creator'
  );
  RETURN NEW;
END;
$$;
