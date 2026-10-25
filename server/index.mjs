import { createApp } from './app.mjs';
const { server } = createApp({
  dataDir: process.env.DATA_DIR || './data', dataKey: process.env.DATA_KEY,
  apiKey: process.env.OPENAI_API_KEY, model: process.env.AI_MODEL || 'gpt-6.1-sol',
  origin: process.env.APP_ORIGIN || 'http://127.0.0.1:5182',
  secureCookie: process.env.COOKIE_SECURE !== 'false', trustProxy: process.env.TRUST_PROXY === 'true'
});
server.listen(Number(process.env.PORT || 3182), process.env.HOST || '0.0.0.0', () => console.log('Alltag ready'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
