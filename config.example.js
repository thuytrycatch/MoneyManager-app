/* =====================================================================
 *  config.example.js — Configuration TEMPLATE (Supabase)
 * ---------------------------------------------------------------------
 *  You are NOT required to use this file. On the GitHub Pages build, enter
 *  your information directly on the app's "Kết nối Supabase" (Connect to
 *  Supabase) screen (saved to the browser's localStorage).
 *
 *  If you prefer running LOCALLY: copy this file to config.js and fill it in.
 *  (config.js is in .gitignore, so it won't be pushed to GitHub.)
 *
 *  WHERE TO GET THE INFO:
 *    Supabase → Project → Settings → API
 *      - Project URL            → SUPABASE_URL
 *      - Project API keys → anon public → SUPABASE_ANON_KEY
 *
 *  ⚠️ The anon key is a PUBLIC key, safe to put in the browser — data is
 *     protected by Row Level Security (see supabase-schema.sql).
 * ===================================================================== */
const CONFIG = {
  SUPABASE_URL: '',          // https://xxxxxxxx.supabase.co
  SUPABASE_ANON_KEY: '',     // eyJhbGciOi... (anon public key)
  GEMINI_API_KEY: '',        // (optional, FREE tier) AIza... from aistudio.google.com/app/apikey — AI auto-categorization
  ANTHROPIC_API_KEY: '',     // (optional, paid) sk-ant-... Claude fallback for parsing
};
window.CONFIG = CONFIG;
