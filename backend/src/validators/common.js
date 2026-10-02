const { badRequest, invalid, validation } = require('../utils/errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function assertObject(body) {
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object.');
  }
  return body;
}

function assertEmptyBody(body) {
  const obj = assertObject(body);
  const keys = Object.keys(obj);
  if (keys.length) {
    throw validation(keys.map((field) => ({
      field,
      rule: 'unknown',
      message: 'This request does not accept a body.',
    })));
  }
}

function rejectUnknown(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw validation(unknown.map((field) => ({
      field,
      rule: 'unknown',
      message: 'Unknown field.',
    })));
  }
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined);
  if (missing.length) {
    throw validation(missing.map((field) => ({
      field,
      rule: 'required',
      message: 'This field is required.',
    })));
  }
}

function asTrimmedString(value, field, { min, max, trim = true }) {
  if (typeof value !== 'string') {
    throw invalid(field, 'type', 'Must be a string.');
  }
  const text = trim ? value.trim() : value;
  if (min != null && text.length < min) {
    throw invalid(field, 'length', `Must be at least ${min} characters.`);
  }
  if (max != null && text.length > max) {
    throw invalid(field, 'length', `Must be at most ${max} characters.`);
  }
  return text;
}

function asOptionalString(value, field, opts) {
  if (value === undefined) return undefined;
  if (value === null) {
    if (!opts.nullable) throw invalid(field, 'type', 'Must be a string.');
    return null;
  }
  const text = asTrimmedString(value, field, { min: opts.min ?? 1, max: opts.max, trim: opts.trim !== false });
  if (text.length === 0) {
    if (opts.nullable) return null;
    throw invalid(field, 'length', 'Must not be empty.');
  }
  return text;
}

function asEnum(value, field, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw invalid(field, 'enum', `Must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

function asUuid(value, field) {
  if (!isUuid(value)) throw invalid(field, 'format', 'Must be a UUID.');
  return value;
}

function asOptionalUuid(value, field) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return asUuid(value, field);
}

function asBoolean(value, field) {
  if (typeof value !== 'boolean') throw invalid(field, 'type', 'Must be a boolean.');
  return value;
}

function asOptionalBoolean(value, field) {
  if (value === undefined) return undefined;
  return asBoolean(value, field);
}

function asInteger(value, field, { min, max, nullable = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid(field, 'type', 'Must be an integer.');
  }
  if (min != null && value < min) throw invalid(field, 'range', `Must be at least ${min}.`);
  if (max != null && value > max) throw invalid(field, 'range', `Must be at most ${max}.`);
  return value;
}

function asDate(value, field, { nullable = false } = {}) {
  if (value === undefined) return undefined;
  if (value === null) {
    if (!nullable) throw invalid(field, 'type', 'Must be a date.');
    return null;
  }
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw invalid(field, 'format', 'Must be a date in YYYY-MM-DD form.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw invalid(field, 'format', 'Must be a real calendar date.');
  }
  return value;
}

function asUuidArray(value, field, { max = 25, allowEmpty = true } = {}) {
  if (!Array.isArray(value)) throw invalid(field, 'type', 'Must be an array of UUIDs.');
  if (!allowEmpty && value.length === 0) throw invalid(field, 'required', 'At least one id is required.');
  if (value.length > max) throw invalid(field, 'length', `At most ${max} ids are allowed.`);
  const ids = value.map((item, index) => {
    if (!isUuid(item)) throw invalid(field, 'format', `Item ${index} must be a UUID.`);
    return item;
  });
  if (new Set(ids).size !== ids.length) {
    throw invalid(field, 'duplicate', 'Duplicate ids are not allowed.');
  }
  return ids;
}

function asEmail(value, field = 'email') {
  const email = asTrimmedString(value, field, { min: 3, max: 320, trim: true });
  if (!EMAIL_RE.test(email)) throw invalid(field, 'format', 'Email must look like a mailbox address.');
  return email;
}

function parseQueryBool(value, name) {
  if (value === undefined) return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw badRequest(`Query parameter ${name} must be true or false.`);
}

function parseQueryEnum(value, name, allowed) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw badRequest(`Query parameter ${name} must be one of: ${allowed.join(', ')}.`);
  }
  return value;
}

function parseQueryUuid(value, name) {
  if (value === undefined) return undefined;
  if (!isUuid(value)) throw badRequest(`Query parameter ${name} must be a UUID.`);
  return value;
}

function parseQueryUuidList(value, name) {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => {
    if (!isUuid(item)) throw badRequest(`Query parameter ${name} must be a UUID.`);
    return item;
  });
}

function parseQueryInt(value, name, { min, max } = {}) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    throw badRequest(`Query parameter ${name} must be an integer.`);
  }
  const number = Number(value);
  if (min != null && number < min) throw badRequest(`Query parameter ${name} must be at least ${min}.`);
  if (max != null && number > max) throw badRequest(`Query parameter ${name} must be at most ${max}.`);
  return number;
}

function parseOptionalText(value, name, max) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest(`Query parameter ${name} must be a string.`);
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > max) throw badRequest(`Query parameter ${name} must be at most ${max} characters.`);
  return text;
}

function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

function parseDateTime(value, name) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw badRequest(`Query parameter ${name} must be a date-time.`);
  }
  return new Date(value).toISOString();
}

module.exports = {
  UUID_RE,
  SLUG_RE,
  isUuid,
  assertObject,
  assertEmptyBody,
  rejectUnknown,
  requireFields,
  asTrimmedString,
  asOptionalString,
  asEnum,
  asUuid,
  asOptionalUuid,
  asBoolean,
  asOptionalBoolean,
  asInteger,
  asDate,
  asUuidArray,
  asEmail,
  parseQueryBool,
  parseQueryEnum,
  parseQueryUuid,
  parseQueryUuidList,
  parseQueryInt,
  parseOptionalText,
  likePattern,
  parseDateTime,
};
