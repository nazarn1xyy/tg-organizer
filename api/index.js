import express from 'express';
import { webhookCallback } from 'grammy';
import { createBot } from '../src/bot.js';
import { itemsApi } from '../src/api.js';
import { metaApi } from '../src/api2.js';
import { tgAuth } from '../src/auth.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || '';

let bot = null;
if (BOT_TOKEN) {
  try {
    bot = createBot(BOT_TOKEN, WEBAPP_URL);
    app.use('/api/bot-webhook', webhookCallback(bot, 'express'));
  } catch (err) {
    console.error('Bot init error in serverless function:', err);
  }
}

app.use('/api', tgAuth(BOT_TOKEN), itemsApi(), metaApi());

// Global error handler
app.use((err, req, res, next) => {
  console.error('Serverless API Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
