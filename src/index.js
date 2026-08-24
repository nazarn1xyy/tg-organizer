// ── Entry point: Express (Mini App + API) + Telegram bot ─────────
import express from 'express';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { webhookCallback } from 'grammy';
import { createBot } from './bot.js';
import { itemsApi } from './api.js';
import { metaApi } from './api2.js';
import { tgAuth } from './auth.js';
import { startScheduler } from './scheduler.js';

// Auto-load .env file if available (locally)
try {
  process.loadEnvFile?.();
} catch (e) {
  // .env file not found or already loaded
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const PORT = Number(process.env.PORT || 7890);
const WEBAPP_URL = process.env.WEBAPP_URL || `http://localhost:${PORT}`;

const app = express();

// ── Compression middleware (gzip for JSON API and static assets) ──
app.use((req, res, next) => {
  const origJson = res.json.bind(res);
  const origSend = res.send.bind(res);
  const ae = req.headers['accept-encoding'] || '';

  function tryCompress(body, contentType) {
    if (!ae.includes('gzip')) return null;
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    // Only compress responses larger than 1KB
    if (Buffer.byteLength(raw, 'utf8') < 1024) return null;
    try {
      const compressed = zlib.gzipSync(raw, { level: 1 }); // fast compression
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', compressed.length);
      return compressed;
    } catch { return null; }
  }

  res.json = function(obj) {
    const compressed = tryCompress(obj, 'application/json; charset=utf-8');
    if (compressed) { res.end(compressed); return res; }
    return origJson(obj);
  };

  next();
});

app.use(express.json({ limit: '10mb' }));

// ── Static file serving ──
const webappDir = path.join(__dirname, '..', 'webapp');
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, must-revalidate');
  next();
});
app.use(express.static(webappDir, {
  etag: true,
  lastModified: true,
}));

// Telegram Bot Webhook / Polling setup
let bot = null;
if (BOT_TOKEN) {
  try {
    bot = createBot(BOT_TOKEN, WEBAPP_URL);
    if (process.env.VERCEL) {
      // Serverless Webhook on Vercel
      app.use('/api/bot-webhook', webhookCallback(bot, 'express'));
    } else {
      // Local/VPS long polling
      startScheduler(bot);
      bot.start({
        onStart: () => console.log('🤖 Telegram Bot started (long polling)'),
      }).catch(err => {
        console.error('⚠️  Failed to connect Telegram bot:', err.message);
      });
    }
  } catch (err) {
    console.error('⚠️  Bot initialization error:', err.message);
  }
}

// API — protected by Telegram initData signature (or dev mode fallback)
app.use('/api', tgAuth(BOT_TOKEN), itemsApi(), metaApi());

let server = null;
if (!process.env.VERCEL) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Telegram Mini App + API running on http://localhost:${PORT}`);
  });
}

export default app;
export { app, server, bot };
