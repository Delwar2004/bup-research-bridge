const { query } = require('../db/pool');
const notificationRepository = require('../repositories/notificationRepository');
const { toNotification } = require('../utils/presenters');
const { invalid, notFound } = require('../utils/errors');
const { meta, parsePage } = require('../utils/pagination');
const {
  assertObject, rejectUnknown, asBoolean, parseQueryBool, parseQueryEnum,
} = require('../validators/common');
const { NOTIFICATION_TYPES } = require('../domain/constants');

async function list(user, queryParams) {
  const filters = {
    isRead: parseQueryBool(queryParams.isRead, 'isRead'),
    notificationType: parseQueryEnum(queryParams.notificationType, 'notificationType', NOTIFICATION_TYPES),
  };
  const paging = parsePage(queryParams);
  const result = await notificationRepository.listForUser({ query }, user.id, filters, paging);
  return { data: result.rows.map(toNotification), meta: meta(paging.page, paging.pageSize, result.total) };
}

async function unread(user) {
  const unreadCount = await notificationRepository.unreadCount({ query }, user.id);
  return { unreadCount };
}

async function update(user, id, body) {
  const obj = assertObject(body);
  rejectUnknown(obj, ['isRead']);
  if (obj.isRead === undefined) throw invalid('isRead', 'required', 'This field is required.');
  const isRead = asBoolean(obj.isRead, 'isRead');
  const row = await notificationRepository.updateRead({ query }, id, user.id, isRead);
  if (!row) throw notFound();
  return toNotification(row);
}

async function readAll(user) {
  const updatedCount = await notificationRepository.markAllRead({ query }, user.id);
  return { updatedCount };
}

module.exports = { list, unread, update, readAll };
