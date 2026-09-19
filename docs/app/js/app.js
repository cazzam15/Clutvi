// History and the viral library live in Postgres (see history.js), scoped by RLS,
// so they follow the user between devices. These are just the in-memory mirror of
// what was last fetched — they start empty and are filled by loadUserData() once
// there's a signed-in user. Nothing here reads localStorage any more.
let contentCount = 0;
let contentHistory = [];
let viralLibrary = [];

function init() {
  renderHistoryViews();
  renderViralLib();
  updateOnboarding();
  initAuth();
}

// Called from updateScreens() once the user is signed in and subscribed.
// Migrates any legacy per-browser blobs first, so a returning user doesn't
// appear to have lost their old history the moment this ships.
async function loadUserData() {
  if (!currentUser) return;
  try {
    await migrateLocalData();
    const [hist, viral, total] = await Promise.all([
      fetchHistory(200),
      fetchViral(),
      countGenerations(),
    ]);
    contentHistory = hist;
    viralLibrary = viral;
    contentCount = total;
    document.getElementById('content-count').textContent = contentCount;
    renderHistoryViews();
    renderViralLib();
    updateOnboarding();
  } catch (e) {
    console.error('loadUserData', e);
  }
}

function updateOnboarding() {
  const card = document.getElementById('onboard-card');
  if (!card) return;
  const dismissed = localStorage.getItem('clutvi_onboard_dismissed') === '1';
  card.style.display = (dismissed || contentCount > 0) ? 'none' : 'block';
}

function dismissOnboarding() {
  localStorage.setItem('clutvi_onboard_dismissed', '1');
  updateOnboarding();
}

// `el` is the sidebar item to highlight. Callers that aren't themselves a sidebar
// item (dashboard tool cards, onboarding chips) can omit it and we find the
// matching one here. They used to pass a document.querySelector() call written
// inline in the HTML attribute, which is what broke the whole dashboard: HTML
// doesn't process backslash escapes, so `[onclick*=\\'algo\\']` reached the JS
// parser as an escaped backslash that closed the string early — a syntax error,
// so the handler never ran. The card still lit up on tap (that's just CSS), which
// made it look like a dead click rather than a broken script.
function nav(id, el, push = true) {
  const page = document.getElementById('page-' + id);
  if (!page) { console.error('nav: no page for', id); return; }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  page.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const item = el || document.querySelector(`.nav-item[onclick*="'${id}'"]`);
  if (item) item.classList.add('active');
  document.getElementById('main').scrollTop = 0;

  // Mobile has no persistent sidebar, so without this there's no way back to the
  // dashboard except reopening the drawer.
  const back = document.getElementById('mobile-back');
  const title = document.getElementById('mobile-title');
  if (back)  back.style.display  = id === 'home' ? 'none' : 'inline-flex';
  if (title) title.style.display = id === 'home' ? '' : 'none';

  // Give the browser/phone back gesture something to go back to *inside* the app.
  // Deliberately no hash or query change: Supabase puts auth tokens in the hash
  // and checkout returns on ?checkout=success, and we must not disturb either.
  if (push) {
    try { history.pushState({ clutviPage: id }, ''); } catch (e) { /* non-fatal */ }
  }

  // closeSidebar() lives in the inline script at the end of index.html.
  if (window.innerWidth < 768 && typeof closeSidebar === 'function') closeSidebar();
}

// Back/forward moves between app pages instead of leaving the app. A null state
// means we've reached the entry the app started on, which is the dashboard.
window.addEventListener('popstate', e => {
  const id = e.state?.clutviPage || 'home';
  if (document.getElementById('page-' + id)) nav(id, null, false);
});

function selectChip(el, group) {
  const parent = el.closest('.chip-row') || el.parentElement;
  parent.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function getActiveChip(group) {
  const chips = document.querySelectorAll(`[onclick*="'${group}'"]`);
  for (const c of chips) { if (c.classList.contains('active')) return c.textContent.trim(); }
  return '';
}

function setLoading(id, on) {
  document.getElementById(id + '-loading').classList.toggle('visible', on);
  const btn = document.querySelector(`[onclick="run${id.charAt(0).toUpperCase()+id.slice(1)}()"]`) || document.querySelector(`[onclick*="run${id.charAt(0).toUpperCase()}"]`);
  if (btn) btn.disabled = on;
}

function showOutput(id, text) {
  const box = document.getElementById(id + '-output');
  box.textContent = text;
  box.classList.add('visible');
  const acts = document.getElementById(id + '-actions');
  if (acts) acts.style.display = 'flex';
}

// --- structured-output formatters -------------------------------------------
// The proxy returns schema-shaped JSON per tool (see claude-proxy/tools.ts);
// these turn it into the plain text the output boxes render.
const DIVIDER = '\n\n────────────\n\n';

function formatHashtags(tags) {
  return (tags || []).map(t => '#' + String(t).replace(/^#/, '')).join(' ');
}

function formatCaptions(d) {
  return d.captions.map((c, i) =>
    `Caption ${i + 1}\n\n${c.hook}\n\n${c.body}\n\n${formatHashtags(c.hashtags)}`
  ).join(DIVIDER);
}

function formatAlgo(d) {
  const why = Array.isArray(d.why) && d.why.length
    ? d.why.map(x => '• ' + x).join('\n')
    : '';
  const parts = [];
  if (why) parts.push('Why this score:\n' + why);
  if (d.change_this) parts.push('Change this:\n' + d.change_this);
  if (d.rewritten_hook) parts.push('Rewritten hook:\n' + d.rewritten_hook);
  if (d.verdict) parts.push(d.verdict);
  if (!why && Array.isArray(d.improvements) && d.improvements.length)
    parts.push('How to boost it:\n' + d.improvements.map(x => '• ' + x).join('\n'));
  if (d.best_time) parts.push(`Best time to post: ${d.best_time}`);
  if (d.format) parts.push(`Recommended format: ${d.format}`);
  return parts.join('\n\n');
}

let lastAlgoInput = '';
let lastAlgoData = null;

function improveAlgoIdea() {
  if (!lastAlgoData || !lastAlgoData.rewritten_hook) {
    showToast('Run Analyzer first');
    return;
  }
  const hook = String(lastAlgoData.rewritten_hook).trim();
  const base = (lastAlgoInput || '').trim();
  document.getElementById('algo-input').value = bas