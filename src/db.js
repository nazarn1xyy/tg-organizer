// ── Turso / LibSQL database client (Cloud & Local) ────────────────
import { createClient } from '@libsql/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile?.(); } catch {}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '..', 'data', 'organizer.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

export const client = createClient({ url, authToken });

export const db = {
  client,
  async all(sql, args = []) {
    const res = await client.execute({ sql, args });
    return res.rows;
  },
  async get(sql, args = []) {
    const res = await client.execute({ sql, args });
    return res.rows[0] || null;
  },
  async run(sql, args = []) {
    const res = await client.execute({ sql, args });
    return {
      lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
      rowsAffected: res.rowsAffected,
    };
  },
  async exec(sql) {
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const s of statements) {
      await client.execute(s);
    }
  },
  async batch(stmts) {
    return client.batch(stmts, 'write');
  }
};

// ── Helpers ───────────────────────────────────────────────────────
export async function ensureUser(tgUser) {
  if (!tgUser?.id) return null;
  await db.run(
    `INSERT INTO users (id, first_name, username) VALUES (?,?,?)
     ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, username=excluded.username`,
    [tgUser.id, tgUser.first_name ?? null, tgUser.username ?? null]
  );
  return db.get('SELECT * FROM users WHERE id=?', [tgUser.id]);
}

export async function snapshot(itemId) {
  const it = await db.get('SELECT * FROM items WHERE id=?', [itemId]);
  if (it) {
    await db.run('INSERT INTO item_history (item_id, snapshot) VALUES (?,?)', [itemId, JSON.stringify(it)]);
  }
}

export async function touch(itemId) {
  await db.run(`UPDATE items SET updated_at=datetime('now') WHERE id=?`, [itemId]);
}

export async function setTags(itemId, userId, names = []) {
  await db.run('DELETE FROM item_tags WHERE item_id=?', [itemId]);
  for (const raw of names) {
    const name = String(raw).trim().replace(/^#/, '');
    if (!name) continue;
    await db.run('INSERT OR IGNORE INTO tags (user_id, name) VALUES (?,?)', [userId, name]);
    const tag = await db.get('SELECT id FROM tags WHERE user_id=? AND name=?', [userId, name]);
    if (tag) {
      await db.run('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?,?)', [itemId, tag.id]);
    }
  }
}

export async function getItemFull(id, userId) {
  const it = await db.get('SELECT * FROM items WHERE id=? AND user_id=?', [id, userId]);
  if (!it) return null;
  it.tags = await db.all('SELECT t.id, t.name FROM tags t JOIN item_tags x ON x.tag_id=t.id WHERE x.item_id=?', [id]);
  it.attachments = await db.all('SELECT * FROM attachments WHERE item_id=?', [id]);
  return it;
}
