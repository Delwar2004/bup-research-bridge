const { withTransaction, query } = require('../db/pool');
const userRepository = require('../repositories/userRepository');
const { hashPassword, verifyPassword, assertPasswordLength } = require('../utils/password');
const { signAccessToken, newRefreshToken, hashRefreshToken } = require('../utils/tokens');
const { toPrivateAccount } = require('../utils/presenters');
const {
  unauthorized, accountStatusError, invalid, forbidden,
} = require('../utils/errors');
const {
  assertObject, rejectUnknown, requireFields, asTrimmedString, asOptionalString,
  asEnum, asUuid, asOptionalBoolean, asUuidArray, asEmail,
} = require('../validators/common');
const { SELF_REGISTER_ROLES, ROLES, ACCOUNT_STATUS } = require('../domain/constants');
const {
  assertDepartment, assertActiveAreas, requestMeta,
} = require('./rules');

const PROFILE_FIELDS = {
  student: ['batch', 'bio', 'profilePhotoUrl', 'researchAreaIds'],
  faculty: ['designation', 'mentoringAvailability', 'bio', 'profilePhotoUrl', 'researchAreaIds'],
  alumni: ['batch', 'currentOrganization', 'mentoringAvailability', 'bio', 'profilePhotoUrl', 'researchAreaIds'],
};

function parseRegistration(body, { allowAdmin, allowStatus }) {
  const obj = assertObject(body);
  requireFields(obj, ['fullName', 'email', 'password', 'role']);
  const role = asEnum(obj.role, 'role', allowAdmin ? ROLES : SELF_REGISTER_ROLES);
  if (!allowAdmin && role === 'admin') {
    throw invalid('role', 'enum', 'Administrators cannot self-register.');
  }
  const allowed = ['fullName', 'email', 'password', 'role'];
  if (role !== 'admin') {
    allowed.push('departmentId', ...PROFILE_FIELDS[role]);
  }
  if (allowStatus) allowed.push('status');
  rejectUnknown(obj, [...new Set(allowed)]);

  const parsed = {
    fullName: asTrimmedString(obj.fullName, 'fullName', { min: 1, max: 200 }),
    email: asEmail(obj.email),
    password: obj.password,
    role,
    status: allowStatus && obj.status !== undefined ? asEnum(obj.status, 'status', ACCOUNT_STATUS) : 'pending',
  };
  assertPasswordLength(parsed.password);
  if (role === 'admin') return parsed;

  requireFields(obj, ['departmentId']);
  parsed.departmentId = asUuid(obj.departmentId, 'departmentId');
  parsed.bio = asOptionalString(obj.bio, 'bio', { max: 5000, nullable: true }) ?? null;
  parsed.profilePhotoUrl = asOptionalString(obj.profilePhotoUrl, 'profilePhotoUrl', { max: 2000, nullable: true }) ?? null;
  parsed.researchAreaIds = obj.researchAreaIds === undefined ? [] : asUuidArray(obj.researchAreaIds, 'researchAreaIds');
  if (role === 'student' || role === 'alumni') {
    requireFields(obj, ['batch']);
    parsed.batch = asTrimmedString(obj.batch, 'batch', { min: 1, max: 32 });
  }
  if (role === 'faculty') {
    requireFields(obj, ['designation']);
    parsed.designation = asTrimmedString(obj.designation, 'designation', { min: 1, max: 200 });
    parsed.mentoringAvailability = obj.mentoringAvailability === undefined ? false : asOptionalBoolean(obj.mentoringAvailability, 'mentoringAvailability');
  }
  if (role === 'alumni') {
    parsed.currentOrganization = asOptionalString(obj.currentOrganization, 'currentOrganization', { max: 200, nullable: true }) ?? null;
    parsed.mentoringAvailability = obj.mentoringAvailability === undefined ? false : asOptionalBoolean(obj.mentoringAvailability, 'mentoringAvailability');
  }
  return parsed;
}

async function createAccount(db, parsed) {
  if (parsed.role !== 'admin') {
    await assertDepartment(db, parsed.departmentId);
    await assertActiveAreas(db, parsed.researchAreaIds);
  }
  const passwordHash = await hashPassword(parsed.password);
  const user = await userRepository.insertUser(db, {
    fullName: parsed.fullName,
    email: parsed.email,
    passwordHash,
    role: parsed.role,
    status: parsed.status,
  });
  if (parsed.role === 'student') {
    await userRepository.insertStudent(db, {
      userId: user.id,
      departmentId: parsed.departmentId,
      batch: parsed.batch,
      profilePhotoUrl: parsed.profilePhotoUrl,
      bio: parsed.bio,
    });
  } else if (parsed.role === 'faculty') {
    await userRepository.insertFaculty(db, {
      userId: user.id,
      departmentId: parsed.departmentId,
      designation: parsed.designation,
      mentoringAvailability: parsed.mentoringAvailability,
      profilePhotoUrl: parsed.profilePhotoUrl,
      bio: parsed.bio,
    });
  } else if (parsed.role === 'alumni') {
    await userRepository.insertAlumni(db, {
      userId: user.id,
      departmentId: parsed.departmentId,
      batch: parsed.batch,
      currentOrganization: parsed.currentOrganization,
      mentoringAvailability: parsed.mentoringAvailability,
      profilePhotoUrl: parsed.profilePhotoUrl,
      bio: parsed.bio,
    });
  }
  if (parsed.role !== 'admin') {
    await userRepository.replaceResearchAreas(db, parsed.role, user.id, parsed.researchAreaIds);
  }
  return user;
}

async function register(body) {
  const parsed = parseRegistration(body, { allowAdmin: false, allowStatus: false });
  const user = await withTransaction((db) => createAccount(db, parsed));
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

async function issueSession(db, user, req) {
  await userRepository.touchLastLogin(db, user.id);
  const { refreshToken, tokenHash } = newRefreshToken();
  const meta = requestMeta(req);
  const stored = await userRepository.insertRefreshToken(db, {
    userId: user.id,
    tokenHash,
    userAgent: meta.userAgent,
    clientIp: meta.clientIp,
  });
  const access = signAccessToken(user);
  return {
    ...access,
    refreshToken,
    refreshTokenExpiresAt: stored.expires_at,
  };
}

async function login(body, req) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['email', 'password']);
  requireFields(obj, ['email', 'password']);
  const email = asEmail(obj.email);
  if (typeof obj.password !== 'string' || obj.password.length < 1 || obj.password.length > 72) {
    throw unauthorized('Invalid email or password.');
  }
  const credentials = await userRepository.findCredentialsByEmail({ query }, email);
  const matches = credentials ? await verifyPassword(obj.password, credentials.password_hash) : false;
  if (!credentials || !matches) throw unauthorized('Invalid email or password.');
  if (credentials.status !== 'active') throw accountStatusError(credentials.status);
  const session = await withTransaction(async (db) => issueSession(db, credentials, req));
  const profile = await userRepository.findProfileById({ query }, credentials.id);
  return {
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    user: toPrivateAccount(profile),
  };
}

async function refresh(body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['refreshToken']);
  requireFields(obj, ['refreshToken']);
  if (typeof obj.refreshToken !== 'string' || !obj.refreshToken) {
    throw unauthorized('Refresh token is invalid.');
  }
  const tokenHash = hashRefreshToken(obj.refreshToken);
  return withTransaction(async (db) => {
    const row = await userRepository.findRefreshToken(db, tokenHash);
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw unauthorized('Refresh token is invalid.');
    }
    const { rows } = await db.query(
      `SELECT id, role, status FROM users WHERE id = $1`,
      [row.user_id],
    );
    const user = rows[0];
    if (!user) throw unauthorized('Refresh token is invalid.');
    if (user.status !== 'active') throw accountStatusError(user.status);
    const revoked = await userRepository.revokeRefreshTokenById(db, row.id);
    if (!revoked) throw unauthorized('Refresh token is invalid.');
    const next = newRefreshToken();
    const stored = await userRepository.insertRefreshToken(db, {
      userId: user.id,
      tokenHash: next.tokenHash,
      userAgent: null,
      clientIp: null,
    });
    const access = signAccessToken(user);
    return {
      accessToken: access.accessToken,
      accessTokenExpiresAt: access.accessTokenExpiresAt,
      refreshToken: next.refreshToken,
      refreshTokenExpiresAt: stored.expires_at,
      user: { id: user.id, role: user.role, status: user.status },
    };
  });
}

async function logout(body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['refreshToken']);
  requireFields(obj, ['refreshToken']);
  if (typeof obj.refreshToken === 'string' && obj.refreshToken) {
    await userRepository.revokeRefreshToken({ query }, hashRefreshToken(obj.refreshToken));
  }
}

async function logoutAll(userId) {
  const revokedCount = await userRepository.revokeAllRefreshTokens({ query }, userId);
  return { revokedCount };
}

async function me(userId) {
  const profile = await userRepository.findProfileById({ query }, userId);
  if (!profile) throw unauthorized();
  return toPrivateAccount(profile);
}

async function changePassword(userId, body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['currentPassword', 'newPassword']);
  requireFields(obj, ['currentPassword', 'newPassword']);
  if (typeof obj.currentPassword !== 'string') {
    throw unauthorized('Current password is incorrect.');
  }
  assertPasswordLength(obj.newPassword, 'newPassword');
  if (obj.newPassword === obj.currentPassword) {
    throw invalid('newPassword', 'different', 'New password must be different from the current password.');
  }
  const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  const matches = rows[0] ? await verifyPassword(obj.currentPassword, rows[0].password_hash) : false;
  if (!matches) throw unauthorized('Current password is incorrect.');
  const passwordHash = await hashPassword(obj.newPassword);
  await withTransaction(async (db) => {
    await userRepository.updatePassword(db, userId, passwordHash);
    await userRepository.revokeAllRefreshTokens(db, userId);
  });
}

module.exports = {
  parseRegistration,
  createAccount,
  register,
  login,
  refresh,
  logout,
  logoutAll,
  me,
  changePassword,
};
