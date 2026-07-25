let contentCount = parseInt(localStorage.getItem('rr_count') || '0');
let contentHistory = JSON.parse(localStorage.getItem('rr_history') || '[]');
let viralLibrary = JSON.parse(localStorage.getItem('rr_viral') || '[]');

function init() {
  document.getElementById('content-count').textContent = contentCount;
  renderRecentList();
  renderViralLib();
  updateOnboarding();
  initAuth();
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

function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('main').scrollTop = 0;
}

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
    addToHistory('Caption Writer', text.substring(0,60), 'badge-caption');
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
    addToHistory('Algo Analyzer', text.substring(0,60), 'badge-algo');
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
    addToHistory('Post History', text.substring(0,60), 'badge-history');
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
    addToHistory('Brain Dump', text.substring(0,60), 'badge-brain');
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
    addToHistory('Comment Reply', comments[0].substring(0,60), 'badge-comment');
  } catch(e) { if (!e.handled) showToast(e.message); }
  setLoading('comment', false);
}

function saveViralPost() {
  const text = document.getElementById('viral-save-input').value.trim();
  if (!text) { showToast('Paste a post to save'); return; }
  const plat = getActiveChip('viral-plat');
  const note = document.getElementById('viral-note-input').value.trim();
  const post = { id: Date.now(), platform: plat, text, note, saved: new Date().toLocaleDateString() };
  viralLibrary.unshift(post);
  localStorage.setItem('rr_viral', JSON.stringify(viralLibrary));
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
  el.innerHTML = '<div class="viral-lib">' + viralLibrary.map(p => `
    <div class="viral-card">
      <div class="viral-card-platform">${p.platform} · ${p.saved}</div>
      <div class="viral-card-text">${escapeHtml(p.text.substring(0,120))}${p.text.length > 120 ? '...' : ''}</div>
      ${p.note ? `<div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;">💡 ${escapeHtml(p.note)}</div>` : ''}
      <div class="viral-card-actions">
        <button class="btn-sm" data-text="${escapeAttr(p.text)}" onclick="copyText(this)">Copy</button>
        <button class="btn-sm" onclick="prefillRemix(${p.id})">Remix</button>
        <button class="btn-sm" onclick="deleteViral(${p.id})" style="color:var(--red)">Delete</button>
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

function deleteViral(id) {
  viralLibrary = viralLibrary.filter(p => p.id !== id);
  localStorage.setItem('rr_viral', JSON.stringify(viralLibrary));
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
    addToHistory('Viral Inspiration', text.substring(0,60), 'badge-viral');
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
  localStorage.setItem('rr_count', contentCount);
  document.getElementById('content-count').textContent = contentCount;
  updateOnboarding();
}

function addToHistory(tool, preview, badgeClass) {
  const record = { tool, preview, badgeClass, time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) };
  contentHistory.unshift(record);
  if (contentHistory.length > 20) contentHistory.pop();
  localStorage.setItem('rr_history', JSON.stringify(contentHistory));
  renderRecentList();
}

function renderRecentList() {
  const list = document.getElementById('recent-list');
  if (contentHistory.length === 0) {
    list.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;text-align:center;padding:24px 0;">Your AI-generated content will appear here.<br>Start with a tool to see your history.</div>';
    return;
  }
  list.innerHTML = contentHistory.slice(0,5).map(r => `
    <div class="recent-item fade-in">
      <span class="recent-tool-badge ${r.badgeClass}">${r.tool}</span>
      <div class="recent-text">
        <strong>${escapeHtml(r.tool)}</strong>
        ${escapeHtml(r.preview)}...
        <div class="recent-time">${r.time}</div>
      </div>
    </div>
  `).join('');
}

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

const toolBadges = {
  'Caption Writer': 'badge-caption',
  'Algo Analyzer': 'badge-algo',
  'Post History': 'badge-history',
  'Brain Dump': 'badge-brain',
  'Comment Reply': 'badge-comment',
  'Viral Inspiration': 'badge-viral'
};

function saveToHistory(id, tool) {
  const text = document.getElementById(id)?.textContent;
  if (text) addToHistory(tool, text.substring(0,60), toolBadges[tool] || 'badge-brain');
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
