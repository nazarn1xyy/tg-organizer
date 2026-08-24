// ── End-to-End Verification Test Suite ──────────────────────────
import assert from 'node:assert/strict';

const BASE = 'http://localhost:' + (process.env.PORT || 7890);

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Tg-Init-Data': 'dev',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, headers: res.headers, text, json };
}

async function runTests() {
  console.log('🧪 Starting End-to-End Test Suite for Telegram Web App...\n');

  // 1. Static Assets
  console.log('1. Testing static asset delivery...');
  const index = await req('/');
  assert.equal(index.status, 200);
  assert.ok(index.text.includes('<title>Органайзер</title>'));
  assert.ok(index.text.includes('telegram-web-app.js'));

  const js = await req('/app.js');
  assert.equal(js.status, 200);
  assert.ok(js.text.includes('Telegram Mini App'));

  const css = await req('/app.css');
  assert.equal(css.status, 200);
  assert.ok(css.text.includes('--bg'));

  const glassCss = await req('/glass.css');
  assert.equal(glassCss.status, 200);
  assert.ok(glassCss.text.includes('--glass-shadow'));

  console.log('   ✓ Static assets OK');

  // 2. Folder CRUD
  console.log('2. Testing Folders API...');
  const createFolder = await req('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ name: 'Рабочие проекты' }),
  });
  assert.equal(createFolder.status, 200);
  const folderId = createFolder.json.id;
  assert.ok(folderId > 0);

  const foldersList = await req('/api/folders');
  assert.equal(foldersList.status, 200);
  assert.ok(foldersList.json.some(f => f.id === folderId));
  console.log('   ✓ Folders OK');

  // 3. Item Creation (Note with Markdown, Tags, Folder)
  console.log('3. Testing Note creation & Tags...');
  const note = await req('/api/items', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'note',
      title: 'Встреча по продукту',
      body: 'Обсудить **архитектуру** и _дизайн_',
      tags: ['продукт', 'архитектура'],
      folder_id: folderId,
      pinned: 1,
      favorite: 1,
    }),
  });
  assert.equal(note.status, 200);
  assert.equal(note.json.kind, 'note');
  assert.equal(note.json.tags.length, 2);
  const noteId = note.json.id;
  console.log('   ✓ Note creation OK');

  // 4. Task Creation with Checklist
  console.log('4. Testing Task with Checklist...');
  const task = await req('/api/items', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'task',
      title: 'Подготовить релиз',
      due_at: '2026-08-30 15:00:00',
      priority: 'high',
      checklist: [
        { text: 'Проверить тесты', done: true },
        { text: 'Опубликовать бота', done: false },
      ],
    }),
  });
  assert.equal(task.status, 200);
  assert.equal(task.json.kind, 'task');
  const taskId = task.json.id;

  // Toggle task status
  const taskDone = await req(`/api/items/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  });
  assert.equal(taskDone.status, 200);
  assert.equal(taskDone.json.status, 'done');
  assert.ok(taskDone.json.completed_at);
  console.log('   ✓ Task & Checklist OK');

  // 5. Quote Creation & Random Quote
  console.log('5. Testing Quotes...');
  const quote = await req('/api/items', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'quote',
      body: 'Вдохновение приходит во время труда.',
      quote_author: 'Чайковский',
      quote_category: 'Творчество',
    }),
  });
  assert.equal(quote.status, 200);

  const randQuote = await req('/api/quotes/random');
  assert.equal(randQuote.status, 200);
  assert.ok(randQuote.json.body);
  console.log('   ✓ Quotes OK');

  // 6. Reminder Creation
  console.log('6. Testing Reminders...');
  const reminder = await req('/api/items', {
    method: 'POST',
    body: JSON.stringify({
      kind: 'reminder',
      title: 'Сделать зарядку',
      remind_at: '2026-08-24 19:00:00',
      repeat_rule: 'daily',
      nag_minutes: 10,
    }),
  });
  assert.equal(reminder.status, 200);
  console.log('   ✓ Reminders OK');

  // 7. Search (Case-insensitive Cyrillic & Tag)
  console.log('7. Testing Search...');
  const searchAuthor = await req('/api/search?q=' + encodeURIComponent('чайковский'));
  assert.equal(searchAuthor.status, 200);
  assert.ok(searchAuthor.json.length >= 1);
  assert.equal(searchAuthor.json[0].quote_author, 'Чайковский');

  const searchTag = await req('/api/search?q=' + encodeURIComponent('продукт'));
  assert.equal(searchTag.status, 200);
  assert.ok(searchTag.json.length >= 1);
  console.log('   ✓ Search OK');

  // 8. Calendar
  console.log('8. Testing Calendar aggregation...');
  const cal = await req('/api/calendar/2026-08');
  assert.equal(cal.status, 200);
  assert.ok(Array.isArray(cal.json));
  assert.ok(cal.json.some(d => d.count > 0));
  console.log('   ✓ Calendar OK');

  // 9. Stats
  console.log('9. Testing Stats...');
  const stats = await req('/api/stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.json.notes >= 1);
  assert.ok(stats.json.tasks >= 1);
  assert.ok(stats.json.quotes >= 1);
  assert.ok(stats.json.reminders_active >= 1);
  console.log('   ✓ Stats OK');

  // 10. History & Revert
  console.log('10. Testing Version History...');
  await req(`/api/items/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'Обновленный заголовок' }),
  });
  const noteWithHist = await req(`/api/items/${noteId}`);
  assert.ok(noteWithHist.json.history.length >= 1);
  const histId = noteWithHist.json.history[0].id;

  const reverted = await req(`/api/items/${noteId}/revert/${histId}`, { method: 'POST' });
  assert.equal(reverted.status, 200);
  assert.equal(reverted.json.title, 'Встреча по продукту');
  console.log('   ✓ History Revert OK');

  // 11. Duplicate
  console.log('11. Testing Item Duplication...');
  const dup = await req(`/api/items/${noteId}/duplicate`, { method: 'POST' });
  assert.equal(dup.status, 200);
  assert.notEqual(dup.json.id, noteId);
  assert.equal(dup.json.title, 'Встреча по продукту');
  console.log('   ✓ Duplication OK');

  // 12. Trash, Restore, and Hard Delete
  console.log('12. Testing Trash Lifecycle...');
  await req(`/api/items/${dup.json.id}`, { method: 'DELETE' });
  const inTrash = await req('/api/items?trash=1');
  assert.ok(inTrash.json.some(i => i.id === dup.json.id));

  await req(`/api/items/${dup.json.id}/restore`, { method: 'POST' });
  const restored = await req(`/api/items/${dup.json.id}`);
  assert.equal(restored.json.deleted_at, null);

  await req(`/api/items/${dup.json.id}?hard=1`, { method: 'DELETE' });
  const gone = await req(`/api/items/${dup.json.id}`);
  assert.equal(gone.status, 404);
  console.log('   ✓ Trash & Hard Delete OK');

  // 13. PIN Security
  console.log('13. Testing PIN Security...');
  await req('/api/settings', { method: 'POST', body: JSON.stringify({ pin: '4321', autolock_minutes: 5 }) });
  const pinOk = await req('/api/pin/verify', { method: 'POST', body: JSON.stringify({ pin: '4321' }) });
  assert.equal(pinOk.json.ok, true);
  const pinBad = await req('/api/pin/verify', { method: 'POST', body: JSON.stringify({ pin: '9999' }) });
  assert.equal(pinBad.json.ok, false);
  // Clear PIN
  await req('/api/settings', { method: 'POST', body: JSON.stringify({ pin: '' }) });
  console.log('   ✓ PIN Security OK');

  // 14. Export & Import
  console.log('14. Testing Export & Import...');
  const exportJson = await req('/api/export?format=json');
  assert.equal(exportJson.status, 200);
  assert.ok(exportJson.json.items.length > 0);

  const exportMd = await req('/api/export?format=md');
  assert.equal(exportMd.status, 200);
  assert.ok(exportMd.text.includes('## '));

  const exportTxt = await req('/api/export?format=txt');
  assert.equal(exportTxt.status, 200);
  assert.ok(exportTxt.text.includes('---'));

  const importRes = await req('/api/import', {
    method: 'POST',
    body: JSON.stringify({
      items: [
        { kind: 'note', title: 'Импортированная заметка', body: 'Тестовый импорт' },
      ],
    }),
  });
  assert.equal(importRes.status, 200);
  assert.equal(importRes.json.imported, 1);
  console.log('   ✓ Export & Import OK');

  console.log('\n🎉 ALL 14 TEST SUITES PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
