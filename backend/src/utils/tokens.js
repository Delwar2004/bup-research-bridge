const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { loadEnv } = require('../config/env');

function signAccessToken(user) {
  const env = loadEnv();
  const accessToken = jwt.sign(
    { sub: user.id, role: user.role, status: user.status },
    env.jwtSecret,
    { expiresIn: env.accessTtl, algorithm: 'HS256' },
  );
  const decoded = jwt.decode(accessToken);
  return {
    accessToken,
    accessTokenExpiresAt: new Date(decoded.exp * 1000).toISOString(),
  };
}

function verifyAccessToken(token) {
  const env = loadEnv();
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}

function newRefreshToken() {
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  return { refreshToken, tokenHash };
}

function hashRefreshToken(refreshToken) {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, newRefreshToken, hashRefreshToken };
