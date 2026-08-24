// ── REST API for the Mini App (items CRUD) ───────────────────────
import { Router } from 'express';
import { db, ensureUser, setTags, snapshot, touch, getItemFull } from './db.js';

export function itemsApi() {
  const r = Router();

  // list items: ?kind=&folder_id=&tag_ids=1,2&favorite=1&archived=1&trash=1&pinned_first=1
  r.get('/items', async (req, res) => {
    try {
      const uid = req.tgUser.id;
      const q = req.query;
      const where = ['i.user_id = ?'];
      const args = [uid];

      if (q.trash === '1') where.push('i.deleted_at IS NOT NULL');
      else {
        where.push('i.deleted_at IS NULL');
        where.push(q.archived === '1' ? 'i.archived = 1' : 'i.archived = 0');
      }
      if (q.kind) { where.push('i.kind = ?'); args.push(q.kind); }
      if (q.folder_id) { where.push('i.folder_id = ?'); args.push(Number(q.folder_id)); }
      if (q.favorite === '1') where.push('i.favorite = 1');
      if (q.category) { where.push('i.quote_category = ?'); args.push(q.category); }
      if (q.date) { where.push(`(date(i.created_at)=? OR date(i.due_at)=? OR date(i.remind_at)=?)`); args.push(q.date, q.date, q.date); }

      let sql = `SELECT DISTINCT i.* FROM items i`;
      if (q.tag_ids) {
        const ids = q.tag_ids.split(',').map(Number).filter(Boolean);
        if (ids.length) {
          where.push(`i.id IN (SELECT item_id FROM item_tags WHERE tag_id IN (${ids.map(() => '?').join(',')})
            GROUP BY item_id HAVING COUNT(DISTINCT tag_id) = ${ids.length})`);
          args.push(...ids);
        }
      }
      sql += ` WHERE ${where.join(' AND ')} ORDER BY i.pinned DESC, i.updated_at DESC LIMIT 500`;
      const rows = await db.all(sql, args);

      if (rows.length) {
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

        for (const row of rows) {
          row.tags = tagsByItem[row.id] || [];
          row.attachments = attachByItem[row.id] || [];
        }
      }
      res.json(rows);
    } catch (e) {
      console.error('API /items error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  r.get('/items/:id', async (req, res) => {
    try {
      const it = await getItemFull(Number(req.params.id), req.tgUser.id);
      if (!it) return res.status(404).json({ error: 'not found' });
      it.history = await db.all('SELECT id, changed_at FROM item_history WHERE item_id=? ORDER BY id DESC LIMIT 20', [it.id]);
      res.json(it);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  const FIELDS = ['title','body','checklist','quote_author','quote_source','quote_category',
    'due_at','priority','status','remind_at','repeat_rule','repeat_n','repeat_until',
    'nag_minutes','folder_id','favorite','pinned','archived','hidden'];

  r.post('/items', async (req, res) => {
    try {
      await ensureUser(req.tgUser);
      const b = req.body || {};
      if (!['note','quote','task','reminder'].includes(b.kind))
        return res.status(400).json({ error: 'bad kind' });
      const cols = ['user_id','kind'], vals = [req.tgUser.id, b.kind];
      for (const f of FIELDS) {
        if (b[f] !== undefined) {
          cols.push(f);
          let val = b[f];
          if (f === 'checklist' && typeof val === 'object' && val !== null) {
            val = JSON.stringify(val);
          }
          vals.push(val);
        }
      }
      const info = await db.run(`INSERT INTO items (${cols.join(',')})
        VALUES (${cols.map(() => '?').join(',')})`, vals);
      const id = info.lastInsertRowid;
      if (Array.isArray(b.tags)) await setTags(id, req.tgUser.id, b.tags);
      if (Array.isArray(b.links)) {
        for (const url of b.links) {
          await db.run(`INSERT INTO attachments (item_id, type, url) VALUES (?,'link',?)`, [id, url]);
        }
      }
      const full = await getItemFull(id, req.tgUser.id);
      res.json(full);
    } catch (e) {
      console.error('POST /items error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  r.patch('/items/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const it = await db.get('SELECT id FROM items WHERE id=? AND user_id=?', [id, req.tgUser.id]);
      if (!it) return res.status(404).json({ error: 'not found' });
      await snapshot(id);
      const b = req.body || {};
      const sets = [], vals = [];
      for (const f of FIELDS) {
        if (b[f] !== undefined) {
          sets.push(`${f}=?`);
          let val = b[f];
          if (f === 'checklist' && typeof val === 'object' && val !== null) {
            val = JSON.stringify(val);
          }
          vals.push(val);
        }
      }
      if (b.status === 'done') { sets.push(`completed_at=datetime('now')`); }
      else if (b.status === 'open') { sets.push(`completed_at=NULL`); }
      if (sets.length) {
        await db.run(`UPDATE items SET ${sets.join(',')} WHERE id=?`, [...vals, id]);
      }
      if (Array.isArray(b.tags)) await setTags(id, req.tgUser.id, b.tags);
      await touch(id);
      const full = await getItemFull(id, req.tgUser.id);
      res.json(full);
    } catch (e) {
      console.error('PATCH /items error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // trash / restore / hard delete / empty trash
  r.delete('/trash', async (req, res) => {
    try {
      await db.run('DELETE FROM items WHERE user_id=? AND deleted_at IS NOT NULL', [req.tgUser.id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  r.delete('/items/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (req.query.hard === '1') {
        await db.run('DELETE FROM items WHERE id=? AND user_id=?', [id, req.tgUser.id]);
      } else {
        await snapshot(id);
        await db.run(`UPDATE items SET deleted_at=datetime('now') WHERE id=? AND user_id=?`, [id, req.tgUser.id]);
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  r.post('/items/:id/restore', async (req, res) => {
    try {
      await db.run('UPDATE items SET deleted_at=NULL WHERE id=? AND user_id=?', [Number(req.params.id), req.tgUser.id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  r.post('/items/:id/duplicate', async (req, res) => {
    try {
      const it = await db.get('SELECT * FROM items WHERE id=? AND user_id=?', [Number(req.params.id), req.tgUser.id]);
      if (!it) return res.status(404).json({ error: 'not found' });
      const { id, created_at, updated_at, deleted_at, ...rest } = it;
      const cols = Object.keys(rest);
      const info = await db.run(`INSERT INTO items (${cols.join(',')})
        VALUES (${cols.map(() => '?').join(',')})`, Object.values(rest));
      const full = await getItemFull(info.lastInsertRowid, req.tgUser.id);
      res.json(full);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // restore an earlier version from history
  r.post('/items/:id/revert/:histId', async (req, res) => {
    try {
      const h = await db.get('SELECT * FROM item_history WHERE id=? AND item_id=?', [Number(req.params.histId), Number(req.params.id)]);
      if (!h) return res.status(404).json({ error: 'not found' });
      await snapshot(Number(req.params.id));
      const snap = JSON.parse(h.snapshot);
      await db.run(`UPDATE items SET title=?, body=?, checklist=? WHERE id=? AND user_id=?`,
        [snap.title, snap.body, snap.checklist, Number(req.params.id), req.tgUser.id]);
      await touch(Number(req.params.id));
      const full = await getItemFull(Number(req.params.id), req.tgUser.id);
      res.json(full);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  r.get('/quotes/random', async (req, res) => {
    try {
      const q = await db.get(`SELECT * FROM items WHERE user_id=? AND kind='quote' AND deleted_at IS NULL ORDER BY RANDOM() LIMIT 1`, [req.tgUser.id]);
      res.json(q || null);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return r;
}
