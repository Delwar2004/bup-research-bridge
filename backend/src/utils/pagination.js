const { badRequest } = require('./errors');

function parsePage(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || String(query.page ?? '1').includes('.') || page < 1) {
    throw badRequest('Query parameter page must be an integer of at least 1.');
  }
  if (!Number.isInteger(pageSize) || String(query.pageSize ?? '20').includes('.') || pageSize < 1 || pageSize > 100) {
    throw badRequest('Query parameter pageSize must be an integer from 1 to 100.');
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseMessagePage(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 50 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest('Query parameter page must be an integer of at least 1.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw badRequest('Query parameter pageSize must be an integer from 1 to 100.');
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function meta(page, pageSize, totalItems) {
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  return { page, pageSize, totalItems, totalPages };
}

function parseOrder(value) {
  if (value === undefined) return undefined;
  if (value !== 'asc' && value !== 'desc') {
    throw badRequest('Query parameter order must be asc or desc.');
  }
  return value;
}

function resolveSort(sort, order, allow, defaults) {
  const chosenSort = sort || Object.keys(defaults)[0];
  if (!allow[chosenSort]) {
    throw badRequest('Query parameter sort is not supported.');
  }
  const direction = (order || defaults[chosenSort] || 'desc').toUpperCase();
  if (direction !== 'ASC' && direction !== 'DESC') {
    throw badRequest('Query parameter order must be asc or desc.');
  }
  return `${allow[chosenSort]} ${direction}`;
}

module.exports = { parsePage, parseMessagePage, meta, parseOrder, resolveSort };
