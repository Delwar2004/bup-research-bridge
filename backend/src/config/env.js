const path = require('path');
const dotenv = require('dotenv');

let loaded = false;

function loadEnv() {
  if (!loaded) {
    dotenv.config({ path: path.join(__dirname, '../../.env') });
    loaded = true;
  }

  const databaseUrl = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.');
  }

  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return {
    databaseUrl,
    jwtSecret,
    port,
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '',
    accessTtl: '15m',
    refreshDays: 14,
  };
}

module.exports = { loadEnv };
