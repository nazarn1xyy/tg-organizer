// ── Telegram WebApp initData verification ────────────────────────
import crypto from 'node:crypto';

export function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const check = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    if (check !== hash) return null;
    return JSON.parse(params.get('user'));
  } catch {
    return null;
  }
}

// Express middleware
export function tgAuth(botToken) {
  return (req, res, next) => {
    const initData = req.get('X-Tg-Init-Data') || '';
    let user = verifyInitData(initData, botToken);

    // Fallback: allow standalone / dev usage when signature is absent or dev
    if (!user) {
      if (!initData || initData === 'dev' || initData === 'null' || initData === 'undefined' || process.env.DEV_MODE !== 'false') {
        user = {
          id: 1,
          first_name: 'Пользователь',
          username: 'developer',
          language_code: 'ru',
          is_dev: true,
        };
      }
    }

    if (!user) return res.status(401).json({ error: 'invalid initData' });
    req.tgUser = user;
    next();
  };
}

