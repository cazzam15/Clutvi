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
  return [
    d.verdict,
    'How to boost it:\n' + d.improvements.map(x => '• ' + x).join('\n'),
    `Best time to post: ${d.best_time}`,
    `Recommended format: ${d.format}`,
  ].join('\n\n');
}

function formatHistoryAnalysis(d) {
  const section = (title, items) => `${title}\n${(items || []).map(x => '• ' + x).join('\n')}`;
  return [
    section('What performs best', d.works),
    section('Patterns in your top posts', d.patterns),
    section('Do more of', d.do_more),
    section('Stop doing', d.stop),
    section('Three ideas based on what works', d.ideas),
  ].join('\n\n');
}

function formatPlan(d) {
  return d.posts.map((p, i) =>
    `Post ${i + 1} — ${p.day} · ${p.format}\nHook: ${p.hook}\n${p.outline}`
  ).join(DIVIDER);
}

function formatReplies(d) {
  return d.replies.map(r => `💬 ${r.comment}\n→ ${r.reply}`).join('\n\n');
}

function formatRemixes(d) {
  return d.remixes.map((r, i) =>
    `Remix ${i + 1}\n\n${r.hook}\n\n${r.body}\n\n${formatHashtags(r.hashtags)}`
  ).join(DIVIDER);
}

async function runCaption() {
  const text = document.getElementById('caption-input').value.trim();
  if (!text) { showToast('Describe your post first'); return; }
  const plat = getActiveChip('plat');
  const tone = getActiveChip('tone');
  setLoading('caption', true);
  try {
    const data = await callClaude('caption', text, { platform: plat, tone });
    showOutput('caption', formatCaptions(data));
    incrementCount();
    addToHistory('caption', text, data);
  } catch(e) { if (!e.handled) showToast(e.message); }
  setLoading('caption', false);
}

async function runAlgo() {
  const text = document.getElementById('algo-input').value.trim();
  if (!text) { showToast('Describe your content idea first'); return; }
  const plat = getActiveChip('algo-plat');
  setLoading('algo', true);
  try {
    const data = await callClaude('algo', text, { platform: plat });
    const score = data.score;
    document.getElementById('algo-score-wrap').style.display = 'block';
    document.getElementById('algo-bar').style.width = score + '%';
    const numEl = document.getElementById('algo-score-num');
    numEl.textContent = score + '/100';
    numEl.className = 'score-num ' + (score >= 70 ? 'high' : score >= 45 ? 'mid' : 'low');
    showOutput('algo', formatAlgo(data));
    document.getElementById('algo-actions').style.display = 'flex';
    incrementCount();
    addToHistory('algo', text, data);
  } catch(e) { if (!e.handled) showToast(e.message); }
  setLoading('algo', false);
}

async function runHistory() {
  const text = document.getElementById('history-input').value.trim();
  if (!text) { showToast('Paste your post history first'); return; }
  setLoading('history', true);
  try {
    const data = await callClaude('history', text);
    showOutput('history', formatHistoryAnalysis(data));
    incrementCount();
    addToHistory('history', text, data);
  } catch(e) { if (!e.handled) showToast(e.message); }
  setLoading('history', false);
}

async function runBrain() {
  const text = document.getElementById('brain-input').value.trim();
  if (!text) { showToast('Do the brain dump first'); return; }
  const count = getActiveChip('dump-count');
  const plat = getActiveChip('dump-plat');
  setLoading('brain', true);
  try {
    const data = await callClaude('brain', text, { platform: plat, plan: count });
    showOutput('brain', formatPlan(data));
    incrementCount();
    addToHistory('brain', text, data);
  } catch(e) { if (!e.handled) showToast(e.message); }
  setLoading('brain', false);
}

async function runComment() {
  const text = document.getElementById('comment-input').value.trim();
  if (!text) { showToast('Paste some comments first'); return; }
  const tone = getActiveChip('reply-tone');
  const comments = text.split('\n').filter(c => c.trim());
  setLoading('comment', true);
  try {
    const data = await callClaude('comment', comments.join('\n'), { tone });
    showOutput('comment', formatReplies(data));
    incrementCount();
    addToHistory('comment', comments.join('\n'), data);
  } catch(e) { if (!e.handled) showToast(e.message); }
  setLoading('comment', false);
}

async function saveViralPost() {
  const text = document.getElementById('viral-save-input').value.trim();
  if (!text) { showToast('Paste a post to save'); return; }
  const plat = getActiveChip('viral-plat');
  const note = document.getElementById('viral-note-input').value.trim();

  const id = await saveViral(plat, text, note || null);
  if (!id) return; // saveViral() already toasted

  viralLibrary.unshift({ id, platform: plat, text, note, created_at: new Date().toISOString() });
  document.getElementById('viral-save-input').value = '';
  document.getElementById('viral-note-input').value = '';
  renderViralLib();
  showToast('✅ Saved to your library!', 'success');
}

function renderViralLib() {
  const el = document.getElementById('viral-lib-content');
  if (viralLibrary.length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;text-align:center;padding:40px 0;">No saved posts yet. Save a viral post to start your library.</div>';
    return;
  }
  // ids are uuids now, so they go into the handlers quoted and escaped.
  el.innerHTML = '<div class="viral-lib">' + viralLibrary.map(p => `
    <div class="viral-card">
      <div class="viral-card-platform">${escapeHtml(p.platform || '—')} · ${new Date(p.created_at).toLocaleDateString()}</div>
      <div class="viral-card-text">${escapeHtml(p.text.substring(0,120))}${p.text.length > 120 ? '...' : ''}</div>
      ${p.note ? `<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;">💡 ${escapeHtml(p.note)}</div>` : ''}
      <div class="viral-card-actions">
        <button class="btn-sm" data-text="${escapeAttr(p.text)}" onclick="copyText(this)">Copy</button>
        <button class="btn-sm" onclick="prefillRemix('${escapeAttr(p.id)}')">Remix</button>
        <button class="btn-sm" onclick="removeViralPost('${escapeAttr(p.id)}')" style="color:var(--red)">Delete</button>
      </div>
    </div>
  `).join('') + '</div>';
}

function prefillRemix(id) {
  const post = viralLibrary.find(p => p.id === id);
  if (!post) return;
  document.getElementById('remix-input').value = post.text;
  switchTab('remix', document.querySelector('.tab-btn:last-child'));
}

// Renamed from deleteViral() — that name collided with history.js's DB helper,
// which loads second and silently replaced this handler.
async function removeViralPost(id) {
  if (!await deleteViralRow(id)) return;
  viralLibrary = viralLibrary.filter(p => p.id !== id);
  renderViralLib();
}

async function runRemix() {
  const niche = document.getElementById('remix-niche').value.trim();
  const text = document.getElementById('remix-input').value.trim();
  if (!text) { showToast('Paste a post to remix'); return; }
  setLoading('remix', true);
  try {
    const data = await callClaude('viral', text, { niche: niche || 'general' });
    showOutput('remix', formatRemixes(data));
    incrementCount();
    addToHistory('viral', text, data);
  } catch(e) { if (!e.handled) showToast(e.message); }
  setLoading('remix', false);
}

function switchTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function incrementCount() {
  contentCount++;
  document.getElementById('content-count').textContent = contentCount;
  updateOnboarding();
}

// Slug -> display metadata. The slug is what goes in generations.tool and is the
// same one callClaude() uses, so the DB, the API and the UI all agree on one key.
const TOOL_META = {
  caption: { label: 'Caption Writer',    badge: 'badge-caption' },
  algo:    { label: 'Algo Analyzer',     badge: 'badge-algo'    },
  history: { label: "What's Working",   badge: 'badge-history' },
  brain:   { label: 'Brain Dump',        badge: 'badge-brain'   },
  comment: { label: 'Comment Reply',     badge: 'badge-comment' },
  viral:   { label: 'Viral Inspiration', badge: 'badge-viral'   },
};

// Most recent inserted row per tool, so the Save button can flag that row
// instead of writing a second, duplicate history entry.
const lastGenIds = {};

// Renders optimistically, then persists. A slow insert never blocks the creator,
// and recordGeneration() surfaces its own toast if the save genuinely fails.
async function addToHistory(slug, input, output) {
  const preview = String(input ?? '').substring(0, 60);
  const row = {
    id: null, tool: slug, input, output, preview,
    saved: false, created_at: new Date().toISOString(),
  };
  contentHistory.unshift(row);
  renderHistoryViews();

  const saved = await recordGeneration(slug, input, output, preview);
  if (saved) {
    row.id = saved.id;
    row.created_at = saved.created_at;
    lastGenIds[slug] = saved.id;
    renderHistoryViews(); // it now has an id, so it becomes tappable
  }
}

function renderRecentList() {
  const list = document.getElementById('recent-list');
  if (contentHistory.length === 0) {
    list.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;text-align:center;padding:24px 0;">Your AI-generated content will appear here.<br>Start with a tool to see your history.</div>';
    return;
  }
  // Rows without an id haven't finished saving yet, so there's nothing to open.
  list.innerHTML = contentHistory.slice(0, 8).map(historyRow).join('');
}

// Both views read the same contentHistory array, so always redraw them together.
function renderHistoryViews() {
  renderRecentList();
  renderHistoryPage();
}

// One row renderer shared by the dashboard's Recent Activity and the My History
// page, so the two can never drift apart.
function historyRow(r) {
  const meta = TOOL_META[r.tool] || { label: r.tool, badge: 'badge-brain' };
  const d = new Date(r.created_at);
  const time = d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' · ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const open = r.id ? ` onclick="viewGeneration('${escapeAttr(r.id)}')" style="cursor:pointer"` : '';
  return `
    <div class="recent-item fade-in"${open}>
      <span class="recent-tool-badge ${meta.badge}">${escapeHtml(meta.label)}</span>
      <div class="recent-text">
        <strong>${escapeHtml(r.preview || meta.label)}${r.preview ? '…' : ''}</strong>
        <div class="recent-time">${time}${r.saved ? ' · ★ saved' : ''}${r.id ? ' · tap to view' : ' · saving…'}</div>
      </div>
    </div>`;
}

// --- My History page ---------------------------------------------------------
let historyFilter = 'all';

function filterHistory(which, el) {
  historyFilter = which;
  document.querySelectorAll('#history-filters .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderHistoryPage();
}

function renderHistoryPage() {
  const list = document.getElementById('history-page-list');
  if (!list) return;
  const rows = contentHistory.filter(r =>
    historyFilter === 'all' ? true :
    historyFilter === 'saved' ? r.saved :
    r.tool === historyFilter);

  if (!rows.length) {
    const msg = contentHistory.length
      ? 'Nothing here yet with that filter.'
      : "You haven't generated anything yet. Pick a tool and it'll show up here.";
    list.innerHTML = `<div style="color:var(--muted);font-size:0.85rem;text-align:center;padding:40px 0;">${msg}</div>`;
    return;
  }
  list.innerHTML = rows.map(historyRow).join('');
}

// --- generation viewer -------------------------------------------------------
// Every tool's structured output already has a formatter (used to render the
// live result), so re-use those rather than inventing a second rendering path.
const TOOL_FORMATTERS = {
  caption: formatCaptions,
  algo:    formatAlgo,
  history: formatHistoryAnalysis,
  brain:   formatPlan,
  comment: formatReplies,
  viral:   formatRemixes,
};

let openGenerationId = null;

function viewGeneration(id) {
  const row = contentHistory.find(r => r.id === id);
  if (!row) { showToast("Couldn't find that one"); return; }
  openGenerationId = id;

  const meta = TOOL_META[row.tool] || { label: row.tool, badge: 'badge-brain' };
  document.getElementById('gen-modal-title').textContent = meta.label;
  document.getElementById('gen-modal-time').textContent =
    new Date(row.created_at).toLocaleString([], {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  document.getElementById('gen-modal-input').textContent = row.input || '(no input recorded)';

  // A formatter can throw if an older row's shape doesn't match what it expects —
  // fall back to the raw JSON rather than showing the user an empty box.
  let text;
  try {
    const fmt = TOOL_FORMATTERS[row.tool];
    text = fmt ? fmt(row.output) : JSON.stringify(row.output, null, 2);
  } catch (e) {
    console.error('viewGeneration format', e);
    text = typeof row.output === 'string' ? row.output : JSON.stringify(row.output, null, 2);
  }
  document.getElementById('gen-modal-output').textContent = text;
  document.getElementById('gen-modal-star').textContent = row.saved ? '★ Saved — unsave' : '☆ Save';
  document.getElementById('gen-modal').style.display = 'block';
}

function hideGeneration() {
  document.getElementById('gen-modal').style.display = 'none';
  openGenerationId = null;
}

async function toggleSavedFromModal() {
  const row = contentHistory.find(r => r.id === openGenerationId);
  if (!row) return;
  const next = !row.saved;
  await setSaved(row.id, next);
  row.saved = next;
  document.getElementById('gen-modal-star').textContent = next ? '★ Saved — unsave' : '☆ Save';
  renderHistoryViews();
}

async function deleteFromModal() {
  const row = contentHistory.find(r => r.id === openGenerationId);
  if (!row) return;
  await deleteGeneration(row.id);
  contentHistory = contentHistory.filter(r => r.id !== row.id);
  contentCount = Math.max(0, contentCount - 1);
  document.getElementById('content-count').textContent = contentCount;
  hideGeneration();
  renderHistoryViews();
  showToast('Deleted', 'success');
}

// Escape closes the viewer, matching the click-outside behaviour.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && openGenerationId) hideGeneration();
});

function copyOutput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent || el.innerText).then(() => {
    showToast('✅ Copied to clipboard!', 'success');
  });
}

function copyText(btn) {
  navigator.clipboard.writeText(btn.dataset.text).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

// Every generation is already in history, so "Save" stars the existing row rather
// than inserting a duplicate. Takes the tool slug (see TOOL_META).
async function saveToHistory(outputId, slug) {
  const id = lastGenIds[slug];
  if (!id) { showToast("Still saving that one — try again in a moment"); return; }
  await setSaved(id, true);
  const row = contentHistory.find(r => r.id === id);
  if (row) { row.saved = true; renderHistoryViews(); }
  showToast('✅ Saved to your history!', 'success');
}

// --- usage gate UI -----------------------------------------------------------
// The server (claude-proxy + _shared/usage-gate.ts) is the source of truth;
// these constants only mirror LIMITS.trial for the on-load indicator. Both caps
// matter: the whole-trial total bites before the daily one on the last day.
const TRIAL_DAILY_LIMIT = 10;
const TRIAL_TOTAL_LIMIT = 25;

function showLimitModal(data) {
  document.getElementById('limit-modal-msg').textContent = data.error || "You've hit your generation limit.";
  // Pro users hit a fair-use cap — there's nothing to upgrade to, so no CTA.
  document.getElementById('limit-modal-cta').style.display = data.plan === 'pro' ? 'none' : '';
  document.getElementById('limit-modal').style.display = 'flex';
  updateUsageIndicator(0, data.plan);
}

function hideLimitModal() {
  document.getElementById('limit-modal').style.display = 'none';
}

// `scope` says which cap is the binding one, so the wording stays truthful:
// "left today" resets tomorrow, "left in your trial" does not.
function updateUsageIndicator(remaining, plan, scope = 'today') {
  const el = document.getElementById('usage-indicator');
  const stat = document.getElementById('stat-plan');
  if (plan === 'trial' && typeof remaining === 'number') {
    const when = scope === 'trial' ? 'left in your trial' : 'left today';
    el.textContent = remaining === 0
      ? `No trial generations ${when}`
      : `⚡ ${remaining} trial generation${remaining === 1 ? '' : 's'} ${when}`;
    el.style.display = '';
    if (stat) stat.textContent = 'Trial';
  } else {
    el.style.display = 'none';
    if (stat && plan === 'pro') stat.textContent = '✓ Pro';
  }
}

// On load, read today's count directly (RLS scopes the query to the signed-in
// user) so trial users see what's left before their first generation.
async function loadUsageIndicator() {
  if (!currentProfile) return;
  const plan = currentProfile.subscription_status === 'trialing' ? 'trial'
    : currentProfile.subscription_status === 'active' ? 'pro' : null;
  if (!plan) return;
  if (plan === 'pro') { updateUsageIndicator(null, 'pro'); return; }
  // Pull every day's row (RLS scopes it to this user) so we can apply the same
  // two caps the server does, and show whichever one is closer.
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows } = await sb.from('usage').select('date, count');
  const todayCount = (rows ?? []).find(r => r.date === today)?.count ?? 0;
  const totalCount = (rows ?? []).reduce((sum, r) => sum + r.count, 0);

  const leftToday = Math.max(0, TRIAL_DAILY_LIMIT - todayCount);
  const leftTotal = Math.max(0, TRIAL_TOTAL_LIMIT - totalCount);
  updateUsageIndicator(
    Math.min(leftToday, leftTotal),
    'trial',
    leftTotal < leftToday ? 'trial' : 'today',
  );
}

function showToast(msg, type = 'error') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast visible ' + (type === 'success' ? 'success' : '');
  setTimeout(() => t.classList.remove('visible'), 3500);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str) {
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

init();
