#!/usr/bin/env bash
# Builds a throwaway database, applies the schema, and checks the Figure 1 fixes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${SCHEMA_SMOKE_DB:-bup_schema_smoke}"

drop_db() {
  sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}

psql_db() {
  sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 "$@"
}

expect_fail() {
  local name="$1"
  local pattern="$2"
  local file="$3"
  local output
  local status

  set +e
  output="$(psql_db -f "$file" 2>&1)"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    echo "FAIL ${name}: statement was accepted"
    printf '%s\n' "$output"
    exit 1
  fi

  if ! grep -Eq "$pattern" <<<"$output"; then
    echo "FAIL ${name}: rejected for an unexpected reason"
    printf '%s\n' "$output"
    exit 1
  fi

  echo "ok rejected: ${name}"
}

drop_db
sudo -u postgres createdb "$DB"
trap drop_db EXIT

for migration in "$ROOT"/database/migrations/*.sql; do
  echo "apply $(basename "$migration")"
  psql_db -f "$migration" >/dev/null
done

echo "apply seed"
psql_db -f "$ROOT/database/seed/001_reference_data.sql" >/dev/null

echo "run happy path"
psql_db -f "$ROOT/tests/database/schema_smoke.sql" >/dev/null
echo "ok accepted: happy path"

expect_fail "user without profile" "student profile required" \
  "$ROOT/tests/database/reject/01_user_without_profile.sql"
expect_fail "profile for the wrong role" "account role is student" \
  "$ROOT/tests/database/reject/02_profile_for_wrong_role.sql"
expect_fail "duplicate email" "users_email_unique" \
  "$ROOT/tests/database/reject/03_duplicate_email.sql"
expect_fail "short password hash" "users_password_hash_length" \
  "$ROOT/tests/database/reject/04_short_password.sql"
expect_fail "remove the active profile in the same transaction" "student profile required" \
  "$ROOT/tests/database/reject/05_remove_active_profile.sql"

psql_db -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
BEGIN;
INSERT INTO users (id, full_name, email, password_hash, role, status)
VALUES (
  '00000000-0000-4000-8000-00000000aa15',
  'Committed Student',
  'committed-student@schema-smoke.test',
  repeat('x', 60),
  'student',
  'active'
);
INSERT INTO students (user_id, department_id, batch)
VALUES (
  '00000000-0000-4000-8000-00000000aa15',
  '00000000-0000-4000-8000-000000000002',
  '2026'
);
COMMIT;
SQL
expect_fail "remove a committed active profile" "cannot remove the student profile" \
  "$ROOT/tests/database/reject/15_remove_committed_profile.sql"
psql_db -v ON_ERROR_STOP=1 -c \
  "DELETE FROM users WHERE id = '00000000-0000-4000-8000-00000000aa15';" >/dev/null
expect_fail "student owns an opportunity" "thesis opportunity owner" \
  "$ROOT/tests/database/reject/06_opportunity_owner_not_faculty.sql"
expect_fail "former faculty opens a new opportunity" "thesis opportunity owner" \
  "$ROOT/tests/database/reject/07_opportunity_after_faculty_becomes_alumni.sql"
expect_fail "approved opportunity without an area" "at least one research area" \
  "$ROOT/tests/database/reject/08_approved_opportunity_without_area.sql"
expect_fail "duplicate pending request" "mentorship_requests_one_pending_general_idx" \
  "$ROOT/tests/database/reject/09_duplicate_pending_request.sql"
expect_fail "self mentorship" "mentorship mentor" \
  "$ROOT/tests/database/reject/10_self_mentorship.sql"
expect_fail "outsider message" "only the student or the mentor" \
  "$ROOT/tests/database/reject/11_outsider_message.sql"
expect_fail "admin listed as an author" "academic profile required" \
  "$ROOT/tests/database/reject/12_admin_publication_author.sql"
expect_fail "approved publication loses its last author" "at least one author" \
  "$ROOT/tests/database/reject/13_delete_last_author_of_approved_publication.sql"
expect_fail "student listed as a mentor" "mentorship mentor" \
  "$ROOT/tests/database/reject/14_mentor_must_be_faculty_or_alumni.sql"

leftovers="$(psql_db -tA -c "SELECT count(*) FROM users WHERE email::text LIKE '%@schema-smoke.test'")"
if [[ "$leftovers" != "0" ]]; then
  echo "FAIL: ${leftovers} smoke users were committed"
  exit 1
fi

echo "schema smoke passed"
