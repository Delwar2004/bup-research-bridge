const bcrypt = require('bcryptjs');

const ROUNDS = 12;

function assertPasswordLength(password, field = 'password') {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    const { invalid } = require('./errors');
    throw invalid(field, 'length', 'Password must be 8 to 72 characters.');
  }
}

async function hashPassword(password) {
  return bcrypt.hash(password, ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || !passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}

module.exports = { hashPassword, verifyPassword, assertPasswordLength };
