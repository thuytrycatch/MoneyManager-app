# 💰 Sổ Thu Chi — Family budget manager (multi-household)

A budget web app that runs on **GitHub Pages** (free), accepts input in
**natural Vietnamese**, and stores data in a **Supabase PostgreSQL database**.
It supports **multiple households** (each person signs in separately, data is
isolated via Row Level Security), statistic charts, budget alerts, VI/EN
bilingual UI, and dark mode.

> Input examples: `ăn sáng 35k` · `lương 15 triệu` · `đổ xăng 80k` · `cafe 2 triệu rưỡi` · `grab 1tr2`

---

## ✨ Features

- 👨‍👩‍👧 **Multiple households**: each household has its own data; invite family with a household code.
- 🔐 **Sign in** with email/password (Supabase Auth).
- 🛡️ **Security** via Row Level Security — one household cannot read/write another's data.
- 📝 Enter transactions in natural Vietnamese (Claude API, with a regex fallback).
- 📊 Charts: category donut, income/expense bars, budget progress bars.
- 🔔 Alerts when a budget passes 80% and 100%.
- 📱 Mobile-first, bottom navigation, dark mode, Vietnamese / English UI.

---

## 🚀 Deployment guide

### 1. Create a Supabase project (free)

1. Sign up at <https://supabase.com> → **New project**.
2. Pick a **Region** close to your users (e.g. *Southeast Asia — Singapore*).
3. Set a database password (save it; the app does not need it).

### 2. Create tables + security

Open **SQL Editor → New query**, paste the entire contents of
[`supabase-schema.sql`](supabase-schema.sql), then click **Run**. (Running it once is enough.)

This creates the `households`, `household_members`, `transactions`, and
`budgets` tables and enables **RLS** so each household only sees its own data.
It also creates the private **`receipts`** Storage bucket used for photo
evidence on transactions (image files live in Storage; the database only stores
a pointer). If your project blocks creating buckets from SQL, create it manually
in **Storage → New bucket** named `receipts` with **Public = OFF**.

### 3. Get the connection info

**Supabase → Settings → API**:

```
Project URL                     → SUPABASE_URL       (https://xxxx.supabase.co)
Project API keys → anon public  → SUPABASE_ANON_KEY  (eyJhbGciOi...)
```

> ✅ The `anon key` is a **public key**, safe to put in the browser — data is
> protected by RLS. This is a big difference from the previous GitHub token.

### 4. Enable email authentication

**Supabase → Authentication → Providers → Email**: enable **Email**.
- For quick use, you can turn off *"Confirm email"* (Authentication → Providers →
  Email → *Confirm email* = off) so you can sign in right after signing up.

### 5. Deploy to GitHub Pages

```
Repo → Settings → Pages
   → Source: Deploy from a branch
   → Branch: main   /(root)  → Save
```

Open `https://{username}.github.io/{repo-name}`. The app shows the
**Connect to Supabase** screen → enter the URL + anon key (stored in the
browser's localStorage) → **Sign up / Sign in**.

> When running locally, you can pre-fill `config.js` (gitignored) for convenience.

---

## 👨‍👩‍👧 Using it with multiple households

- Each person **signs up** → a separate **household** is created automatically.
- To let family manage one household together: go to **Settings → Household →
  Copy code** and send the code to them. They open **Settings → Join another
  household** and paste the code.
- From then on, every member of the household shares its transactions & budgets.

---

## 🤖 Claude API integration (optional)

Set `ANTHROPIC_API_KEY` (Settings → Claude API Key) to better understand
Vietnamese input. Model used: **`claude-haiku-4-5`**. With no key, the app falls
back to a **regex** parser (still recognizes `35k`, `80 nghìn`, `1.5tr`,
`2 triệu rưỡi`, ...).

> ⚠️ An Anthropic API key placed in the browser can be exposed — set a
> **spending limit** on the key and use it only for your own/family app.

---

## 📁 Project structure

```
.
├── index.html              # Shell + CDN loading (Chart.js, Supabase), scripts
├── supabase-schema.sql     # DB schema + RLS (run in the Supabase SQL Editor)
├── config.js               # Personal config (gitignored, optional)
├── config.example.js       # Config template
├── css/style.css           # UI, dark mode, responsive, sign-in screen
└── js/
    ├── app.js              # Main logic, i18n, navigation, auth, CRUD
    ├── store.js            # Supabase data layer (Auth + households + transactions + budgets)
    ├── parser.js           # Vietnamese parsing (Claude + regex)
    └── charts.js           # Chart.js charts
```

---

## 🏷️ Versioning & releases

Follows **[Semantic Versioning 2.0.0](https://semver.org/)** — **every push to `main` is a release**.
Versions are derived automatically from **[Conventional Commits](https://www.conventionalcommits.org/)**
(`fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major) by
[`.github/workflows/release.yml`](.github/workflows/release.yml), which tags the commit,
stamps the version into the app, and publishes a [GitHub Release](../../releases).

Full process and commit-message rules: **[docs/RELEASING.md](docs/RELEASING.md)**.

---

## 🛠️ Run locally

```bash
# Python
python -m http.server 8080
# then open http://localhost:8080
```

No build step, no npm install required.

---

## ℹ️ Notes

- The app needs an **internet connection** to read/write data (Supabase). When
  offline it still shows the most recently loaded data (IndexedDB cache) but
  cannot write new entries.
- The previous version stored data in a JSON file on GitHub
  (`data/transactions.json`) and was single-user only — now replaced by Supabase.
