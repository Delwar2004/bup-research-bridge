const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const root = path.join(__dirname, '../../database');
const files = [
  ...fs.readdirSync(path.join(root, 'migrations')).filter((name) => name.endsWith('.sql')).sort()
    .map((name) => path.join(root, 'migrations', name)),
  path.join(root, 'seed', '001_reference_data.sql'),
];

for (const file of files) {
  execFileSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit' });
}

console.log('Migrations and reference seed applied.');
