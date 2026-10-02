BEGIN;

INSERT INTO users (full_name, email, password_hash, role, status)
VALUES ('Short Hash', 'short-hash@schema-smoke.test', 'plaintext', 'admin', 'active');

COMMIT;
