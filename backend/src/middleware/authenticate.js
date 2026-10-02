const { query } = require('../db/pool');
const { verifyAccessToken } = require('../utils/tokens');
const { unauthorized, accountStatusError, forbidden } = require('../utils/errors');

async function loadActiveUser(userId) {
  const { rows } = await query(
    `SELECT id, role, status FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] || null;
}

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const match = header.match(/^Bearer\s+(\S+)$/i);
    if (!match) throw unauthorized();
    let payload;
    try {
      payload = verifyAccessToken(match[1]);
    } catch {
      throw unauthorized();
    }
    if (!payload || !payload.sub) throw unauthorized();
    const user = await loadActiveUser(payload.sub);
    if (!user) throw unauthorized();
    if (user.status !== 'active') throw accountStatusError(user.status);
    req.user = { id: user.id, role: user.role, status: user.status };
    next();
  } catch (err) {
    next(err);
  }
}

async function optionalAuthenticate(req, res, next) {
  const header = req.get('authorization') || '';
  if (!header) return next();
  try {
    await authenticate(req, res, (err) => {
      if (err) req.user = null;
      next();
    });
  } catch {
    req.user = null;
    next();
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

module.exports = { authenticate, optionalAuthenticate, requireRoles };
