// config.example.js
// ─────────────────────────────────────────────────────────
// TEMPLATE FILE — safe to commit to GitHub.
//
// TO SET UP LOCALLY:
//   1. Copy this file and rename the copy to config.js
//   2. Replace the placeholder values with your real credentials
//   3. Never commit config.js (it is in .gitignore)
//
// TO DEPLOY ON NETLIFY:
//   You do not need config.js at all on Netlify.
//   Instead, set these two environment variables in the
//   Netlify dashboard under Site Settings → Environment Variables:
//
//     SUPABASE_URL      →  https://xxxxxxxxxxxx.supabase.co
//     SUPABASE_ANON_KEY →  eyJ... (your anon/public key)
//
// WHERE TO FIND YOUR CREDENTIALS:
//   Supabase dashboard → Settings → API
// ─────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://YOUR-PROJECT-ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY-HERE';

function getConfig() {
  return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
}

function saveConfig() {}
