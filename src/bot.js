// ── Telegram bot: quick capture + commands ───────────────────────
import { Bot, InlineKeyboard } from 'grammy';
import { db, ensureUser, setTags, snapshot, touch } from './db.js';

export function createBot(token, webappUrl) {
  const bot = new Bot(token);

  // per-chat pending state: { mode: 'note'|'quote'|'task'|'reminder' }
  const pending = new Map();

  const extractTags = (text) => (text.match(/#([\p{L}\p{N}_-]+)/gu) || []).map(t => t.slice(1));

  async function createItem(userId, kind, fields) {
    const info = await db.run(`INSERT INTO items
      (user_id, kind, title, body, quote_author, quote_source, quote_category,
       due_at, priority, remind_at, repeat_rule, repeat_n, nag_minutes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId, kind, fields.title || '', fields.body || '',
        fields.quote_author || null, fields.quote_source || null, fields.quote_category || null,
        fields.due_at || null, fields.priority || null, fields.remind_at || null,
        fields.repeat_rule || null, fields.repeat_n || null, fields.nag_minutes || null
      ]);
    const tags = extractTags((fields.body || '') + ' ' + (fields.title || ''));
    if (tags.length) await setTags(info.lastInsertRowid, userId, tags);
    return info.lastInsertRowid;
  }

  // "завтра 15:00", "15:00", "25.12 10:30", "25.12.2026 10:30"
  function parseWhen(text) {
    const now = new Date();
    let m = text.match(/(?:(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s+)?(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(now);
    if (m[1]) {
      d.setMonth(Number(m[2]) - 1, Number(m[1]));
      if (m[3]) d.setFullYear(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]));
    }
    d.setHours(Number(m[4]), Number(m[5]), 0, 0);
    if (/завтра/i.test(text)) d.setDate(now.getDate() + 1);
    else if (!m[1] && d <= now) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  const mainKb = () => new InlineKeyboard()
    .webApp('Открыть органайзер', webappUrl);

  bot.command('start', async (ctx) => {
    await ensureUser(ctx.from);
    await ctx.reply(
      'Личный органайзер.\n\n' +
      'Просто отправь любое сообщение — я сохраню его как заметку.\n' +
      'Перешли фото, файл, голосовое — тоже сохраню.\n\n' +
      'Команды:\n' +
      '/note — заметка\n/quote — цитата\n/task — задача\n/remind — напоминание\n' +
      '/random — случайная цитата\n/today — на сегодня\n/app — открыть Mini App',
      { reply_markup: mainKb() });
  });

  bot.command('app', (ctx) => ctx.reply('Органайзер:', { reply_markup: mainKb() }));

  for (const [cmd, mode, hint] of [
    ['note', 'note', 'Отправь текст заметки (можно #теги, Markdown):'],
    ['quote', 'quote', 'Отправь цитату в формате:\nтекст цитаты — Автор (Источник)'],
    ['task', 'task', 'Отправь задачу:\nназвание | завтра 15:00 | high'],
    ['remind', 'reminder', 'Отправь напоминание:\nтекст завтра 09:00\n(или "каждый день 09:00")'],
  ]) {
    bot.command(cmd, async (ctx) => {
      await ensureUser(ctx.from);
      pending.set(ctx.chat.id, { mode });
      await ctx.reply(hint);
    });
  }

  bot.command('random', async (ctx) => {
    await ensureUser(ctx.from);
    const q = await db.get(`SELECT * FROM items WHERE user_id=? AND kind='quote'
      AND deleted_at IS NULL ORDER BY RANDOM() LIMIT 1`, [ctx.from.id]);
    await ctx.reply(q
      ? `«${q.body}»${q.quote_author ? `\n— ${q.quote_author}` : ''}`
      : 'Пока нет ни одной цитаты. Добавь через /quote');
  });

  bot.command('today', async (ctx) => {
    await ensureUser(ctx.from);
    const rows = await db.all(`SELECT * FROM items WHERE user_id=? AND deleted_at IS NULL AND archived=0
      AND (date(due_at)=date('now','localtime') OR date(remind_at)=date('now','localtime'))
      ORDER BY COALESCE(due_at, remind_at) LIMIT 20`, [ctx.from.id]);
    if (!rows.length) return ctx.reply('На сегодня ничего не запланировано.');
    const lines = rows.map(r => {
      const t = (r.due_at || r.remind_at || '').slice(11, 16);
      const mark = r.kind === 'task' ? (r.status === 'done' ? '✅' : '☐') : '🔔';
      return `${mark} ${t} — ${r.title || r.body}`;
    });
    await ctx.reply(lines.join('\n'));
  });

  // reminder buttons
  bot.callbackQuery(/^ack:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    await snapshot(id);
    await db.run(`UPDATE items SET acked=1, remind_at=NULL, status='done',
      completed_at=datetime('now') WHERE id=? AND user_id=?`, [id, ctx.from.id]);
    await touch(id);
    await ctx.answerCallbackQuery({ text: 'Выполнено ✓' });
    await ctx.editMessageReplyMarkup();
  });
  bot.callbackQuery(/^snooze:(\d+):(\d+)$/, async (ctx) => {
    const [, id, min] = ctx.match;
    await snapshot(Number(id));
    const next = new Date(Date.now() + Number(min) * 60000)
      .toISOString().slice(0, 19).replace('T', ' ');
    await db.run('UPDATE items SET remind_at=?, acked=0 WHERE id=? AND user_id=?', [next, Number(id), ctx.from.id]);
    await ctx.answerCallbackQuery({ text: `Отложено на ${min} мин` });
    await ctx.editMessageReplyMarkup();
  });

  // media capture (photo / video / document / audio / voice)
  async function saveMedia(ctx, type, fileId, name) {
    const user = await ensureUser(ctx.from);
    const caption = ctx.message.caption || '';
    const id = await createItem(ctx.from.id, user?.default_section === 'task' ? 'task' : 'note', {
      title: caption.split('\n')[0].slice(0, 80),
      body: caption,
    });
    await db.run('INSERT INTO attachments (item_id, type, file_id, name) VALUES (?,?,?,?)', [id, type, fileId, name || null]);
    await ctx.reply(`Сохранено (${type}) ✓`, { reply_markup: mainKb() });
  }

  bot.on('message:photo', (ctx) => saveMedia(ctx, 'photo', ctx.message.photo.at(-1).file_id));
  bot.on('message:video', (ctx) => saveMedia(ctx, 'video', ctx.message.video.file_id, ctx.message.video.file_name));
  bot.on('message:document', (ctx) => saveMedia(ctx, 'document', ctx.message.document.file_id, ctx.message.document.file_name));
  bot.on('message:audio', (ctx) => saveMedia(ctx, 'audio', ctx.message.audio.file_id, ctx.message.audio.file_name));
  bot.on('message:voice', (ctx) => saveMedia(ctx, 'voice', ctx.message.voice.file_id));

  // text capture — respects pending command mode, defaults to note
  bot.on('message:text', async (ctx) => {
    await ensureUser(ctx.from);
    const text = ctx.message.text;
    const state = pending.get(ctx.chat.id);
    pending.delete(ctx.chat.id);
    const mode = state?.mode || 'note';

    if (mode === 'quote') {
      const m = text.match(/^(.+?)(?:\s*—\s*([^(]+?))?(?:\s*\(([^)]+)\))?$/s);
      await createItem(ctx.from.id, 'quote', {
        body: (m?.[1] || text).trim().replace(/^«|»$/g, ''),
        quote_author: m?.[2]?.trim() || null,
        quote_source: m?.[3]?.trim() || null,
      });
      return ctx.reply('Цитата сохранена ✓');
    }

    if (mode === 'task') {
      const [title, whenPart, prio] = text.split('|').map(s => s.trim());
      await createItem(ctx.from.id, 'task', {
        title, body: '',
        due_at: whenPart ? parseWhen(whenPart) : null,
        priority: ['low', 'medium', 'high'].includes(prio) ? prio : null,
      });
      return ctx.reply('Задача создана ✓');
    }

    if (mode === 'reminder') {
      const when = parseWhen(text);
      if (!when) return ctx.reply('Не понял время. Пример: "полить цветы завтра 09:00"');
      let rule = null;
      if (/каждый день|ежедневно/i.test(text)) rule = 'daily';
      else if (/каждую неделю|еженедельно/i.test(text)) rule = 'weekly';
      else if (/каждый месяц|ежемесячно/i.test(text)) rule = 'monthly';
      else if (/по будням/i.test(text)) rule = 'weekdays';
      const title = text
        .replace(/(?:(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s+)?(\d{1,2}):(\d{2})/, '')
        .replace(/завтра|каждый день|ежедневно|каждую неделю|еженедельно|каждый месяц|ежемесячно|по будням/gi, '')
        .trim();
      await createItem(ctx.from.id, 'reminder', { title, remind_at: when, repeat_rule: rule });
      return ctx.reply(`Напомню: ${when}${rule ? ` (повтор: ${rule})` : ''} ✓`);
    }

    // default: quick note
    await createItem(ctx.from.id, 'note', {
      title: text.split('\n')[0].slice(0, 80),
      body: text,
    });
    await ctx.reply('Заметка сохранена ✓', { reply_markup: mainKb() });
  });

  return bot;
}
