# Exit Ticket

A lightweight, browser-based exit ticket tool for teachers backed by a real Postgres database via [Supabase](https://supabase.com). No frameworks, no build step — plain HTML, CSS, and JavaScript.

Each teacher gets their own account with their own questions, class code, and student responses — fully isolated from other teachers.

---

## Features

**For students**
- Join with a name and class code
- Questions served one at a time in a randomised order (different for every student)
- Four question types: short answer, multiple choice, true/false, and ranking (drag to reorder)
- Paste disabled on short answer fields
- Tab-switch detection — leaving the page during the ticket is logged and flagged to the teacher
- Confetti on completion 🎉

**For teachers**
- Email + password accounts — each teacher fully isolated
- Add, view, and delete questions from a dashboard
- Responses table with submission time and tab-switch warnings highlighted in amber
- Word count on every short answer response, colour-coded:
  - 🔴 Red — under 10 words
  - 🟡 Amber — 10–19 words
  - 🟢 Green — 20+ words
- Export all responses to CSV (includes word counts)
- Clear all responses after exporting
- Regenerate class code between class periods
- Change account password

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, Vanilla JS |
| Database | Postgres via [Supabase](https://supabase.com) |
| Auth | Supabase Auth (email + password) |
| Hosting | [Netlify](https://netlify.com) (free tier) |
| Credentials | Netlify Edge Functions (env vars, never in repo) |

---

## Project structure

```
exit-ticket/
├── index.html                      — full app (all screens)
├── styles.css                      — all styling
├── app.js                          — all app logic
├── config.example.js               — credential template (safe to commit)
├── config.js                       — your real credentials (gitignored)
├── schema.sql                      — Supabase database setup
├── netlify.toml                    — Netlify deployment config
├── netlify/
│   └── edge-functions/
│       └── config.js               — serves credentials from env vars on Netlify
├── .gitignore
└── README.md
```

---

## Local setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR-USERNAME/exit-ticket.git
cd exit-ticket
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New project** and give it a name
3. Once provisioned, go to **SQL Editor** → paste in the contents of `schema.sql` → click **Run**
4. Go to **Settings → API** and copy your **Project URL** and **anon / public key**

### 3. Add your credentials

Copy `config.example.js` and rename the copy to `config.js`:

```bash
cp config.example.js config.js
```

Open `config.js` and replace the placeholder values:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT-ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY-HERE';
```

> `config.js` is listed in `.gitignore` and will never be committed.

### 4. Run locally

Open a terminal in the project folder and run:

```bash
python -m http.server 5500
```

Then open [http://localhost:5500](http://localhost:5500) in Chrome.

---

## Deploying to Netlify

### 1. Push to GitHub

Make sure `config.js` is **not** committed (it is covered by `.gitignore`). Push everything else:

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Connect to Netlify

1. Go to [netlify.com](https://netlify.com) and sign in
2. Click **Add new site → Import an existing project**
3. Choose **GitHub** and select your repository
4. Leave build settings blank — there is no build step
5. Click **Deploy site**

### 3. Add environment variables

This is the critical step — without this the deployed site won't connect to Supabase.

1. In your Netlify site dashboard, go to **Site configuration → Environment variables**
2. Click **Add a variable** and add both of these:

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://YOUR-PROJECT-ID.supabase.co` |
| `SUPABASE_ANON_KEY` | `eyJ...` (your full anon key) |

3. Go to **Deploys** and click **Trigger deploy → Deploy site** to redeploy with the new variables

Your app is now live at a URL like `https://your-app-name.netlify.app`.

> **How credentials work on Netlify:** A Netlify Edge Function intercepts every request to `/config.js` and serves it dynamically with your credentials injected from environment variables. Your real credentials never live in the GitHub repo.

---

## Database schema

Two tables are created by `schema.sql`:

**`teachers`** — one row per teacher account

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Links to Supabase auth user |
| `email` | text | Teacher email |
| `name` | text | Teacher display name |
| `class_code` | text | 6-char code shared with students |
| `questions` | JSONB | Array of question objects |
| `created_at` | timestamptz | Account creation time |

**`responses`** — one row per student submission

| Column | Type | Description |
|---|---|---|
| `id` | bigserial | Auto-increment ID |
| `teacher_id` | UUID | Links to the teacher |
| `student_name` | text | Student's entered name |
| `tab_warnings` | integer | Number of tab switches during ticket |
| `answers` | JSONB | `{ questionId: answerString }` |
| `created_at` | timestamptz | Submission time |

Row Level Security (RLS) ensures each teacher can only read and modify their own data. Students can submit responses and look up a teacher by class code without needing an account.

---

## How multiple teachers work

Every teacher who creates an account gets their own isolated question set, class code, and response history. There is no overlap between teachers. Students enter a class code which routes them to that specific teacher's questions — responses are stored against that teacher only.

---

## Anti-cheat features

| Feature | How it works |
|---|---|
| Randomised order | Each student sees questions in a different sequence |
| Paste disabled | Short answer fields block paste events |
| Tab detection | Leaving the page during the ticket increments a warning counter, saved to the database and visible to the teacher |
| Word count | Short answer responses show a colour-coded word count in the teacher dashboard |

---

## Disabling email confirmation (optional)

By default Supabase requires new teachers to confirm their email before signing in. To disable this:

1. Supabase dashboard → **Authentication → Providers → Email**
2. Toggle off **Confirm email** → Save

---

## Troubleshooting

**Blank screen or spinner that never resolves**
Open DevTools (F12) → Console and look for red errors. Usually means environment variables are missing on Netlify or credentials in `config.js` are incorrect locally.

**"Account created but profile setup failed"**
The `schema.sql` file was not run correctly. Re-run it in the Supabase SQL Editor.

**"That class code is incorrect"**
The student's code doesn't match any teacher's class code. Check the teacher dashboard for the current code — it's displayed at the top of the Responses tab.

**Email confirmation not arriving**
Check spam, or disable email confirmation in Supabase (see above).

---

## License

MIT
