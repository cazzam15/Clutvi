// State is declared FIRST, before anything that can throw.
//
// This file used to create the Supabase client on its second line. If that threw
// — a failed CDN fetch left `supabase` undefined, say — the script aborted before
// reaching `let authMode`, but the function declarations below were already
// hoisted. So tapping a login tab called setAuthMode(), which assigned to a
// binding still in its temporal dead zone, and the user got
// "Cannot access 'authMode' before initialization" with no clue that a script had
// failed to load. Declaring state up front makes that failure mode impossible.
let currentUser = null;
let currentProfile = null;
let authMode = 'signin';

const ACTIVE_STATUSES = ['active', 'trialing'];

// Capture this BEFORE creating the client: supabase-js consumes the recovery
// token and strips the hash as soon as it initializes, so checking later races.
const arrivedViaRecovery = /type=recovery/.test(location.hash);

// Surfaces a real message instead of dying silently if a dependency is missing.
// Runs at script-execution time, before DOMContentLoaded, so the hint may not
// exist yet — retry once the DOM is ready.
function fatalLoadError(what) {
  console.error('Clutvi failed to start:', what);
  const show = () => {
    const hint = document.getElementById('auth-hint');
    if (!hint) return;
    hint.textContent = "⚠️ Clutvi couldn't finish loading — check your connection and reload the page.";
    hint.style.color = 'var(--red)';
    document.querySelectorAll('#auth-screen button').forEach(b => { b.disabled = true; });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
}

const sb = (() => {
  if (typeof supabase === 'undefined' || !supabase?.createClient) {
    fatalLoadError('supabase-js did not load');
    return null;
  }
  if (typeof CLUTVI_CONFIG === 'undefined') {
    fatalLoadError('config.js did not load');
    return null;
  }
  try {
    return supabase.createClient(CLUTVI_CONFIG.SUPABASE_URL, CLUTVI_CONFIG.SUPABASE_ANON_KEY);
  } catch (e) {
    fatalLoadError(e.message);
    return null;
  }
})();

async function initAuth() {
  // fatalLoadError() has already told the user; don't compound it with a crash.
  if (!sb) return;
  // Landing page CTA links here with ?signup=1
  if (new URLSearchParams(location.search).get('signup') === '1') {
    setAuthMode('signup');
    history.replaceState({}, '', location.pathname);
  }
  const { data: { session } } = await sb.auth.getSession();
  await handleSession(session);
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { showRecovery(true); return; }
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') handleSession(session);
  });
  // Arriving via a reset link: show the recovery screen straight away rather
  // than waiting for the auth event, so the dashboard never flashes first.
  if (arrivedViaRecovery) showRecovery(true);
  // Expired or already-used auth links arrive with an error in the hash.
  const hashErr = new URLSearchParams(location.hash.slice(1)).get('error_description');
  if (hashErr) {
    document.getElementById('auth-hint').textContent = '⚠️ ' + hashErr + ' — request a new link below.';
    showToast(hashErr);
    history.replaceState({}, '', location.pathname);
  }
  // Returning from Stripe Checkout: the webhook may land a moment after the
  // redirect, so poll the profile a few times before giving up.
  if (new URLSearchParams(location.search).get('checkout') === 'success') {
    history.replaceState({}, '', location.pathname);
    showToast('You\'re in — activating your account...', 'success');
    for (let i = 0; i < 10 && !isSubscribed(); i++) {
      await new Promise(r => setTimeout(r, 2000));
      await refreshProfile();
    }
    updateScreens();
  }
}

async function handleSession(session) {
  currentUser = session?.user || null;
  currentProfile = null;
  if (currentUser) {
    try {
      await refreshProfile();
    } catch (e) {
      console.error('Profile fetch error:', e);
    }
  }
  updateScreens();
}

async function refreshProfile() {
  if (!currentUser) return;
  const { data, error } = await sb.from('profiles').select('subscription_status').eq('id', currentUser.id).single();
  if (error) {
    console.error('refreshProfile:', error.message);
    return;
  }
  currentProfile = data;
}

function isSubscribed() {
  return !!currentProfile && ACTIVE_STATUSES.includes(currentProfile.subscription_status);
}

function updateScreens() {
  const auth = document.getElementById('auth-screen');
  const paywall = document.getElementById('paywall-screen');
  if (!currentUser) {
    auth.style.display = 'flex';
    paywall.style.display = 'none';
    return;
  }
  auth.style.display = 'none';
  document.getElementById('account-email').textContent = currentUser.email;
  document.getElementById('paywall-email').textContent = currentUser.email;
  paywall.style.display = isSubscribed() ? 'none' : 'flex';
  if (isSubscribed()) {
    loadUsageIndicator();
    // Pulls history + viral library from Postgres and migrates any legacy
    // localStorage blobs. Must run after the session exists, so RLS sees a user.
    loadUserData();
  }
}

function showPaywall() {
  refreshProfile().then(updateScreens);
}

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-tab-signin').classList.toggle('active', mode === 'signin');
  document.getElementById('auth-tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-submit').textContent = mode === 'signin' ? 'Sign In →' : 'Create Account →';
  const hint = document.getElementById('auth-hint');
  hint.textContent = mode === 'signin'
    ? 'Welcome back — sign in to your dashboard.'
    : 'Create your account · 3-day free trial, then £9.99/mo.';
  hint.style.color = '';
  document.getElementById('auth-password').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
}

async function submitAuth() {
  if (!sb) { fatalLoadError('client unavailable'); return; }
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showToast('Enter your email and password'); return; }
  const btn = document.getElementById('auth-submit');
  btn.disabled = true;
  try {
    if (authMode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        document.getElementById('auth-hint').textContent = '📬 Check your inbox to confirm your email, then sign in.';
        setAuthMode('signin');
        showToast('Confirmation email sent!', 'success');
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (e) {
    const msg = e.message || 'Authentication failed';
    document.getElementById('auth-hint').textContent = '⚠️ ' + msg;
    document.getElementById('auth-hint').style.color = 'var(--red)';
    showToast(msg);
  }
  btn.disabled = false;
}

async function forgotPassword() {
  if (!sb) { fatalLoadError('client unavailable'); return; }
  const email = document.getElementById('auth-email').value.trim();
  if (!email) { showToast('Type your email in the box above, then click forgot password'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  const hint = document.getElementById('auth-hint');
  if (error) {
    const msg = /rate limit/i.test(error.message)
      ? 'Too many emails sent recently — please wait an hour and try again.'
      : error.message;
    hint.textContent = '⚠️ ' + msg;
    showToast(msg);
    return;
  }
  hint.textContent = '📬 Reset link sent — check your inbox (and junk folder).';
  showToast('Reset link sent — check your inbox', 'success');
}

function showRecovery(on) {
  document.getElementById('recovery-screen').style.display = on ? 'flex' : 'none';
}

async function submitNewPassword() {
  const p1 = document.getElementById('recovery-password').value;
  const p2 = document.getElementById('recovery-password2').value;
  if (p1.length < 8) { showToast('Password must be at least 8 characters'); return; }
  if (p1 !== p2) { showToast("Passwords don't match"); return; }
  const btn = document.getElementById('recovery-submit');
  btn.disabled = true;
  try {
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) throw error;
    showRecovery(false);
    history.replaceState({}, '', location.pathname);
    showToast('✅ Password updated — welcome back!', 'success');
    const { data: { session } } = await sb.auth.getSession();
    await handleSession(session);
  } catch (e) {
    showToast(e.message || 'Could not update password');
  }
  btn.disabled = false;
}

async function doSignOut() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  updateScreens();
}

async function startCheckout() {
  const btn = document.getElementById('subscribe-btn');
  btn.disabled = true;
  try {
    const { url } = await callFunction('create-checkout');
    location.href = url;
  } catch (e) {
    showToast(e.message);
    btn.disabled = false;
  }
}

async function openBillingPortal() {
  try {
    const { url } = await callFunction('customer-portal');
    location.href = url;
  } catch (e) {
    showToast(e.message);
  }
}
