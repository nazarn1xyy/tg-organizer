// ── REST API part 2: folders, tags, search, stats, export, settings ──
import { Router } from 'express';
import { db, ensureUser } from './db.js';
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function metaApi() {
  const r = Router();

  // ── folders ──
  r.get('/folders', async (req, res) => {
    try {
      const rows = await db.all(`SELECT f.*, (SELECT COUNT(*) FROM items i WHERE i.folder_id=f.id AND i.deleted_at IS NULL) AS count FROM folders f WHERE f.user_id=?`, [req.tgUser.id]);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  r.post('/folders', async (req, res) => {
    try {
      await ensureUser(req.tgUser);
      const info = await db.run('INSERT INTO folders (user_id, name, hidden) VALUES (?,?,?)', [req.tgUser.id, String(req.body.name || 'Папка'), req.body.hidden ? 1 : 0]);
      const folder = await db.get('SELECT * FROM folders WHERE id=?', [info.lastInsertRowid]);
      res.json(folder);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  r.patch('/folders/:id', async (req, res) => {
    try {
      const sets = [], vals = [];
      if (req.body.name !== undefined) { sets.push('name=?'); vals.push(req.body.name); }
      if (req.body.hidden !== undefined) { sets.push('hidden=?'); vals.push(req.body.hidden ? 1 : 0); }
      if (sets.length) {
        await db.run(`UPDATE folders SET ${sets.join(',')} WHERE id=? AND user_id=?`, [...vals, Number(req.params.id), req.tgUser.id]);
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  r.delete('/folders/:id', async (req, res) => {
    try {
      await db.run('UPDATE items SET folder_id=NULL WHERE folder_id=? AND user_id=?', [Number(req.params.id), req.tgUser.id]);
      await db.run('DELETE FROM folders WHERE id=? AND user_id=?', [Number(req.params.id), req.tgUser.id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── tags ──
  r.get('/tags', async (req, res) => {
    try {
      const rows = await db.all(`SELECT t.*, (SELECT COUNT(*) FROM item_tags x JOIN items i ON i.id=x.item_id WHERE x.tag_id=t.id AND i.deleted_at IS NULL) AS count FROM tags t WHERE t.user_id=?`, [req.tgUser.id]);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  r.delete('/tags/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM tags WHERE id=? AND user_id=?', [Number(req.params.id), req.tgUser.id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── global search ──
  r.get('/search', async (req, res) => {
    try {
      const uid = req.tgUser.id;
      const rawQ = String(req.query.q || '').trim();
      if (!rawQ) return res.json([]);
      const lowerQ = rawQ.toLowerCase();

      let dateSql = '';
      const params = [uid];
      if (req.query.from) { dateSql += ` AND date(i.created_at) >= ?`; params.push(req.query.from); }
      if (req.query.to) { dateSql += ` AND date(i.created_at) <= ?`; params.push(req.query.to); }

      const rows = await db.all(`SELECT DISTINCT i.* FROM items i
        LEFT JOIN folders f ON f.id=i.folder_id
        WHERE i.user_id=? AND i.deleted_at IS NULL${dateSql}
        ORDER BY i.pinned DESC, i.updated_at DESC LIMIT 500`, params);

      if (!rows.length) return res.json([]);

      const itemIds = rows.map(r => r.id);
      const placeholders = itemIds.map(() => '?').join(',');
      const tagsRows = await db.all(`SELECT x.item_id, t.id, t.name FROM item_tags x JOIN tags t ON t.id=x.tag_id WHERE x.item_id IN (${placeholders})`, itemIds);
      const attachRows = await db.all(`SELECT id, item_id, type, url, name FROM attachments WHERE item_id IN (${placeholders})`, itemIds);

      const tagsByItem = {};
      for (const t of tagsRows) {
        (tagsByItem[t.item_id] = tagsByItem[t.item_id] || []).push({ id: t.id, name: t.name });
      }
      const attachByItem = {};
      for (const a of attachRows) {
        (attachByItem[a.item_id] = attachByItem[a.item_id] || []).push(a);
      }

      const matched = [];
      for (const row of rows) {
        row.tags = tagsByItem[row.id] || [];
        row.attachments = attachByItem[row.id] || [];

        const title = (row.title || '').toLowerCase();
        const body = (row.body || '').toLowerCase();
        const author = (row.quote_author || '').toLowerCase();
        const tagsStr = (row.tags || []).map(t => (t.name || '').toLowerCase()).join(' ');

        if (title.includes(lowerQ) || body.includes(lowerQ) || author.includes(lowerQ) || tagsStr.includes(lowerQ)) {
          matched.push(row);
          if (matched.length >= 100) break;
        }
      }
      res.json(matched);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── calendar: counts per day + items of a day ──
  r.get('/calendar/:month', async (req, res) => { // month = YYYY-MM
    try {
      const m = req.params.month;
      const u = req.tgUser.id;
      const rows = await db.all(`SELECT d AS date, COUNT(*) AS count FROM (
        SELECT date(created_at) d FROM items WHERE user_id=? AND deleted_at IS NULL AND strftime('%Y-%m',created_at)=?
        UNION ALL
        SELECT date(due_at) FROM items WHERE user_id=? AND deleted_at IS NULL AND strftime('%Y-%m',due_at)=?
        UNION ALL
        SELECT date(remind_at) FROM items WHERE user_id=? AND deleted_at IS NULL AND strftime('%Y-%m',remind_at)=?
      ) GROUP BY d`, [u, m, u, m, u, m]);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── stats (single optimized query) ──
  r.get('/stats', async (req, res) => {
    try {
      const uid = req.tgUser.id;
      const s = await db.get(`
        SELECT
          SUM(CASE WHEN kind='note' THEN 1 ELSE 0 END) AS notes,
          SUM(CASE WHEN kind='quote' THEN 1 ELSE 0 END) AS quotes,
          SUM(CASE WHEN kind='task' THEN 1 ELSE 0 END) AS tasks,
          SUM(CASE WHEN kind='task' AND status='done' THEN 1 ELSE 0 END) AS tasks_done,
          SUM(CASE WHEN kind='reminder' AND remind_at IS NOT NULL THEN 1 ELSE 0 END) AS reminders_active,
          SUM(CASE WHEN date(created_at)=date('now','localtime') THEN 1 ELSE 0 END) AS today,
          SUM(CASE WHEN created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) AS week,
          SUM(CASE WHEN created_at >= datetime('now','-30 days') THEN 1 ELSE 0 END) AS month
        FROM items WHERE user_id=? AND deleted_at IS NULL
      `, [uid]) || {};

      const daysRows = await db.all(`SELECT DISTINCT date(created_at) d FROM items WHERE user_id=? ORDER BY d DESC LIMIT 365`, [uid]);
      const days = daysRows.map(r => r.d);
      let streak = 0;
      const today = new Date();
      for (let i = 0; ; i++) {
        const d = new Date(today); d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        if (days.includes(key)) streak++;
        else if (i === 0) continue;
        else break;
      }
      res.json({
        notes: s.notes || 0,
        quotes: s.quotes || 0,
        tasks: s.tasks || 0,
        tasks_done: s.tasks_done || 0,
        reminders_active: s.reminders_active || 0,
        today: s.today || 0,
        week: s.week || 0,
        month: s.month || 0,
        streak,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── settings / PIN ──
  r.get('/settings', async (req, res) => {
    try {
      const u = await ensureUser(req.tgUser);
      res.json({ has_pin: !!u?.pin_hash, autolock_minutes: u?.autolock_minutes,
        quote_of_day: !!u?.quote_of_day, default_section: u?.default_section });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  r.post('/settings', async (req, res) => {
    try {
      const b = req.body || {};
      const u = await ensureUser(req.tgUser);
      if (b.pin !== undefined) {
        await db.run('UPDATE users SET pin_hash=? WHERE id=?', [b.pin ? sha(b.pin) : null, u.id]);
      }
      if (b.autolock_minutes !== undefined) {
        await db.run('UPDATE users SET autolock_minutes=? WHERE id=?', [Number(b.autolock_minutes), u.id]);
      }
      if (b.quote_of_day !== undefined) {
        await db.run('UPDATE users SET quote_of_day=? WHERE id=?', [b.quote_of_day ? 1 : 0, u.id]);
      }
      if (b.default_section !== undefined) {
        await db.run('UPDATE users SET default_section=? WHERE id=?', [String(b.default_section), u.id]);
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  r.post('/pin/verify', async (req, res) => {
    try {
      const u = await ensureUser(req.tgUser);
      res.json({ ok: !!u?.pin_hash && sha(req.body.pin || '') === u.pin_hash });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── export: json | md | txt ──
  r.get('/export', async (req, res) => {
    try {
      const uid = req.tgUser.id;
      const fmt = req.query.format || 'json';
      const rows = await db.all(`SELECT * FROM items WHERE user_id=? AND deleted_at IS NULL ORDER BY kind, created_at`, [uid]);
      if (fmt === 'json') {
        res.setHeader('Content-Disposition', 'attachment; filename=organizer-backup.json');
        return res.json({ exported_at: new Date().toISOString(), items: rows });
      }
      const label = { note: 'Заметка', quote: 'Цитата', task: 'Задача', reminder: 'Напоминание' };
      const lines = rows.map(r => fmt === 'md'
        ? `## ${label[r.kind]}: ${r.title || '(без названия)'}\n\n${r.body || ''}\n\n_создано: ${r.created_at}_\n`
        : `[${label[r.kind]}] ${r.title || ''}\n${r.body || ''}\n(создано: ${r.created_at})\n${'-'.repeat(40)}`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=organizer.${fmt === 'md' ? 'md' : 'txt'}`);
      res.send(lines.join('\n'));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── backup restore ──
  r.post('/import', async (req, res) => {
    try {
      const items = req.body?.items;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'bad backup' });
      await ensureUser(req.tgUser);
      const cols = ['kind','title','body','checklist','quote_author','quote_source','quote_category',
        'due_at','priority','status','remind_at','repeat_rule','repeat_n','repeat_until',
        'nag_minutes','favorite','pinned','archived','created_at','updated_at'];
      let count = 0;
      for (const it of items) {
        if (!['note','quote','task','reminder'].includes(it.kind)) continue;
        await db.run(`INSERT INTO items (user_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`,
          [req.tgUser.id, ...cols.map(c => it[c] ?? null)]);
        count++;
      }
      res.json({ imported: count });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}
