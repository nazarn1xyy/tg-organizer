# Telegram Mini App Organizer 📱⚡

Personal organizer with **Liquid Glass UI**, Telegram Bot integration, and **Turso Cloud SQLite** database. Designed for Telegram Mini Apps with 60fps mobile responsiveness and instant serverless deployment on **Vercel**.

---

## ✨ Features

- 📝 **Notes** — Markdown formatting, tags, pinned, favorites
- 💬 **Quotes** — Author, source, category, daily random quote
- 🎯 **Tasks** — Priority levels, due dates, interactive checklists
- 🔔 **Reminders** — Repeating schedules, nag notifications
- 📂 **Folders & Tags** — Multi-select filtering and organisation
- 📅 **Interactive Calendar** — Event counts and daily breakdown
- 🔒 **PIN Security** — 4-digit keypad protection & auto-lock
- 🌐 **Liquid Glass iOS Design** — Floating glass navbar, smooth sheets, zero horizontal scroll
- 🚀 **Turso Cloud SQLite** — Serverless edge database powered by LibSQL

---

## 🛠 Tech Stack

- **Frontend**: Vanilla JS (ES6+), Glassmorphism CSS, Telegram WebApp SDK
- **Backend**: Node.js, Express, Grammy (Telegram Bot Framework)
- **Database**: [Turso](https://turso.tech) (LibSQL / Cloud SQLite)
- **Hosting**: [Vercel](https://vercel.com) (Serverless & Webhooks)

---

## 🚀 Quick Start (Local Development)

1. **Clone repository & install dependencies**:
   ```bash
   git clone https://github.com/nazarn1xyy/tg-organizer.git
   cd tg-organizer
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env` file from the template:
   ```bash
   cp .env.example .env
   ```
   Fill in your `BOT_TOKEN` from [@BotFather](https://t.me/BotFather), and your Turso credentials:
   ```env
   BOT_TOKEN=your_bot_token
   WEBAPP_URL=http://localhost:7890
   PORT=7890
   DEV_MODE=true
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=your_turso_token
   ```

3. **Run local server**:
   ```bash
   npm start
   ```
   Open `http://localhost:7890` in your browser.

4. **Run test suite**:
   ```bash
   npm test
   ```

---

## ☁️ Deploy to Vercel

1. Push this repository to GitHub.
2. Go to **[Vercel](https://vercel.com)** → **Add New Project** → Select this repo.
3. Add the following **Environment Variables** in Vercel settings:
   - `BOT_TOKEN`
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
4. Click **Deploy**.
5. Set Telegram Webhook:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_DOMAIN>/api/bot-webhook
   ```
6. Set Menu Button in [@BotFather](https://t.me/BotFather) using `/setmenubutton` to your Vercel URL.
