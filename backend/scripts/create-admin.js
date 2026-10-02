const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_FULL_NAME || 'Platform Administrator';
  if (!process.env.DATABASE_URL || !email || !password) {
    console.error('DATABASE_URL, ADMIN_EMAIL, and ADMIN_PASSWORD are required.');
    process.exit(1);
  }
  if (password.length < 8 || password.length > 72) {
    console.error('ADMIN_PASSWORD must be 8 to 72 characters.');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existing.rowCount) {
      console.log('An account with that email already exists. No change made.');
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')
       RETURNING id`,
      [fullName, email, passwordHash],
    );
    console.log(`Administrator created: ${rows[0].id}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
