const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { loadEnv } = require('./config/env');
const routes = require('./routes');
const { acceptJson, jsonParserError, notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { badRequest } = require('./utils/errors');

function createApp() {
  const env = loadEnv();
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  const origins = env.corsOrigin
    ? env.corsOrigin.split(',').map((item) => item.trim()).filter(Boolean)
    : true;
  app.use(cors({ origin: origins, allowedHeaders: ['Authorization', 'Content-Type', 'Accept'] }));
  app.use(acceptJson);
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
    const length = Number(req.get('content-length') || 0);
    if (!length) return next();
    const type = req.get('content-type') || '';
    if (!type.includes('application/json')) {
      return next(badRequest('Content-Type must be application/json.'));
    }
    return next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(jsonParserError);
  app.use('/api/v1', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
