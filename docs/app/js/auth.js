const sb = supabase.createClient(RR_CONFIG.SUPABASE_URL, RR_CONFIG.SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let authMode = 'signin';

const ACTIVE_STATUSES = ['active', 'trialing'];

async function initAuth() {
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
  if (location.hash.includes('type=recovery')) showRecovery(true);
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
  if (currentUser) await refreshProfile();
  updateScreens();
}

async function refreshProfile() {
  if (!currentUser) return;
  const { data } = await sb.from('profiles').select('subscription_status').eq('id', currentUser.id).single();
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
}

function showPaywall() {
  refreshProfile().then(updateScreens);
}

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-tab-signin').classList.toggle('active', mode === 'signin');
  document.getElementById('auth-tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-submit').textContent = mode === 'signin' ? 'Sign In →' : 'Create Account →';
  document.getElementById('auth-hint').textContent = mode === 'signin'
    ? 'Welcome back — sign in to launch your dashboard.'
    : 'Create your account, then subscribe to unlock the tools.';
  document.getElementById('auth-password').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
}

async function submitAuth() {
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
    showToast(e.message || 'Authentication failed');
  }
  btn.disabled = false;
}

async function forgotPassword() {
  const email = document.getElementById('auth-email').value.trim();
  if (!email) { showToast('Type your email in the box above, then click forgot password'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  if (error) { showToast(error.message); return; }
  document.getElementById('auth-hint').textContent = '📬 Reset link sent — check your inbox.';
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
