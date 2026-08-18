/* ═══════════════════════════════════════════
   GIEESKRECIPES — Supabase Client & Auth
═══════════════════════════════════════════ */

const SUPABASE_URL  = 'https://qwlrcjwqjlzrkdhmwqgz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3bHJjandxamx6cmtkaG13cWd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDU4MDIsImV4cCI6MjA5OTc4MTgwMn0.N0YckRF7Og4nrWp7d_nPWzgzaOFBcnrDKI6u4vAtjmc';

// Auth email/OAuth redirects always target the real website, never
// window.location.origin — inside the native app, that "origin" is an
// internal address (e.g. https://localhost) that means nothing to an
// email client or external browser. The website itself then shows a
// "return to the app" message when it detects this landing.
const SITE_URL = 'https://gieesk.com';

let _supabase = null;
let currentUser = null;

function getSupabase() {
  if (_supabase) return _supabase;
  if (typeof supabase === 'undefined') {
    console.warn('Supabase SDK not loaded yet.');
    return null;
  }
  _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      detectSessionInUrl: true,  // automatically picks up token from URL hash
      persistSession: true,       // keeps user logged in across page refreshes
      autoRefreshToken: true,     // refreshes token before it expires
    }
  });
  return _supabase;
}

// Simple standalone banner for the confirmation/reset landing case —
// intentionally not dependent on any other UI module, since this can
// fire before the rest of the page has finished initializing.
function showReturnToAppBanner(message) {
  var banner = document.createElement('div');
  banner.setAttribute('role', 'status');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:5000;' +
    'background:#0A0A09;color:#F0EEE8;padding:14px 20px;text-align:center;' +
    'font-size:14px;font-weight:600;border-bottom:1px solid rgba(212,160,57,0.3);' +
    'display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap';
  banner.innerHTML = '<span>' + message + '</span>' +
    '<button style="background:#D4A039;color:#0A0A09;border:none;border-radius:999px;' +
    'padding:6px 16px;font-weight:700;font-size:13px;cursor:pointer" ' +
    'onclick="this.parentElement.remove()">Got it</button>';
  document.body.prepend(banner);
}

// ── Init: runs on page load ───────────────
async function initAuth() {
  const sb = getSupabase();
  if (!sb) return;

  // Landed here from an email confirmation link (or password reset) —
  // this always happens in an external browser, never inside the app
  // itself, since email clients can't open the app directly. Show a
  // clear next step instead of just silently landing on the homepage.
  const params = new URLSearchParams(window.location.search);
  if (params.get('confirmed') === 'true') {
    showReturnToAppBanner('✅ Email confirmed! Open the GieesK Recipes app and log in to continue.');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get('reset') === 'true') {
    showReturnToAppBanner('🔑 You can now set a new password. Open the GieesK Recipes app to continue.');
  }

  // Listen FIRST before getSession so we catch the SIGNED_IN event from OAuth hash
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    onAuthStateChange(currentUser);
    if (_event === 'SIGNED_IN') {
      // Clean the ugly token hash from the URL
      window.history.replaceState({}, document.title, window.location.pathname);
      closeAuthModal();
    }
  });

  // This triggers the onAuthStateChange above if there's a token in the URL hash
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    onAuthStateChange(currentUser);
    // Clean URL if we landed with a token hash
    if (window.location.hash.includes('access_token')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}

// ── Updates nav UI based on login state ──
function onAuthStateChange(user) {
  // Wait for DOM to be ready before touching elements
  const update = () => {
  const btnLogin  = document.getElementById('btnLogin');
  const btnSignup = document.getElementById('btnSignup');
  const userMenu  = document.getElementById('userMenu');

  if (user) {
    if (btnLogin)  btnLogin.style.display  = 'none';
    if (btnSignup) btnSignup.style.display = 'none';
    if (userMenu) {
      userMenu.style.display = 'flex';
      const name   = user.user_metadata?.full_name
                  || user.user_metadata?.name
                  || user.email?.split('@')[0]
                  || 'Chef';
      const avatar = user.user_metadata?.avatar_url
                  || user.user_metadata?.picture
                  || null;
      const nameEl   = document.getElementById('userMenuName');
      const avatarEl = document.getElementById('userMenuAvatar');
      if (nameEl)   nameEl.textContent = name;
      if (avatarEl) {
        avatarEl.innerHTML = avatar
          ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
          : name.charAt(0).toUpperCase();
      }
    }
  } else {
    if (btnLogin)  btnLogin.style.display  = '';
    if (btnSignup) btnSignup.style.display = '';
    if (userMenu)  userMenu.style.display  = 'none';
  }
  }; // end update
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update);
  } else {
    update();
  }
}

// ── Email sign up ─────────────────────────
async function signUpEmail(name, email, password) {
  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${SITE_URL}?confirmed=true`,
    }
  });
  return { data, error };
}

// ── Email sign in ─────────────────────────
async function signInEmail(email, password) {
  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { data, error };
}

// OAuth callback URL that deep-links back into the app. Supabase's server
// can't reliably redirect directly to a custom scheme (com.gieesk.recipes://)
// — confirmed via a 502 in Supabase's own auth logs when tried directly —
// so this points to a real page on the website instead, which then hands
// off to the app via JS. That bridge page (app-auth-bridge.html) must ALSO
// be added to Supabase Dashboard → Authentication → URL Configuration →
// Redirect URLs (in addition to the custom scheme, which stays there too
// since our AndroidManifest intent-filter still needs it for the handoff).
const APP_OAUTH_CALLBACK = `${SITE_URL}/app-auth-bridge.html`;

function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

// Shared OAuth flow for the native app: get Supabase's provider URL
// without letting it redirect the WebView itself, open that URL in an
// in-app browser tab (Browser plugin), and let the appUrlOpen listener
// (registered once, near the bottom of this file) catch the callback,
// extract the session, and close the tab automatically.
async function signInOAuthNative(provider) {
  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: provider,
    options: {
      redirectTo: APP_OAUTH_CALLBACK,
      skipBrowserRedirect: true, // we open it ourselves, in-app
    }
  });
  if (error || !data?.url) return { error: error || { message: 'Could not start sign-in.' } };

  if (window.Capacitor?.Plugins?.Browser) {
    await window.Capacitor.Plugins.Browser.open({ url: data.url });
  } else {
    window.location.href = data.url; // fallback, shouldn't normally happen
  }
  return { error: null };
}

// ── Google sign in ────────────────────────
async function signInGoogle() {
  if (isNativeApp()) return signInOAuthNative('google');

  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: SITE_URL,
      skipBrowserRedirect: false,
    }
  });
  return { error };
}

// ── Apple sign in ─────────────────────────
async function signInApple() {
  if (isNativeApp()) return signInOAuthNative('apple');

  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: SITE_URL }
  });
  return { error };
}

// ── Sign out ──────────────────────────────
async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  closeUserDropdown();
}

// ── Reset password ────────────────────────
async function resetPassword(email) {
  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}?reset=true`,
  });
  return { error };
}

// ── Save a recipe ─────────────────────────
async function saveRecipe(recipeId) {
  if (!currentUser) { openAuthModal('login'); return false; }
  const sb = getSupabase();
  const { error } = await sb.from('saved_recipes').upsert({
    user_id:   currentUser.id,
    recipe_id: String(recipeId),
    saved_at:  new Date().toISOString(),
  });
  return !error;
}

async function unsaveRecipe(recipeId) {
  if (!currentUser) { openAuthModal('login'); return false; }
  const sb = getSupabase();
  const { error } = await sb.from('saved_recipes')
    .delete().eq('user_id', currentUser.id).eq('recipe_id', String(recipeId));
  return !error;
}

// ── Get saved recipes for current user ───
async function getSavedRecipes() {
  if (!currentUser) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('saved_recipes')
    .select('recipe_id')
    .eq('user_id', currentUser.id);
  if (error) return [];
  return data.map(r => r.recipe_id);
}

// ── User dropdown toggle ──────────────────
function toggleUserDropdown() {
  const drop = document.getElementById('userDropdown');
  if (!drop) return;
  const isOpen = drop.classList.contains('open');
  drop.classList.toggle('open');
  // Populate header with live user info
  if (!isOpen && currentUser) {
    const name  = currentUser.user_metadata?.full_name
               || currentUser.user_metadata?.name
               || currentUser.email?.split('@')[0] || '';
    const email = currentUser.email || '';
    const dn = document.getElementById('dropName');
    const de = document.getElementById('dropEmail');
    if (dn) dn.textContent = name;
    if (de) de.textContent = email;
  }
}

function closeUserDropdown() {
  document.getElementById('userDropdown')?.classList.remove('open');
}

// ── Native OAuth callback listener ────────
// Fires when Android hands control back to the app via the
// com.gieesk.recipes://auth-callback deep link — extracts the session
// from the URL, closes the in-app browser tab, and lets Supabase's own
// auth-state listener (registered in initAuth) pick up the SIGNED_IN
// event from there, same as it already does for the web OAuth flow.
if (window.Capacitor?.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener('appUrlOpen', async function (event) {
    if (!event.url || !event.url.startsWith('com.gieesk.recipes://auth-callback')) return;

    const sb = getSupabase();
    if (!sb) return;

    // Supabase's modern OAuth flow (PKCE) returns an authorization `code`
    // as a query param, not tokens in a hash fragment — exchangeCodeForSession
    // accepts the full callback URL directly and handles this correctly.
    try {
      const { error } = await sb.auth.exchangeCodeForSession(event.url);
      if (error) console.warn('[GieesK] OAuth code exchange failed:', error.message);
    } catch (err) {
      console.warn('[GieesK] OAuth callback error:', err);
    }

    if (window.Capacitor.Plugins.Browser) {
      window.Capacitor.Plugins.Browser.close().catch(function () {});
    }
    if (typeof closeAuthModal === 'function') closeAuthModal();
  });
}