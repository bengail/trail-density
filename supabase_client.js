// Initializes window.supabaseClient using credentials from window.SUPABASE_URL
// and window.SUPABASE_ANON_KEY (set by config.js, which is gitignored).
// If either value is missing the app silently falls back to static JSON.
(function () {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!url || !key) return;
  if (!window.supabase?.createClient) {
    console.warn("supabase_client.js: Supabase JS SDK not loaded — falling back to static JSON.");
    return;
  }
  window.supabaseClient = window.supabase.createClient(url, key);
})();
