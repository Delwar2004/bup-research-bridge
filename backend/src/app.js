const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { loadEnv } = require('./config/env');
const routes = require('./routes');
const { acceptJson, jsonParserError, notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { badRequest } = require('./utils/errors');
const { PHOTO_DIR } = require('./services/profilePhotos');

function createApp() {
  const env = loadEnv();
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  const origins = env.corsOrigin
    ? env.corsOrigin.split(',').map((item) => item.trim()).filter(Boolean)
    : true;
  app.use(cors({ origin: origins, allowedHeaders: ['Authorization', 'Content-Type', 'Accept'] }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/uploads/')) return next();
    return acceptJson(req, res, next);
  });
  app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
    const length = Number(req.get('content-length') || 0);
    if (!length) return next();
    const type = req.get('content-type') || '';
    if (req.path === '/api/v1/me/profile-photo' && type.includes('multipart/form-data')) return next();
    if (!type.includes('application/json')) {
      return next(badRequest('Content-Type must be application/json.'));
    }
    return next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(jsonParserError);
  app.use('/api/v1', routes);
  app.use('/uploads/profile-photos/:file', (req, res) => {
    const file = req.params.file;
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i.test(file)) {
      res.status(404).end();
      return;
    }
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(PHOTO_DIR, file), { maxAge: '1h' }, (err) => {
      if (!err || res.headersSent) return;
      res.status(404).end();
    });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
