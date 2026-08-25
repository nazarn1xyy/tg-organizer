/* ══ Telegram Mini App — Личный Органайзер (Liquid Glass UI) ═══════ */
'use strict';

const tg = window.Telegram?.WebApp || {
  ready: () => {},
  expand: () => {},
  initData: 'dev',
  initDataUnsafe: { user: { id: 1, first_name: 'Пользователь', username: 'developer' } },
  HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} },
  BackButton: { show: () => {}, hide: () => {}, onClick: () => {} },
};

if (!tg.initData) tg.initData = 'dev';

try {
  tg.ready?.();
  tg.expand?.();
  if (typeof tg.disableVerticalSwipes === 'function') {
    tg.disableVerticalSwipes();
  }
  if (typeof tg.isVerticalSwipesEnabled !== 'undefined') {
    tg.isVerticalSwipesEnabled = false;
  }
  if (tg.requestFullscreen && ['ios', 'android'].includes(tg.platform)) {
    try { tg.requestFullscreen(); } catch {}
  }
  tg.setHeaderColor?.('#0d0d0f');
  tg.setBackgroundColor?.('#0d0d0f');
} catch (e) {}

// Safe area handling
function applySafeArea() {
  const sa = tg.safeAreaInset || {};
  const ca = tg.contentSafeAreaInset || {};
  const top = (sa.top || 0) + (ca.top || 0);
  const bottom = sa.bottom || 0;
  if (top) document.documentElement.style.setProperty('--safe-top', top + 'px');
  if (bottom) document.documentElement.style.setProperty('--safe-bottom', bottom + 'px');
}
applySafeArea();
tg.onEvent?.('safeAreaChanged', applySafeArea);
tg.onEvent?.('contentSafeAreaChanged', applySafeArea);
tg.onEvent?.('viewportChanged', applySafeArea);

const haptic = (t = 'light') => {
  try { tg.HapticFeedback?.impactOccurred?.(t); } catch {}
};
const hapticNotif = (t = 'success') => {
  try { tg.HapticFeedback?.notificationOccurred?.(t); } catch {}
};

/* ── Toast notification ─────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, duration = 2500) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

/* ── API client with request deduplication ──────────────────── */
const _inflightRequests = new Map();

async function api(path, opts = {}) {
  // Dedup concurrent identical GET requests
  const method = opts.method || 'GET';
  const cacheKey = method === 'GET' ? `GET:${path}` : null;

  if (cacheKey && _inflightRequests.has(cacheKey)) {
    return _inflightRequests.get(cacheKey);
  }

  const currentInitData = window.Telegram?.WebApp?.initData || tg.initData || 'dev';

  const promise = (async () => {
    const res = await fetch('/api' + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'X-Tg-Init-Data': currentInitData,
        'Accept-Encoding': 'gzip',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText || res.status);
    }
    return res.json();
  })();

  if (cacheKey) {
    _inflightRequests.set(cacheKey, promise);
    promise.finally(() => _inflightRequests.delete(cacheKey));
  }

  return promise;
}
const GET = (p) => api(p);
const POST = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b) });
const PATCH = (p, b) => api(p, { method: 'PATCH', body: JSON.stringify(b) });
const DEL = (p) => api(p, { method: 'DELETE' });

/* ── Tiny DOM & Formatting Helpers ──────────────────────────── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Cached date formatting (avoids repeated Intl object creation) ──
const _dateCache = new Map();
const _maxDateCache = 200;

const fmtDate = (iso) => {
  if (!iso) return '';
  if (_dateCache.has(iso)) return _dateCache.get(iso);
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return iso;
  const result = d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (_dateCache.size >= _maxDateCache) _dateCache.clear();
  _dateCache.set(iso, result);
  return result;
};

const toInputDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ── Minimal markdown (safe) ────────────────────────────────── */
function md(text) {
  let h = esc(text);
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
       .replace(/_(.+?)_/g, '<i>$1</i>')
       .replace(/`(.+?)`/g, '<code>$1</code>')
       .replace(/^### (.+)$/gm, '<div style="font-weight:700;margin-top:6px">$1</div>')
       .replace(/^## (.+)$/gm, '<div style="font-weight:700;font-size:16px;margin-top:8px">$1</div>')
       .replace(/^# (.+)$/gm, '<div style="font-weight:800;font-size:18px;margin-top:10px">$1</div>')
       .replace(/\n/g, '<br>');
  return h;
}

/* ── Icons (mono SVG) ───────────────────────────────────────── */
const IC = {
  note: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h11l3 3v15H5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
  quote: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7h4v4a4 4 0 0 1-4 4V7zM15 7h4v4a4 4 0 0 1-4 4V7z" transform="translate(0 1)"/></svg>',
  task: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  reminder: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a6 6 0 0 1 6 6c0 5 2 6 2 6H4s2-1 2-6a6 6 0 0 1 6-6zM10 19a2 2 0 0 0 4 0"/></svg>',
  favorite: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.3 7.2 18.9l.9-5.4L4.2 9.7l5.4-.8z"/></svg>',
  folder: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>',
  tag: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 12 9-9h9v9l-9 9z"/><circle cx="16.5" cy="7.5" r="1.2"/></svg>',
  trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 17v5M6 11l1-7h10l1 7-3 2v2H9v-2z"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.3 7.2 18.9l.9-5.4L4.2 9.7l5.4-.8z"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d0d0f" stroke-width="3"><path d="m5 12 5 5 9-10"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>',
  clip: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L16 7"/></svg>',
  archive: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h18v5H3zM5 9v11h14V9M10 13h4"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  lock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  bot: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h0M16 16h0"/></svg>',
  data: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  download: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  upload: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  fire: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff9500" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  calendarSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  chartSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  monthSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>',
  noteSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  quoteSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  checkSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  bellSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffd60a" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h24s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  backspace: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>',
};

/* ── Navigation between pages ───────────────────────────────── */
const navItems = $$('.nav-item');
function movePill(btn) {
  const pill = $('#navPill');
  if (pill && btn) pill.style.transform = `translateX(${btn.offsetLeft - 6}px)`;
}
navItems.forEach((btn) => btn.addEventListener('click', () => {
  haptic();
  navItems.forEach((b) => b.classList.toggle('active', b === btn));
  $$('.page').forEach((p) =>
    p.classList.toggle('active', p.id === 'page-' + btn.dataset.page));
  movePill(btn);
  if (btn.dataset.page === 'profile') renderProfile();
  if (btn.dataset.page === 'settings') renderSettings();
  if (btn.dataset.page === 'home') refreshHome();
}));
requestAnimationFrame(() => movePill(navItems[0]));

/* ── Sheet (bottom modal) ───────────────────────────────────── */
const sheet = $('#sheet'), sheetBack = $('#sheetBack');
function openSheet(html) {
  sheet.innerHTML = '<div class="grab"></div>' + html;
  sheet.classList.add('open');
  sheetBack.classList.add('open');
  document.body.classList.add('sheet-open');
  haptic('medium');
}
function closeSheet() {
  sheet.classList.remove('open');
  sheetBack.classList.remove('open');
  document.body.classList.remove('sheet-open');
}
sheetBack.addEventListener('click', closeSheet);

/* ── Segmented control helper ───────────────────────────────── */
function initSeg(el, onChange) {
  if (!el) return;
  let ind = el.querySelector('.seg-ind');
  if (!ind) {
    ind = document.createElement('div');
    ind.className = 'seg-ind glass-indicator';
    el.prepend(ind);
  }
  const btns = $$('button', el);
  const move = (b) => {
    if (!b) return;
    ind.style.left = b.offsetLeft + 'px';
    ind.style.width = b.offsetWidth + 'px';
  };
  btns.forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    haptic();
    btns.forEach((x) => x.classList.toggle('on', x === b));
    move(b);
    onChange?.(b.dataset.val);
  }));
  requestAnimationFrame(() => move(el.querySelector('button.on') || btns[0]));
}

/* ── Global Search with Debounce ────────────────────────────── */
const searchInp = $('#searchInp');
const searchResults = $('#searchResults');
const homeMain = $('#homeMain');
const secView = $('#sectionView');
let searchDebounce = null;

searchInp?.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInp.value.trim();
  if (!q) {
    searchResults.innerHTML = '';
    searchResults.style.display = 'none';
    if (secView.style.display !== 'block') homeMain.style.display = 'block';
    return;
  }
  searchDebounce = setTimeout(async () => {
    try {
      const items = await GET(`/search?q=${encodeURIComponent(q)}`);
      homeMain.style.display = 'none';
      searchResults.style.display = 'block';
      searchResults.innerHTML = `
        <div class="h2" style="margin-top:4px">Найдено: ${items.length}</div>
        ${items.length ? items.map(itemRow).join('') : '<div class="empty">Ничего не найдено</div>'}`;
      bindItemRows(searchResults, { onUpdate: () => searchInp.dispatchEvent(new Event('input')) });
    } catch (e) {
      console.error(e);
    }
  }, 150); // faster debounce
});

/* ── HOME: sections grid ────────────────────────────────────── */
const SECTIONS = [
  { key: 'note', name: 'Заметки', icon: IC.note },
  { key: 'quote', name: 'Цитаты', icon: IC.quote },
  { key: 'task', name: 'Задачи', icon: IC.task },
  { key: 'reminder', name: 'Напоминания', icon: IC.reminder },
  { key: 'favorite', name: 'Избранное', icon: IC.favorite },
  { key: 'folders', name: 'Папки', icon: IC.folder },
  { key: 'tags', name: 'Теги', icon: IC.tag },
  { key: 'trash', name: 'Корзина', icon: IC.trash },
];

let _lastStatsCounts = {};

function renderSectionTiles(counts = _lastStatsCounts) {
  const el = $('#sections');
  if (!el) return;
  _lastStatsCounts = counts;
  el.innerHTML = SECTIONS.map((s) => `
    <div class="tile glass" data-sec="${s.key}">
      ${s.icon}
      <div class="t-name">${s.name}</div>
      <div class="t-count">${counts[s.key] !== undefined && counts[s.key] !== null ? counts[s.key] : '—'}</div>
    </div>`).join('');
}

// ── Parallel data loading for home screen ──
let _lastCalMonth = null;

async function refreshHome(retryCount = 0) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  try {
    // Fire stats and calendar requests in parallel
    const [stats] = await Promise.all([
      GET('/stats'),
      // Only re-fetch calendar data if month changed
      _lastCalMonth !== currentMonth
        ? GET(`/calendar/${currentMonth}`).then(counts => {
            _calendarCountsCache = {};
            (counts || []).forEach((c) => _calendarCountsCache[c.date] = c.count);
            _lastCalMonth = currentMonth;
          })
        : Promise.resolve(),
    ]);

    if (stats) {
      const counts = {
        note: stats.notes,
        quote: stats.quotes,
        task: stats.tasks,
        reminder: stats.reminders_active,
      };
      renderSectionTiles(counts);
    }
  } catch (e) {
    console.error('refreshHome error:', e);
    // Auto-retry up to 3 times if initial request failed
    if (retryCount < 3) {
      setTimeout(() => refreshHome(retryCount + 1), (retryCount + 1) * 300);
    }
  }
  renderCalendar();
}

function _handleSectionClick(e) {
  const tile = e.target.closest('[data-sec]');
  if (tile) openSection(tile.dataset.sec);
}

// Calendar counts cache (populated by refreshHome)
let _calendarCountsCache = {};

/* ── Item row renderer (uses DocumentFragment for performance) ── */
function itemRow(it) {
  const flags = [
    it.pinned ? IC.pin : '',
    it.favorite ? IC.star : '',
    it.attachments?.length ? IC.clip : '',
  ].filter(Boolean).join(' ');
  const meta = [];
  if (it.kind === 'task' && it.due_at) meta.push('до ' + fmtDate(it.due_at));
  if (it.kind === 'reminder' && it.remind_at) meta.push(IC.bellSmall + ' ' + fmtDate(it.remind_at));
  if (it.kind === 'quote' && it.quote_author) meta.push('— ' + esc(it.quote_author));
  if (it.priority) meta.push({ low: 'низкий', medium: 'средний', high: 'высокий' }[it.priority]);
  meta.push(fmtDate(it.updated_at));
  (it.tags || []).forEach((t) => meta.push('#' + esc(t.name)));
  const check = it.kind === 'task'
    ? `<div class="check ${it.status === 'done' ? 'on' : ''}" data-check="${it.id}">${IC.check}</div>` : '';
  return `
    <div class="card glass item ${it.status === 'done' ? 'done' : ''}" data-item="${it.id}">
      ${check}
      <div class="i-body">
        <div class="i-title">${esc(it.title) || esc((it.body || '').slice(0, 60)) || 'Без названия'}</div>
        ${it.kind === 'quote' ? `<div class="i-text">«${esc(it.body)}»</div>`
          : it.body && it.title ? `<div class="i-text">${esc(it.body)}</div>` : ''}
        <div class="i-meta">${meta.map((m) => `<span style="display:inline-flex;align-items:center;gap:3px">${m}</span>`).join('')}</div>
      </div>
      ${flags ? `<div class="i-flag">${flags}</div>` : ''}
    </div>`;
}

/* ── Event delegation for item rows ─────────────────────────── */
function bindItemRows(container, opts = {}) {
  // Use single delegated listener instead of per-element listeners
  container.removeEventListener('click', container._delegatedHandler);
  container._delegatedHandler = async (e) => {
    // Handle checkbox clicks
    const checkEl = e.target.closest('[data-check]');
    if (checkEl) {
      e.stopPropagation();
      haptic('medium');
      const id = checkEl.dataset.check;
      const done = !checkEl.classList.contains('on');
      checkEl.classList.toggle('on', done);
      checkEl.closest('.item')?.classList.toggle('done', done);
      try {
        await PATCH(`/items/${id}`, { status: done ? 'done' : 'open' });
        opts.onUpdate?.();
      } catch (err) {
        showToast('Ошибка обновления задачи');
      }
      return;
    }
    // Handle item card clicks
    const itemEl = e.target.closest('[data-item]');
    if (itemEl) {
      openItemSheet(Number(itemEl.dataset.item), opts);
    }
  };
  container.addEventListener('click', container._delegatedHandler);
}

/* ── Section drill-down view ────────────────────────────────── */
function showSectionView(title, bodyHtml) {
  homeMain.style.display = 'none';
  if (searchResults) searchResults.style.display = 'none';
  secView.style.display = 'block';
  secView.innerHTML = `
    <div class="subhead">
      <button id="backBtn">${IC.back}</button>
      <div class="sh-title">${title}</div>
    </div>
    <div id="secBody">${bodyHtml}</div>`;
  $('#backBtn').addEventListener('click', () => {
    haptic();
    secView.style.display = 'none';
    homeMain.style.display = 'block';
    refreshHome();
  });
  tg.BackButton?.show();
  tg.BackButton?.onClick(() => { $('#backBtn')?.click(); tg.BackButton.hide(); });
}

async function openSection(key, extra = {}) {
  haptic();
  const name = SECTIONS.find((s) => s.key === key)?.name || key;

  if (key === 'folders') return renderFolders();
  if (key === 'tags') return renderTags();

  let qs = '';
  if (key === 'trash') qs = '?trash=1';
  else if (key === 'favorite') qs = '?favorite=1';
  else qs = `?kind=${key}`;
  if (extra.folder_id) qs += `&folder_id=${extra.folder_id}`;
  if (extra.tag_ids) qs += `&tag_ids=${extra.tag_ids}`;
  if (extra.archived) qs += `&archived=1`;

  const items = await GET('/items' + qs);
  let controls = '';
  if (key === 'trash') {
    controls = `<div class="row-btns" style="margin-bottom:10px">
      <button class="btn danger" id="emptyTrashBtn">Очистить корзину</button>
    </div>`;
  } else if (key === 'quote') {
    controls = `<div class="row-btns" style="margin-bottom:10px">
      <button class="btn ghost" id="randomQ">Случайная цитата</button>
    </div>`;
  }
  if (['note', 'task'].includes(key) && !extra.archived) {
    controls += `<div style="text-align:right;margin-bottom:8px">
      <span class="chip" id="showArch">Архив</span></div>`;
  }
  showSectionView(extra.title || name, controls +
    (items.length ? items.map(itemRow).join('') : '<div class="empty">Пусто</div>'));
  bindItemRows($('#secBody'), { onUpdate: () => openSection(key, extra), back: () => openSection(key, extra) });

  $('#emptyTrashBtn')?.addEventListener('click', async () => {
    if (confirm('Очистить корзину полностью?')) {
      await DEL('/trash');
      showToast('Корзина очищена');
      openSection('trash');
    }
  });

  $('#randomQ')?.addEventListener('click', async () => {
    const q = await GET('/quotes/random');
    if (q) openSheet(`<div class="s-title">Случайная цитата</div>
      <div class="card glass"><div style="font-size:16px;line-height:1.5">«${esc(q.body)}»</div>
      ${q.quote_author ? `<div style="color:var(--text-2);margin-top:8px">— ${esc(q.quote_author)}</div>` : ''}</div>
      <button class="btn ghost" onclick="document.getElementById('sheet').classList.remove('open');document.getElementById('sheetBack').classList.remove('open')">Закрыть</button>`);
    else showToast('Нет цитат');
  });
  $('#showArch')?.addEventListener('click', () =>
    openSection(key, { ...extra, archived: 1, title: name + ' · Архив' }));
}

/* ── Folders ────────────────────────────────────────────────── */
async function renderFolders() {
  const folders = await GET('/folders');
  showSectionView('Папки', `
    <button class="btn ghost" id="newFolder" style="margin-bottom:10px">${IC.plus} Новая папка</button>
    ${folders.map((f) => `
      <div class="card glass item" data-folder="${f.id}">
        <div style="opacity:.7">${IC.folder}</div>
        <div class="i-body"><div class="i-title">${esc(f.name)}${f.hidden ? ' · скрыта' : ''}</div>
        <div class="i-meta"><span>${f.count} записей</span></div></div>
      </div>`).join('') || '<div class="empty">Нет папок</div>'}`);
  $('#newFolder').addEventListener('click', () => {
    openSheet(`<div class="s-title">Новая папка</div>
      <div class="field"><input class="inp glass" id="fName" placeholder="Название папки"></div>
      <button class="btn" id="fSave">Создать</button>`);
    $('#fSave').addEventListener('click', async () => {
      const name = $('#fName').value.trim();
      if (!name) return;
      await POST('/folders', { name });
      closeSheet(); renderFolders();
    });
  });
  $$('[data-folder]').forEach((el) =>
    el.addEventListener('click', async () => {
      const f = folders.find((x) => x.id === Number(el.dataset.folder));
      const items = await GET(`/items?folder_id=${f.id}`);
      showSectionView(f.name, `
        <div class="row-btns" style="margin-bottom:10px">
          <button class="btn ghost" id="fRename">Переименовать</button>
          <button class="btn ghost" id="fHide">${f.hidden ? 'Показать' : 'Скрыть'}</button>
          <button class="btn danger" id="fDel">Удалить</button>
        </div>
        ${items.map(itemRow).join('') || '<div class="empty">Пусто в папке</div>'}`);
      bindItemRows($('#secBody'), { onUpdate: () => renderFolders() });
      $('#fRename').addEventListener('click', async () => {
        const name = prompt('Новое название папки:', f.name);
        if (name) { await PATCH(`/folders/${f.id}`, { name }); renderFolders(); }
      });
      $('#fHide').addEventListener('click', async () => {
        await PATCH(`/folders/${f.id}`, { hidden: !f.hidden }); renderFolders();
      });
      $('#fDel').addEventListener('click', async () => {
        if (confirm(`Удалить папку "${f.name}"? Записи останутся без папки.`)) {
          await DEL(`/folders/${f.id}`); renderFolders();
        }
      });
    }));
}

/* ── Tags (multi-select filter) ─────────────────────────────── */
async function renderTags() {
  const tags = await GET('/tags');
  const sel = new Set();
  showSectionView('Теги', `
    <div id="tagCloud" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      ${tags.map((t) => `<span class="chip glass" data-tag="${t.id}">#${esc(t.name)} · ${t.count}</span>`).join('')
        || '<div class="empty">Нет тегов</div>'}
    </div>
    <div id="tagItems"></div>`);
  $$('[data-tag]').forEach((ch) =>
    ch.addEventListener('click', async () => {
      haptic();
      const id = Number(ch.dataset.tag);
      sel.has(id) ? sel.delete(id) : sel.add(id);
      ch.classList.toggle('on', sel.has(id));
      if (!sel.size) return ($('#tagItems').innerHTML = '');
      const items = await GET(`/items?tag_ids=${[...sel].join(',')}`);
      $('#tagItems').innerHTML = items.map(itemRow).join('') || '<div class="empty">Ничего не найдено</div>';
      bindItemRows($('#tagItems'), { onUpdate: () => renderTags() });
    }));
}

/* ── Calendar Interactive View ──────────────────────────────── */
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed
let calSelectedDate = null;

async function renderCalendar() {
  const calEl = $('#calendar');
  if (!calEl) return;

  const pad = (n) => String(n).padStart(2, '0');
  const monthKey = `${calYear}-${pad(calMonth + 1)}`;
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  // Use cached calendar counts if available for current month, else fetch
  let countsMap = _calendarCountsCache;
  if (_lastCalMonth !== monthKey) {
    countsMap = {};
    try {
      const counts = await GET(`/calendar/${monthKey}`);
      counts.forEach((c) => countsMap[c.date] = c.count);
      _calendarCountsCache = countsMap;
      _lastCalMonth = monthKey;
    } catch (e) { console.error('cal count err', e); }
  }

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const totalDays = lastDay.getDate();
  const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0

  const todayIso = new Date().toISOString().slice(0, 10);
  if (!calSelectedDate) calSelectedDate = todayIso;

  // Build calendar HTML in one pass using array join
  const parts = [];
  const dows = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  for (const d of dows) parts.push(`<div class="dow">${d}</div>`);

  for (let i = 0; i < startDay; i++) {
    parts.push('<div class="cal-day other"></div>');
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    const isSel = calSelectedDate === dateStr;
    const hasItems = countsMap[dateStr] > 0;
    parts.push(`<button class="cal-day ${isSel ? 'sel' : ''}" data-date="${dateStr}">${d}${hasItems ? '<span class="dot"></span>' : ''}</button>`);
  }

  calEl.innerHTML = `
    <div class="cal-head">
      <button id="calPrev">&larr;</button>
      <div class="cal-title">${monthNames[calMonth]} ${calYear}</div>
      <button id="calNext">&rarr;</button>
    </div>
    <div class="cal-grid">${parts.join('')}</div>`;

  $('#calPrev')?.addEventListener('click', () => {
    haptic();
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    _lastCalMonth = null; // force refetch for different month
    renderCalendar();
  });
  $('#calNext')?.addEventListener('click', () => {
    haptic();
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    _lastCalMonth = null; // force refetch for different month
    renderCalendar();
  });

  // Event delegation for calendar days
  const calGrid = calEl.querySelector('.cal-grid');
  calGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-date]');
    if (!btn) return;
    haptic();
    calSelectedDate = btn.dataset.date;
    $$('.cal-day', calEl).forEach((b) => b.classList.toggle('sel', b === btn));
    loadDayItems(calSelectedDate);
  });

  loadDayItems(calSelectedDate);
}

async function loadDayItems(dateStr) {
  const dayItemsEl = $('#dayItems');
  if (!dayItemsEl) return;
  try {
    const items = await GET(`/items?date=${dateStr}`);
    dayItemsEl.innerHTML = `
      <div class="h2" style="margin-top:14px">События на ${dateStr}: ${items.length}</div>
      ${items.length ? items.map(itemRow).join('') : '<div class="empty" style="padding:24px 0">Нет задач и заметок на этот день</div>'}`;
    bindItemRows(dayItemsEl, { onUpdate: () => renderCalendar() });
  } catch (e) {
    dayItemsEl.innerHTML = '<div class="empty">Ошибка загрузки событий дня</div>';
  }
}

/* ── Profile Screen ─────────────────────────────────────────── */
async function renderProfile() {
  const u = tg.initDataUnsafe?.user || { id: 1, first_name: 'Пользователь', username: 'developer' };
  const initials = ((u.first_name?.[0] || '') + (u.last_name?.[0] || '')).toUpperCase() || 'U';

  $('#profileCard').innerHTML = `
    <div class="p-avatar">${initials}</div>
    <div>
      <div class="p-name">${esc(u.first_name)} ${esc(u.last_name || '')}</div>
      <div class="p-user">${u.username ? '@' + esc(u.username) : 'ID: ' + u.id}</div>
    </div>`;

  try {
    const s = await GET('/stats');
    $('#stats').innerHTML = `
      <div class="card glass stat">
        <div class="s-num">${s.notes}</div>
        <div class="s-lbl">${IC.noteSmall} <span>Заметки</span></div>
      </div>
      <div class="card glass stat">
        <div class="s-num">${s.quotes}</div>
        <div class="s-lbl">${IC.quoteSmall} <span>Цитаты</span></div>
      </div>
      <div class="card glass stat">
        <div class="s-num">${s.tasks_done}/${s.tasks}</div>
        <div class="s-lbl">${IC.checkSmall} <span>Задачи решено</span></div>
      </div>
      <div class="card glass stat">
        <div class="s-num">${s.reminders_active}</div>
        <div class="s-lbl">${IC.bellSmall} <span>Напоминания</span></div>
      </div>
      <div class="card glass stat">
        <div class="s-num">${s.today}</div>
        <div class="s-lbl">${IC.calendarSmall} <span>Создано сегодня</span></div>
      </div>
      <div class="card glass stat">
        <div class="s-num">${s.week}</div>
        <div class="s-lbl">${IC.chartSmall} <span>За 7 дней</span></div>
      </div>
      <div class="card glass stat">
        <div class="s-num">${s.month}</div>
        <div class="s-lbl">${IC.monthSmall} <span>За 30 дней</span></div>
      </div>
      <div class="card glass stat">
        <div class="s-num" style="display:flex;align-items:center;gap:6px">${IC.fire} <span>${s.streak}</span></div>
        <div class="s-lbl"><span>Серия активности (дней)</span></div>
      </div>`;
  } catch (e) {
    $('#stats').innerHTML = '<div class="empty">Не удалось загрузить статистику</div>';
  }
}

/* ── Settings Screen ────────────────────────────────────────── */
async function renderSettings() {
  const setSecurity = $('#setSecurity');
  const setBot = $('#setBot');
  const setData = $('#setData');
  if (!setSecurity || !setBot || !setData) return;

  try {
    const s = await GET('/settings');

    // 1. Security
    setSecurity.innerHTML = `
      <div class="set-row" id="pinRow">
        <div class="s-name">${IC.lock} <span>PIN-код защиты</span></div>
        <div class="s-val">${s.has_pin ? 'Включен' : 'Выключен'} &rsaquo;</div>
      </div>
      <div class="set-row" id="autolockRow">
        <div class="s-name">${IC.shield} <span>Автоблокировка</span></div>
        <div class="s-val">${s.autolock_minutes > 0 ? s.autolock_minutes + ' мин' : 'Сразу'} &rsaquo;</div>
      </div>`;

    // 2. Bot Settings
    setBot.innerHTML = `
      <div class="set-row">
        <div class="s-name">${IC.bot} <span>Цитата дня в 09:00</span></div>
        <div class="tgl ${s.quote_of_day ? 'on' : ''}" id="tglQuote"></div>
      </div>
      <div class="set-row" id="defSectionRow">
        <div class="s-name"><span>Пересылать сообщения в</span></div>
        <div class="s-val">${s.default_section === 'task' ? 'Задачи' : 'Заметки'} &rsaquo;</div>
      </div>`;

    // 3. Data & Backup
    setData.innerHTML = `
      <div class="set-row" id="exportJsonRow">
        <div class="s-name">${IC.download} <span>Резервная копия (JSON)</span></div>
        <div class="s-val">Скачать &rsaquo;</div>
      </div>
      <div class="set-row" id="exportMdRow">
        <div class="s-name">${IC.download} <span>Экспорт в Markdown (.md)</span></div>
        <div class="s-val">Скачать &rsaquo;</div>
      </div>
      <div class="set-row" id="exportTxtRow">
        <div class="s-name">${IC.download} <span>Экспорт в TXT</span></div>
        <div class="s-val">Скачать &rsaquo;</div>
      </div>
      <div class="set-row" id="importRow">
        <div class="s-name">${IC.upload} <span>Восстановить из JSON</span></div>
        <div class="s-val">Загрузить &rsaquo;</div>
      </div>
      <div class="set-row" id="cleanTrashRow" style="color:var(--danger)">
        <div class="s-name">${IC.trash} <span>Очистить корзину</span></div>
        <div class="s-val" style="color:var(--danger)">Очистить &rsaquo;</div>
      </div>`;

    // Listeners
    $('#tglQuote')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const on = !$('#tglQuote').classList.contains('on');
      $('#tglQuote').classList.toggle('on', on);
      await POST('/settings', { quote_of_day: on });
      haptic();
    });

    $('#defSectionRow')?.addEventListener('click', async () => {
      const next = s.default_section === 'task' ? 'note' : 'task';
      await POST('/settings', { default_section: next });
      renderSettings();
      haptic();
    });

    $('#autolockRow')?.addEventListener('click', async () => {
      const val = prompt('Автоблокировка через (минут, 0 = сразу):', s.autolock_minutes);
      if (val !== null && !isNaN(Number(val))) {
        await POST('/settings', { autolock_minutes: Math.max(0, Number(val)) });
        renderSettings();
      }
    });

    $('#pinRow')?.addEventListener('click', () => openPinWizard(s.has_pin));

    $('#exportJsonRow')?.addEventListener('click', () => triggerExport('json'));
    $('#exportMdRow')?.addEventListener('click', () => triggerExport('md'));
    $('#exportTxtRow')?.addEventListener('click', () => triggerExport('txt'));

    $('#importRow')?.addEventListener('click', () => {
      const inp = $('#importFileInput');
      if (inp) {
        inp.value = '';
        inp.click();
      }
    });

    $('#cleanTrashRow')?.addEventListener('click', async () => {
      if (confirm('Удалить навсегда все записи из корзины?')) {
        await DEL('/trash');
        showToast('Корзина очищена');
        hapticNotif('success');
      }
    });

  } catch (e) {
    console.error(e);
  }
}

function triggerExport(fmt) {
  haptic();
  showToast(`Формирование экспорта (${fmt})...`);
  window.open(`/api/export?format=${fmt}`, '_blank');
}

// Import JSON file listener
$('#importFileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const items = Array.isArray(json) ? json : json.items;
    if (!Array.isArray(items)) throw new Error('Некорректный формат бэкапа');
    const res = await POST('/import', { items });
    showToast(`Импортировано записей: ${res.imported} ✓`);
    hapticNotif('success');
    refreshHome();
  } catch (err) {
    alert('Ошибка импорта: ' + err.message);
  }
});

/* ── PIN Setup Wizard ───────────────────────────────────────── */
function openPinWizard(hasPin) {
  let mode = hasPin ? 'disable_or_change' : 'new';
  if (mode === 'disable_or_change') {
    openSheet(`
      <div class="s-title">Управление PIN-кодом</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
        <button class="btn ghost" id="pinChangeBtn">Сменить PIN-код</button>
        <button class="btn danger" id="pinDisableBtn">Отключить PIN-код</button>
        <button class="btn ghost" onclick="document.getElementById('sheetBack').click()">Отмена</button>
      </div>`);
    $('#pinDisableBtn').addEventListener('click', async () => {
      const p = prompt('Введите текущий PIN для отключения:');
      if (!p) return;
      const chk = await POST('/pin/verify', { pin: p });
      if (chk.ok) {
        await POST('/settings', { pin: '' });
        showToast('PIN-код отключен');
        closeSheet(); renderSettings();
      } else {
        alert('Неверный PIN-код');
      }
    });
    $('#pinChangeBtn').addEventListener('click', () => {
      closeSheet();
      startPinSetup();
    });
  } else {
    startPinSetup();
  }
}

function startPinSetup() {
  let step = 1;
  let firstPin = '';
  openSheet(`
    <div class="s-title" id="pinWizTitle">Придумайте PIN-код (4 цифры)</div>
    <div class="field">
      <input type="password" class="inp glass" id="pinWizInp" maxlength="4" pattern="[0-9]*" inputmode="numeric" placeholder="••••" style="text-align:center;font-size:24px;letter-spacing:8px">
    </div>
    <button class="btn" id="pinWizNext">Продолжить</button>`);

  const inp = $('#pinWizInp');
  const btn = $('#pinWizNext');
  const title = $('#pinWizTitle');
  inp?.focus();

  btn?.addEventListener('click', async () => {
    const val = inp.value.trim();
    if (!/^\d{4}$/.test(val)) {
      showToast('Введите 4 цифры');
      return;
    }
    if (step === 1) {
      firstPin = val;
      step = 2;
      title.textContent = 'Повторите PIN-код';
      inp.value = '';
      inp.focus();
    } else {
      if (val !== firstPin) {
        alert('PIN-коды не совпадают! Попробуйте снова.');
        closeSheet();
        return;
      }
      await POST('/settings', { pin: val });
      showToast('PIN-код успешно установлен ✓');
      hapticNotif('success');
      closeSheet();
      renderSettings();
    }
  });
}

/* ── PIN Lock Screen Verification ───────────────────────────── */
let pinBuffer = '';
let isLocked = false;

async function checkPinLock() {
  try {
    const s = await GET('/settings');
    if (s.has_pin) showLockScreen();
  } catch (e) {}
}

function showLockScreen() {
  const lockEl = $('#lock');
  if (!lockEl) return;
  isLocked = true;
  pinBuffer = '';
  updatePinDots();
  lockEl.classList.add('open');
  renderPinPad();
}

function renderPinPad() {
  const pad = $('#pinPad');
  if (!pad) return;
  pad.innerHTML = '';
  const digits = ['1','2','3','4','5','6','7','8','9','','0','backspace'];
  const frag = document.createDocumentFragment();
  digits.forEach((d) => {
    const btn = document.createElement('button');
    if (d === 'backspace') {
      btn.innerHTML = IC.backspace;
      btn.style.display = 'grid';
      btn.style.placeItems = 'center';
    } else {
      btn.textContent = d;
    }
    if (!d) {
      btn.style.visibility = 'hidden';
    } else {
      btn.addEventListener('click', () => {
        haptic();
        if (d === 'backspace') {
          pinBuffer = pinBuffer.slice(0, -1);
        } else if (pinBuffer.length < 4) {
          pinBuffer += d;
        }
        updatePinDots();
        if (pinBuffer.length === 4) verifyPinBuffer();
      });
    }
    frag.appendChild(btn);
  });
  pad.appendChild(frag);
}

function updatePinDots() {
  const dots = $$('#pinDots i');
  dots.forEach((dot, idx) => dot.classList.toggle('f', idx < pinBuffer.length));
}

async function verifyPinBuffer() {
  try {
    const res = await POST('/pin/verify', { pin: pinBuffer });
    if (res.ok) {
      hapticNotif('success');
      $('#lock')?.classList.remove('open');
      isLocked = false;
      pinBuffer = '';
    } else {
      hapticNotif('error');
      const dotsEl = $('#pinDots');
      dotsEl?.classList.add('shake');
      setTimeout(() => {
        dotsEl?.classList.remove('shake');
        pinBuffer = '';
        updatePinDots();
      }, 450);
    }
  } catch (e) {
    pinBuffer = '';
    updatePinDots();
  }
}

/* ── FAB & Create Item Sheet ────────────────────────────────── */
$('#fab')?.addEventListener('click', () => {
  haptic('medium');
  openCreateSheet();
});

async function openCreateSheet() {
  let currentKind = 'note';
  let folders = [];
  try { folders = await GET('/folders'); } catch {}

  const renderKindFields = (kind) => {
    let fieldsHtml = '';
    if (kind === 'note') {
      fieldsHtml = `
        <div class="field"><input class="inp glass" id="cTitle" placeholder="Заголовок заметки"></div>
        <div class="field"><textarea class="inp glass" id="cBody" placeholder="Текст заметки (Markdown)" style="height:62px;min-height:unset;resize:none"></textarea></div>`;
    } else if (kind === 'task') {
      fieldsHtml = `
        <div class="field"><input class="inp glass" id="cTitle" placeholder="Что нужно сделать?"></div>
        <div class="field"><textarea class="inp glass" id="cBody" placeholder="Описание / детали задачи" style="height:50px;min-height:unset;resize:none"></textarea></div>
        <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:8px" class="field">
          <input type="datetime-local" class="inp glass" id="cDueAt">
          <select class="inp glass" id="cPrio">
            <option value="">Приоритет</option>
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
          </select>
        </div>`;
    } else if (kind === 'quote') {
      fieldsHtml = `
        <div class="field"><textarea class="inp glass" id="cBody" placeholder="Текст цитаты" style="height:62px;min-height:unset;resize:none"></textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" class="field">
          <input class="inp glass" id="cAuthor" placeholder="Автор">
          <input class="inp glass" id="cSource" placeholder="Источник">
        </div>`;
    } else if (kind === 'reminder') {
      fieldsHtml = `
        <div class="field"><input class="inp glass" id="cTitle" placeholder="О чем напомнить?"></div>
        <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:8px" class="field">
          <input type="datetime-local" class="inp glass" id="cRemindAt">
          <select class="inp glass" id="cRepeatRule">
            <option value="">Без повтора</option>
            <option value="daily">Каждый день</option>
            <option value="weekdays">По будням</option>
            <option value="weekly">Еженедельно</option>
            <option value="monthly">Ежемесячно</option>
          </select>
        </div>`;
    }

    // Common folder & tags (compact 2-column row)
    fieldsHtml += `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" class="field">
        <select class="inp glass" id="cFolder">
          <option value="">Без папки</option>
          ${folders.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}
        </select>
        <input class="inp glass" id="cTags" placeholder="#теги через пробел">
      </div>
      <div style="display:flex;gap:16px;margin:6px 2px 2px">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="cPin"> ${IC.pin} Закрепить
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="cStar"> ${IC.star} В избранное
        </label>
      </div>`;

    return fieldsHtml;
  };

  const html = `
    <div class="s-title">Новая запись</div>
    <div class="seg glass" id="cKindSeg">
      <button class="on" data-val="note">Заметка</button>
      <button data-val="task">Задача</button>
      <button data-val="quote">Цитата</button>
      <button data-val="reminder">Напоминание</button>
    </div>
    <div id="cFormFields">${renderKindFields('note')}</div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn ghost" id="cCancel">Отмена</button>
      <button class="btn" id="cSave">Создать</button>
    </div>`;

  openSheet(html);

  // Setup Segmented control
  initSeg($('#cKindSeg'), (val) => {
    currentKind = val;
    $('#cFormFields').innerHTML = renderKindFields(val);
    bindChecklistButtons();
  });

  function bindChecklistButtons() {
    $('#cAddCheck')?.addEventListener('click', (e) => {
      e.preventDefault();
      const list = $('#cChecklist');
      if (!list) return;
      const row = document.createElement('div');
      row.className = 'cl-row';
      row.innerHTML = `
        <div class="check">${IC.check}</div>
        <input type="text" placeholder="Пункт чеклиста...">
        <button class="cl-del">${IC.close}</button>`;
      row.querySelector('.cl-del').addEventListener('click', () => row.remove());
      row.querySelector('.check').addEventListener('click', function() {
        this.classList.toggle('on');
        row.classList.toggle('done', this.classList.contains('on'));
      });
      list.appendChild(row);
      row.querySelector('input').focus();
    });
  }
  bindChecklistButtons();

  $('#cCancel').addEventListener('click', closeSheet);

  $('#cSave').addEventListener('click', async () => {
    const payload = { kind: currentKind };
    payload.title = $('#cTitle')?.value?.trim() || '';
    payload.body = $('#cBody')?.value?.trim() || '';

    if (currentKind === 'task') {
      const due = $('#cDueAt')?.value;
      if (due) payload.due_at = due.replace('T', ' ') + ':00';
      payload.priority = $('#cPrio')?.value || null;
    } else if (currentKind === 'quote') {
      payload.quote_author = $('#cAuthor')?.value?.trim() || null;
      payload.quote_source = $('#cSource')?.value?.trim() || null;
      payload.quote_category = $('#cCategory')?.value?.trim() || null;
    } else if (currentKind === 'reminder') {
      const rem = $('#cRemindAt')?.value;
      if (rem) payload.remind_at = rem.replace('T', ' ') + ':00';
      payload.repeat_rule = $('#cRepeatRule')?.value || null;
      const nag = $('#cNag')?.value;
      payload.nag_minutes = nag ? Number(nag) : null;
    }

    // Checklist
    const clRows = $$('#cChecklist .cl-row');
    if (clRows.length) {
      payload.checklist = clRows.map((r) => ({
        text: r.querySelector('input').value.trim(),
        done: r.querySelector('.check').classList.contains('on'),
      })).filter((x) => x.text);
    }

    const folderId = $('#cFolder')?.value;
    if (folderId) payload.folder_id = Number(folderId);

    const rawTags = $('#cTags')?.value || '';
    const tags = (rawTags.match(/#?[\p{L}\p{N}_-]+/gu) || []).map(t => t.replace(/^#/, ''));
    if (tags.length) payload.tags = tags;

    payload.pinned = $('#cPin')?.checked ? 1 : 0;
    payload.favorite = $('#cStar')?.checked ? 1 : 0;

    try {
      await POST('/items', payload);
      hapticNotif('success');
      showToast('Запись создана ✓');
      closeSheet();
      refreshHome();
    } catch (err) {
      alert('Ошибка сохранения: ' + err.message);
    }
  });
}

/* ── Item Detail / Edit Sheet ───────────────────────────────── */
async function openItemSheet(id, opts = {}) {
  haptic('light');
  let it = null;
  try {
    it = await GET(`/items/${id}`);
  } catch (e) {
    showToast('Не удалось открыть запись');
    return;
  }

  let folders = [];
  try { folders = await GET('/folders'); } catch {}

  let checklistArr = [];
  if (it.checklist) {
    try {
      checklistArr = typeof it.checklist === 'string' ? JSON.parse(it.checklist) : it.checklist;
    } catch {}
  }

  let isMarkdownPreview = false;

  const kindNames = { note: 'Заметка', task: 'Задача', quote: 'Цитата', reminder: 'Напоминание' };

  function renderSheetContent() {
    let specificFields = '';

    if (it.kind === 'task') {
      specificFields = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <button class="btn ${it.status === 'done' ? 'ghost' : ''}" id="eToggleDone" style="padding:10px 14px;font-size:14px;display:flex;align-items:center;justify-content:center;gap:6px">
            ${it.status === 'done' ? IC.check + ' Выполнено (открыть)' : 'Отметить выполненной'}
          </button>
        </div>
        <div class="field">
          <label>Срок выполнения</label>
          <input type="datetime-local" class="inp glass" id="eDueAt" value="${toInputDateTime(it.due_at)}">
        </div>
        <div class="field">
          <label>Приоритет</label>
          <select class="inp glass" id="ePrio">
            <option value="" ${!it.priority ? 'selected' : ''}>Без приоритета</option>
            <option value="low" ${it.priority === 'low' ? 'selected' : ''}>Низкий</option>
            <option value="medium" ${it.priority === 'medium' ? 'selected' : ''}>Средний</option>
            <option value="high" ${it.priority === 'high' ? 'selected' : ''}>Высокий</option>
          </select>
        </div>`;
    } else if (it.kind === 'quote') {
      specificFields = `
        <div class="field">
          <label>Автор</label>
          <input class="inp glass" id="eAuthor" value="${esc(it.quote_author || '')}" placeholder="Автор">
        </div>
        <div class="field">
          <label>Источник</label>
          <input class="inp glass" id="eSource" value="${esc(it.quote_source || '')}" placeholder="Книга, фильм...">
        </div>
        <div class="field">
          <label>Категория</label>
          <input class="inp glass" id="eCategory" value="${esc(it.quote_category || '')}" placeholder="Категория">
        </div>`;
    } else if (it.kind === 'reminder') {
      specificFields = `
        <div class="field">
          <label>Время напоминания</label>
          <input type="datetime-local" class="inp glass" id="eRemindAt" value="${toInputDateTime(it.remind_at)}">
        </div>
        <div class="field">
          <label>Повторение</label>
          <select class="inp glass" id="eRepeatRule">
            <option value="" ${!it.repeat_rule ? 'selected' : ''}>Без повтора</option>
            <option value="daily" ${it.repeat_rule === 'daily' ? 'selected' : ''}>Ежедневно</option>
            <option value="weekdays" ${it.repeat_rule === 'weekdays' ? 'selected' : ''}>По будням</option>
            <option value="weekly" ${it.repeat_rule === 'weekly' ? 'selected' : ''}>Еженедельно</option>
            <option value="monthly" ${it.repeat_rule === 'monthly' ? 'selected' : ''}>Ежемесячно</option>
          </select>
        </div>
        <div class="field">
          <label>Повторное уведомление (мин)</label>
          <select class="inp glass" id="eNag">
            <option value="" ${!it.nag_minutes ? 'selected' : ''}>Выключено</option>
            <option value="5" ${it.nag_minutes === 5 ? 'selected' : ''}>5 мин</option>
            <option value="15" ${it.nag_minutes === 15 ? 'selected' : ''}>15 мин</option>
            <option value="30" ${it.nag_minutes === 30 ? 'selected' : ''}>30 мин</option>
          </select>
        </div>`;
    }

    const inTrash = !!it.deleted_at;

    const html = `
      <div class="s-head">
        <div style="font-size:14px;color:var(--text-2);font-weight:600">${kindNames[it.kind] || 'Запись'} #${it.id}</div>
        <div class="s-actions">
          <button class="s-act-btn ${it.favorite ? 'active' : ''}" id="eStarBtn" title="Избранное">${IC.star}</button>
          <button class="s-act-btn pinned ${it.pinned ? 'active' : ''}" id="ePinBtn" title="Закрепить">${IC.pin}</button>
          <button class="s-act-btn" id="eCloseBtn" title="Закрыть">${IC.close}</button>
        </div>
      </div>

      <div class="field">
        <input class="inp glass" id="eTitle" value="${esc(it.title || '')}" placeholder="Заголовок" style="font-weight:600;font-size:17px">
      </div>

      <div class="field">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <label style="margin:0">Текст</label>
          <span class="chip" id="eMdToggle" style="cursor:pointer">${isMarkdownPreview ? 'Редактировать' : 'Предпросмотр MD'}</span>
        </div>
        ${isMarkdownPreview
          ? `<div class="card glass" style="min-height:90px;font-size:15px;line-height:1.5">${md(it.body || '') || '<i style="color:var(--text-3)">Пусто</i>'}</div>`
          : `<textarea class="inp glass" id="eBody" placeholder="Текст записи...">${esc(it.body || '')}</textarea>`}
      </div>

      ${specificFields}

      <!-- Checklist -->
      <div class="field">
        <label>Чеклист</label>
        <div class="cl-list" id="eChecklist">
          ${checklistArr.map((c, i) => `
            <div class="cl-row ${c.done ? 'done' : ''}" data-idx="${i}">
              <div class="check ${c.done ? 'on' : ''}" data-cidx="${i}">${IC.check}</div>
              <input type="text" value="${esc(c.text)}">
              <button class="cl-del" data-didx="${i}">${IC.close}</button>
            </div>`).join('')}
        </div>
        <button class="cl-add" id="eAddCheck">${IC.plus} Добавить пункт</button>
      </div>

      <!-- Folder & Tags -->
      <div class="field">
        <label>Папка</label>
        <select class="inp glass" id="eFolder">
          <option value="">Без папки</option>
          ${folders.map(f => `<option value="${f.id}" ${it.folder_id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <label>Теги</label>
        <div class="tag-wrap" id="eTagWrap">
          ${(it.tags || []).map(t => `<span class="tag-badge">#${esc(t.name)} <span class="tb-del" data-rtag="${esc(t.name)}">&times;</span></span>`).join('')}
        </div>
        <input class="inp glass" id="eAddTagInp" placeholder="Добавить тег (Enter)" style="margin-top:6px">
      </div>

      <!-- History -->
      ${it.history?.length ? `
        <div class="field" style="margin-top:14px">
          <label>История изменений (${it.history.length})</label>
          ${it.history.slice(0, 3).map(h => `
            <div class="hist-item">
              <span>Версия от ${fmtDate(h.changed_at)}</span>
              <button data-revert="${h.id}">Восстановить</button>
            </div>`).join('')}
        </div>` : ''}

      <!-- Action Buttons -->
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:18px">
        <button class="btn" id="eSaveBtn">Сохранить изменения</button>
        <div class="row-btns">
          <button class="btn ghost" id="eDupBtn">Дублировать</button>
          <button class="btn ghost" id="eArchBtn">${it.archived ? 'Разархивировать' : 'В архив'}</button>
        </div>
        ${inTrash ? `
          <div class="row-btns">
            <button class="btn ghost" id="eRestoreBtn">Восстановить из корзины</button>
            <button class="btn danger" id="eHardDelBtn">Удалить навсегда</button>
          </div>` : `
          <button class="btn danger" id="eDelBtn">В корзину</button>`}
      </div>`;

    sheet.innerHTML = '<div class="grab"></div>' + html;

    // Listeners inside sheet
    $('#eCloseBtn')?.addEventListener('click', closeSheet);

    $('#eStarBtn')?.addEventListener('click', async () => {
      it.favorite = it.favorite ? 0 : 1;
      haptic();
      $('#eStarBtn').classList.toggle('active', !!it.favorite);
      await PATCH(`/items/${it.id}`, { favorite: it.favorite });
    });

    $('#ePinBtn')?.addEventListener('click', async () => {
      it.pinned = it.pinned ? 0 : 1;
      haptic();
      $('#ePinBtn').classList.toggle('active', !!it.pinned);
      await PATCH(`/items/${it.id}`, { pinned: it.pinned });
    });

    $('#eMdToggle')?.addEventListener('click', () => {
      if (!isMarkdownPreview && $('#eBody')) it.body = $('#eBody').value;
      isMarkdownPreview = !isMarkdownPreview;
      renderSheetContent();
    });

    $('#eToggleDone')?.addEventListener('click', async () => {
      const nextStatus = it.status === 'done' ? 'open' : 'done';
      it.status = nextStatus;
      await PATCH(`/items/${it.id}`, { status: nextStatus });
      hapticNotif('success');
      renderSheetContent();
    });

    // Checklist handlers
    $$('[data-cidx]').forEach(chk => chk.addEventListener('click', () => {
      const idx = Number(chk.dataset.cidx);
      checklistArr[idx].done = !checklistArr[idx].done;
      chk.classList.toggle('on', checklistArr[idx].done);
      chk.closest('.cl-row').classList.toggle('done', checklistArr[idx].done);
    }));

    $$('[data-didx]').forEach(btn => btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.didx);
      checklistArr.splice(idx, 1);
      renderSheetContent();
    }));

    $('#eAddCheck')?.addEventListener('click', (e) => {
      e.preventDefault();
      checklistArr.push({ text: '', done: false });
      renderSheetContent();
      const inputs = $$('#eChecklist input[type="text"]');
      inputs[inputs.length - 1]?.focus();
    });

    // Tag removal
    $$('[data-rtag]').forEach(del => del.addEventListener('click', async () => {
      const name = del.dataset.rtag;
      it.tags = (it.tags || []).filter(t => t.name !== name);
      await PATCH(`/items/${it.id}`, { tags: it.tags.map(t => t.name) });
      renderSheetContent();
    }));

    // Add Tag on Enter
    $('#eAddTagInp')?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = $('#eAddTagInp').value.trim().replace(/^#/, '');
        if (val) {
          const currentTagNames = (it.tags || []).map(t => t.name);
          if (!currentTagNames.includes(val)) {
            currentTagNames.push(val);
            await PATCH(`/items/${it.id}`, { tags: currentTagNames });
            it.tags = currentTagNames.map(name => ({ name }));
            renderSheetContent();
          }
        }
      }
    });

    // Revert history
    $$('[data-revert]').forEach(btn => btn.addEventListener('click', async () => {
      const histId = btn.dataset.revert;
      if (confirm('Восстановить эту версию?')) {
        const updated = await POST(`/items/${it.id}/revert/${histId}`);
        it = updated;
        showToast('Версия восстановлена ✓');
        renderSheetContent();
      }
    }));

    // Duplicate
    $('#eDupBtn')?.addEventListener('click', async () => {
      await POST(`/items/${it.id}/duplicate`);
      showToast('Запись продублирована ✓');
      closeSheet();
      refreshHome();
      opts.onUpdate?.();
    });

    // Archive
    $('#eArchBtn')?.addEventListener('click', async () => {
      const nextArch = it.archived ? 0 : 1;
      await PATCH(`/items/${it.id}`, { archived: nextArch });
      showToast(nextArch ? 'Перенесено в архив' : 'Разархивировано');
      closeSheet();
      refreshHome();
      opts.onUpdate?.();
    });

    // Move to Trash
    $('#eDelBtn')?.addEventListener('click', async () => {
      await DEL(`/items/${it.id}`);
      showToast('Перенесено в корзину');
      closeSheet();
      refreshHome();
      opts.onUpdate?.();
    });

    // Restore from Trash
    $('#eRestoreBtn')?.addEventListener('click', async () => {
      await POST(`/items/${it.id}/restore`);
      showToast('Восстановлено из корзины ✓');
      closeSheet();
      refreshHome();
      opts.onUpdate?.();
    });

    // Hard Delete
    $('#eHardDelBtn')?.addEventListener('click', async () => {
      if (confirm('Удалить эту запись навсегда? Это действие необратимо.')) {
        await DEL(`/items/${it.id}?hard=1`);
        showToast('Запись удалена навсегда');
        closeSheet();
        refreshHome();
        opts.onUpdate?.();
      }
    });

    // Save Changes
    $('#eSaveBtn')?.addEventListener('click', async () => {
      const patch = {};
      patch.title = $('#eTitle')?.value?.trim() || '';
      if (!isMarkdownPreview && $('#eBody')) patch.body = $('#eBody').value;

      if (it.kind === 'task') {
        const due = $('#eDueAt')?.value;
        patch.due_at = due ? due.replace('T', ' ') + ':00' : null;
        patch.priority = $('#ePrio')?.value || null;
      } else if (it.kind === 'quote') {
        patch.quote_author = $('#eAuthor')?.value?.trim() || null;
        patch.quote_source = $('#eSource')?.value?.trim() || null;
        patch.quote_category = $('#eCategory')?.value?.trim() || null;
      } else if (it.kind === 'reminder') {
        const rem = $('#eRemindAt')?.value;
        patch.remind_at = rem ? rem.replace('T', ' ') + ':00' : null;
        patch.repeat_rule = $('#eRepeatRule')?.value || null;
        const nag = $('#eNag')?.value;
        patch.nag_minutes = nag ? Number(nag) : null;
      }

      // Collect updated checklist texts
      const clInputs = $$('#eChecklist .cl-row');
      patch.checklist = clInputs.map((r) => ({
        text: r.querySelector('input').value.trim(),
        done: r.querySelector('.check').classList.contains('on'),
      })).filter((x) => x.text);

      const fId = $('#eFolder')?.value;
      patch.folder_id = fId ? Number(fId) : null;

      try {
        await PATCH(`/items/${it.id}`, patch);
        hapticNotif('success');
        showToast('Сохранено ✓');
        closeSheet();
        refreshHome();
        opts.onUpdate?.();
      } catch (err) {
        alert('Ошибка сохранения: ' + err.message);
      }
    });
  }

  renderSheetContent();
  sheet.classList.add('open');
  sheetBack.classList.add('open');
  document.body.classList.add('sheet-open');
}

/* ── App Initialization ─────────────────────────────────────── */
async function initApp() {
  // 1. Instantly render structure so UI is never blank
  renderSectionTiles();
  renderCalendar();

  // 2. Attach section click delegation once
  $('#sections')?.addEventListener('click', _handleSectionClick);

  // 3. Concurrently check PIN and fetch live data
  Promise.all([
    checkPinLock(),
    refreshHome(),
  ]).catch(console.error);
}

initApp();
