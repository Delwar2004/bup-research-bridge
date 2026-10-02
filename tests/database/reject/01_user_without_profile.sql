BEGIN;

INSERT INTO users (full_name, email, password_hash, role, status)
VALUES ('No Profile', 'no-profile@schema-smoke.test', repeat('x', 60), 'student', 'active');

COMMIT;
