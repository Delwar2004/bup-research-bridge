const { loadEnv } = require('./config/env');
const { createApp } = require('./app');

const env = loadEnv();
const app = createApp();

app.listen(env.port, () => {
  console.log(`BUP Research Bridge API listening on port ${env.port}`);
});
