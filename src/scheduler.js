// ── Reminder scheduler: fires due reminders via the bot ──────────
import { db, snapshot, touch } from './db.js';

function nextOccurrence(item) {
  if (!item.remind_at) return null;
  const iso = item.remind_at.includes('T') ? item.remind_at : item.remind_at.replace(' ', 'T');
  const cur = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  if (isNaN(cur.getTime())) return null;
  const rule = item.repeat_rule;
  if (!rule || rule === 'none') return null;
  const d = new Date(cur);
  if (rule === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (rule === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (rule === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (rule === 'every_n') d.setUTCDate(d.getUTCDate() + Math.max(1, item.repeat_n || 1));
  else if (rule === 'weekdays') {
    do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  } else return null;
  if (item.repeat_until) {
    const untilIso = item.repeat_until.includes('T') ? item.repeat_until : item.repeat_until.replace(' ', 'T');
    if (d > new Date(untilIso + (untilIso.endsWith('Z') ? '' : 'Z'))) return null;
  }
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function fire(bot, item) {
  const when = item.due_at || item.remind_at;
  try {
    await bot.api.sendMessage(item.user_id,
      `🔔 <b>Напоминание</b>\n\n${item.title || item.body || 'Без названия'}` +
      (item.body && item.title ? `\n${item.body}` : ''),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✓ Выполнено', callback_data: `ack:${item.id}` },
            { text: 'Отложить 15м', callback_data: `snooze:${item.id}:15` },
            { text: '1ч', callback_data: `snooze:${item.id}:60` },
          ]],
        },
      });
  } catch (e) {
    console.error('notify failed', item.id, e.message);
  }

  await snapshot(item.id);
  const next = nextOccurrence(item);
  if (next) {
    await db.run('UPDATE items SET remind_at=?, acked=0 WHERE id=?', [next, item.id]);
  } else if (item.nag_minutes && !item.acked) {
    // re-notify until acknowledged
    const nag = new Date(Date.now() + item.nag_minutes * 60000)
      .toISOString().slice(0, 19).replace('T', ' ');
    await db.run('UPDATE items SET remind_at=? WHERE id=?', [nag, item.id]);
  } else {
    await db.run('UPDATE items SET remind_at=NULL WHERE id=?', [item.id]);
  }
  await touch(item.id);
}

export function startScheduler(bot) {
  setInterval(async () => {
    try {
      const due = await db.all(`SELECT * FROM items
        WHERE kind='reminder' AND deleted_at IS NULL AND archived=0
          AND remind_at IS NOT NULL AND remind_at <= datetime('now')`);
      for (const item of due) await fire(bot, item);
    } catch (e) {
      console.error('Scheduler error:', e);
    }
  }, 30_000);

  // Quote of the day — 09:00 UTC once per day
  let lastQuoteDay = null;
  setInterval(async () => {
    try {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      if (now.getUTCHours() !== 9 || lastQuoteDay === day) return;
      lastQuoteDay = day;
      const users = await db.all('SELECT id FROM users WHERE quote_of_day=1');
      for (const u of users) {
        const q = await db.get(`SELECT * FROM items WHERE user_id=? AND kind='quote'
          AND deleted_at IS NULL ORDER BY RANDOM() LIMIT 1`, [u.id]);
        if (!q) continue;
        try {
          await bot.api.sendMessage(u.id,
            `💬 <b>Цитата дня</b>\n\n«${q.body}»${q.quote_author ? `\n— ${q.quote_author}` : ''}`,
            { parse_mode: 'HTML' });
        } catch { /* user blocked bot */ }
      }
    } catch (e) {
      console.error('Daily quote error:', e);
    }
  }, 60_000);
}
